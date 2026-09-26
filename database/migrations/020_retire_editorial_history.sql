-- Retira definitivamente el historial editorial restaurable de todo el panel.
-- Desde esta migración, editorial_items conserva únicamente el borrador y la
-- publicación vigentes. revision/publication_number siguen siendo contadores de
-- concurrencia y trazabilidad operativa, no referencias a snapshots antiguos.

DROP FUNCTION IF EXISTS deuna_admin.compact_editorial_publication_history(
  text, text, uuid, text, integer
);
DROP FUNCTION IF EXISTS deuna_admin.compact_editorial_item_history(
  text, text, uuid, text, integer, integer
);
DROP FUNCTION IF EXISTS deuna_admin.compact_editorial_history(
  uuid, text, integer, integer, integer
);

DROP TRIGGER IF EXISTS editorial_revisions_reject_game_history
  ON deuna_admin.editorial_revisions;
DROP TRIGGER IF EXISTS editorial_publications_reject_game_history
  ON deuna_admin.editorial_publications;
DROP FUNCTION IF EXISTS deuna_admin.reject_game_editorial_history();

-- La limpieza masiva es intencional: no se conserva baseline restaurable.
DROP TABLE IF EXISTS deuna_admin.editorial_revisions;
DROP TABLE IF EXISTS deuna_admin.editorial_publications;

-- La eliminación definitiva de juegos sólo considera referencias vigentes.
-- Ya no existe historial de Inicio capaz de reintroducir un slug antiguo.
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

  IF target.source_present
     OR target.source_payload <> '{}'::jsonb THEN
    RETURN jsonb_build_object('outcome', 'source_managed');
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
      'publicationNumber', target.publication_number
    )
  );

  DELETE FROM deuna_admin.editorial_items
   WHERE id = target.id;

  RETURN jsonb_build_object(
    'outcome', 'deleted',
    'updatesDeleted', update_count,
    'preferencesDeleted', preference_count,
    'ratingsDeleted', rating_count,
    'insightSnapshotsDeleted', insight_count
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.delete_panel_game(
  text, uuid, text, integer, integer
) FROM PUBLIC;
