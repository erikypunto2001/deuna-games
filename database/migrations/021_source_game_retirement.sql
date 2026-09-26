-- Permite retirar definitivamente desde Admin juegos originados en la fuente.
-- El retiro es estado operativo actual: impide reimportación, no conserva
-- snapshots ni habilita restauración editorial.

CREATE TABLE IF NOT EXISTS deuna_admin.source_game_retirements (
  game_slug varchar(160) PRIMARY KEY,
  retired_at timestamptz NOT NULL DEFAULT now(),
  retired_by uuid REFERENCES deuna_admin.admin_users(id) ON DELETE SET NULL,
  CONSTRAINT source_game_retirements_slug_check CHECK (
    game_slug ~ '^[a-z0-9][a-z0-9._-]{0,159}$'
  )
);

REVOKE ALL ON deuna_admin.source_game_retirements FROM PUBLIC;

COMMENT ON TABLE deuna_admin.source_game_retirements IS
  'Juegos fuente retirados explícitamente desde Admin para impedir que el importador los recree.';

CREATE OR REPLACE FUNCTION deuna_admin.list_source_game_retirements()
RETURNS TABLE (game_slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
  SELECT retirement.game_slug::text
    FROM deuna_admin.source_game_retirements AS retirement
   ORDER BY retirement.game_slug ASC;
$$;

REVOKE ALL ON FUNCTION deuna_admin.list_source_game_retirements()
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION deuna_admin.enqueue_deleted_game_media_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
BEGIN
  IF OLD.item_type = 'game' THEN
    INSERT INTO deuna_admin.game_media_cleanup_queue (
      game_slug,
      created_at,
      last_attempt_at,
      attempts
    )
    VALUES (
      OLD.item_key,
      now(),
      NULL,
      0
    )
    ON CONFLICT (game_slug)
    DO UPDATE SET
      created_at = EXCLUDED.created_at,
      last_attempt_at = NULL,
      attempts = 0;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.enqueue_deleted_game_media_cleanup()
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION deuna_admin.delete_panel_game(
  p_game_slug text,
  p_actor_user_id uuid,
  p_session_token text,
  p_expected_revision integer,
  p_expected_publication_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin, deuna_accounts
AS $$
DECLARE
  target deuna_admin.editorial_items%ROWTYPE;
  update_count integer := 0;
  preference_count integer := 0;
  rating_count integer := 0;
  insight_count integer := 0;
  home_draft_refs integer := 0;
  home_published_refs integer := 0;
  source_backed boolean := false;
BEGIN
  IF p_game_slug IS NULL
     OR p_game_slug !~ '^[a-z0-9][a-z0-9._-]{0,159}$'
     OR p_expected_revision < 1
     OR p_expected_publication_number < 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;

  IF p_session_token IS NULL
     OR p_session_token !~ '^[A-Za-z0-9_-]{43}$'
     OR NOT EXISTS (
       SELECT 1
         FROM deuna_admin.admin_sessions AS session
         INNER JOIN deuna_admin.admin_users AS account
           ON account.id = session.user_id
        WHERE session.token_hash = encode(
          sha256(convert_to(p_session_token, 'UTF8')),
          'hex'
        )
          AND session.user_id = p_actor_user_id
          AND session.revoked_at IS NULL
          AND session.expires_at > now()
          AND account.role = 'owner'
          AND account.active = true
     ) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  SELECT *
    INTO target
    FROM deuna_admin.editorial_items
   WHERE item_type = 'game'
     AND item_key = p_game_slug
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF target.revision <> p_expected_revision
     OR target.publication_number <> p_expected_publication_number THEN
    RETURN jsonb_build_object(
      'outcome', 'conflict',
      'revision', target.revision,
      'publicationNumber', target.publication_number
    );
  END IF;

  IF target.public_visible THEN
    RETURN jsonb_build_object('outcome', 'still_public');
  END IF;

  SELECT
    count(*) FILTER (
      WHERE
        COALESCE(home.draft_payload -> 'heroSlugs', '[]'::jsonb) ? p_game_slug
        OR COALESCE(home.draft_payload -> 'popularSlugs', '[]'::jsonb) ? p_game_slug
        OR COALESCE(home.draft_payload -> 'lowSpecSlugs', '[]'::jsonb) ? p_game_slug
        OR COALESCE(home.draft_payload -> 'recommendedSlugs', '[]'::jsonb) ? p_game_slug
    ),
    count(*) FILTER (
      WHERE
        COALESCE(home.published_payload -> 'heroSlugs', '[]'::jsonb) ? p_game_slug
        OR COALESCE(home.published_payload -> 'popularSlugs', '[]'::jsonb) ? p_game_slug
        OR COALESCE(home.published_payload -> 'lowSpecSlugs', '[]'::jsonb) ? p_game_slug
        OR COALESCE(home.published_payload -> 'recommendedSlugs', '[]'::jsonb) ? p_game_slug
    )
    INTO home_draft_refs, home_published_refs
    FROM deuna_admin.editorial_items AS home
   WHERE home.item_type = 'home_config'
     AND home.item_key = 'home';

  IF home_draft_refs > 0 OR home_published_refs > 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'home_reference',
      'draftReferences', home_draft_refs,
      'publishedReferences', home_published_refs
    );
  END IF;

  source_backed :=
    target.source_present
    OR target.source_payload <> '{}'::jsonb;

  IF source_backed THEN
    INSERT INTO deuna_admin.source_game_retirements (
      game_slug,
      retired_at,
      retired_by
    )
    VALUES (
      p_game_slug,
      now(),
      p_actor_user_id
    )
    ON CONFLICT (game_slug)
    DO UPDATE SET
      retired_at = EXCLUDED.retired_at,
      retired_by = EXCLUDED.retired_by;
  END IF;

  WITH deleted AS (
    DELETE FROM deuna_admin.editorial_items
     WHERE item_type = 'game_update'
       AND (
         source_payload ->> 'gameSlug' = p_game_slug
         OR draft_payload ->> 'gameSlug' = p_game_slug
         OR published_payload ->> 'gameSlug' = p_game_slug
       )
     RETURNING id
  )
  SELECT count(*)::integer
    INTO update_count
    FROM deleted;

  DELETE FROM deuna_accounts.game_preferences
   WHERE game_slug = p_game_slug;
  GET DIAGNOSTICS preference_count = ROW_COUNT;

  DELETE FROM deuna_accounts.game_ratings
   WHERE game_slug = p_game_slug;
  GET DIAGNOSTICS rating_count = ROW_COUNT;

  DELETE FROM deuna_admin.game_insight_scores
   WHERE game_slug = p_game_slug;
  GET DIAGNOSTICS insight_count = ROW_COUNT;

  INSERT INTO deuna_admin.admin_audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    p_actor_user_id,
    'content_deleted',
    'game',
    p_game_slug,
    jsonb_build_object(
      'updatesDeleted', update_count,
      'preferencesDeleted', preference_count,
      'ratingsDeleted', rating_count,
      'insightSnapshotsDeleted', insight_count,
      'revision', target.revision,
      'publicationNumber', target.publication_number,
      'sourceRetired', source_backed
    )
  );

  DELETE FROM deuna_admin.editorial_items
   WHERE id = target.id;

  RETURN jsonb_build_object(
    'outcome', 'deleted',
    'updatesDeleted', update_count,
    'preferencesDeleted', preference_count,
    'ratingsDeleted', rating_count,
    'insightSnapshotsDeleted', insight_count,
    'sourceRetired', source_backed
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.delete_panel_game(
  text, uuid, text, integer, integer
) FROM PUBLIC;
