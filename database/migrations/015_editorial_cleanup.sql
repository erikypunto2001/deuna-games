-- Mantenimiento editorial seguro: borrado definitivo de juegos creados
-- desde Admin y compactación del historial conservando el estado actual.

ALTER TABLE deuna_admin.editorial_revisions
  DROP CONSTRAINT IF EXISTS editorial_revisions_action_check,
  ADD CONSTRAINT editorial_revisions_action_check CHECK (
    action IN (
      'imported',
      'source_refreshed',
      'created',
      'draft_saved',
      'draft_restored',
      'baseline'
    )
  );

ALTER TABLE deuna_admin.editorial_publications
  DROP CONSTRAINT IF EXISTS editorial_publications_action_check,
  ADD CONSTRAINT editorial_publications_action_check CHECK (
    action IN ('bootstrap', 'published', 'rollback', 'baseline')
  );

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
  home_history_refs integer := 0;
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

  SELECT count(*)::integer
    INTO home_history_refs
    FROM (
      SELECT revision.payload
        FROM deuna_admin.editorial_revisions AS revision
        INNER JOIN deuna_admin.editorial_items AS home
          ON home.id = revision.item_id
       WHERE home.item_type = 'home_config'
         AND home.item_key = 'home'
      UNION ALL
      SELECT publication.payload
        FROM deuna_admin.editorial_publications AS publication
        INNER JOIN deuna_admin.editorial_items AS home
          ON home.id = publication.item_id
       WHERE home.item_type = 'home_config'
         AND home.item_key = 'home'
    ) AS history
   WHERE
     COALESCE(history.payload -> 'heroSlugs', '[]'::jsonb) ? p_game_slug
     OR COALESCE(history.payload -> 'popularSlugs', '[]'::jsonb) ? p_game_slug
     OR COALESCE(history.payload -> 'lowSpecSlugs', '[]'::jsonb) ? p_game_slug
     OR COALESCE(history.payload -> 'recommendedSlugs', '[]'::jsonb) ? p_game_slug;

  IF home_history_refs > 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'home_history_reference',
      'historicalReferences', home_history_refs
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

CREATE OR REPLACE FUNCTION deuna_admin.compact_editorial_history(
  p_actor_user_id uuid,
  p_session_token text,
  p_expected_items integer,
  p_expected_revisions integer,
  p_expected_publications integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
DECLARE
  item record;
  current_items integer;
  revision_before integer;
  publication_before integer;
  revision_after integer := 0;
  publication_after integer := 0;
  panel_created boolean;
  ever_published boolean;
BEGIN
  IF p_expected_items < 0
     OR p_expected_revisions < 0
     OR p_expected_publications < 0 THEN
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

  LOCK TABLE deuna_admin.editorial_items IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE deuna_admin.editorial_revisions IN EXCLUSIVE MODE;
  LOCK TABLE deuna_admin.editorial_publications IN EXCLUSIVE MODE;

  SELECT count(*)::integer
    INTO current_items
    FROM deuna_admin.editorial_items;
  SELECT count(*)::integer
    INTO revision_before
    FROM deuna_admin.editorial_revisions;
  SELECT count(*)::integer
    INTO publication_before
    FROM deuna_admin.editorial_publications;

  IF current_items <> p_expected_items
     OR revision_before <> p_expected_revisions
     OR publication_before <> p_expected_publications THEN
    RETURN jsonb_build_object(
      'outcome', 'conflict',
      'items', current_items,
      'revisions', revision_before,
      'publications', publication_before
    );
  END IF;

  CREATE TEMP TABLE editorial_history_compaction_state
  ON COMMIT DROP
  AS
  SELECT
    editorial.id,
    editorial.item_type,
    editorial.item_key,
    editorial.source_payload,
    editorial.source_present,
    editorial.draft_payload,
    editorial.revision,
    editorial.updated_by,
    editorial.updated_at,
    editorial.published_payload,
    editorial.published_checksum,
    editorial.publication_number,
    editorial.published_by,
    editorial.published_at,
    EXISTS (
      SELECT 1
        FROM deuna_admin.editorial_publications AS publication
       WHERE publication.item_id = editorial.id
         AND publication.action IN ('published', 'rollback', 'baseline')
    ) AS ever_published
  FROM deuna_admin.editorial_items AS editorial;

  DELETE FROM deuna_admin.editorial_revisions;
  DELETE FROM deuna_admin.editorial_publications;

  UPDATE deuna_admin.editorial_items
     SET published_from_revision = NULL;

  FOR item IN
    SELECT *
      FROM pg_temp.editorial_history_compaction_state
     ORDER BY item_type, item_key
  LOOP
    panel_created :=
      item.source_present = false
      AND item.source_payload = '{}'::jsonb;

    INSERT INTO deuna_admin.editorial_revisions (
      item_id,
      revision,
      payload,
      action,
      actor_user_id,
      created_at
    )
    VALUES (
      item.id,
      item.revision,
      item.draft_payload,
      'baseline',
      item.updated_by,
      item.updated_at
    );
    revision_after := revision_after + 1;

    ever_published := item.ever_published;

    INSERT INTO deuna_admin.editorial_publications (
      item_id,
      publication_number,
      payload,
      checksum,
      source_revision,
      action,
      actor_user_id,
      created_at
    )
    VALUES (
      item.id,
      item.publication_number,
      item.published_payload,
      item.published_checksum,
      NULL,
      CASE
        WHEN panel_created AND NOT ever_published THEN 'bootstrap'
        ELSE 'baseline'
      END,
      item.published_by,
      item.published_at
    );
    publication_after := publication_after + 1;
  END LOOP;

  INSERT INTO deuna_admin.admin_audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    p_actor_user_id,
    'editorial_history_compacted',
    'editorial_history',
    NULL,
    jsonb_build_object(
      'items', current_items,
      'revisionsBefore', revision_before,
      'revisionsAfter', revision_after,
      'publicationsBefore', publication_before,
      'publicationsAfter', publication_after
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'compacted',
    'items', current_items,
    'revisionsBefore', revision_before,
    'revisionsAfter', revision_after,
    'publicationsBefore', publication_before,
    'publicationsAfter', publication_after
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.compact_editorial_history(
  uuid, text, integer, integer, integer
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION deuna_admin.compact_editorial_item_history(
  p_item_type text,
  p_item_key text,
  p_actor_user_id uuid,
  p_session_token text,
  p_expected_revisions integer,
  p_expected_publications integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
DECLARE
  target deuna_admin.editorial_items%ROWTYPE;
  revision_before integer;
  publication_before integer;
  panel_created boolean;
  ever_published boolean;
BEGIN
  IF p_item_type IS NULL
     OR p_item_key IS NULL
     OR char_length(p_item_type) NOT BETWEEN 1 AND 30
     OR char_length(p_item_key) NOT BETWEEN 1 AND 160
     OR p_expected_revisions < 0
     OR p_expected_publications < 0 THEN
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
   WHERE item_type = p_item_type
     AND item_key = p_item_key
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  SELECT count(*)::integer
    INTO revision_before
    FROM deuna_admin.editorial_revisions
   WHERE item_id = target.id;
  SELECT count(*)::integer
    INTO publication_before
    FROM deuna_admin.editorial_publications
   WHERE item_id = target.id;

  IF revision_before <> p_expected_revisions
     OR publication_before <> p_expected_publications THEN
    RETURN jsonb_build_object(
      'outcome', 'conflict',
      'revisions', revision_before,
      'publications', publication_before
    );
  END IF;

  panel_created :=
    target.source_present = false
    AND target.source_payload = '{}'::jsonb;

  SELECT EXISTS (
    SELECT 1
      FROM deuna_admin.editorial_publications AS publication
     WHERE publication.item_id = target.id
       AND publication.action IN ('published', 'rollback', 'baseline')
  )
  INTO ever_published;

  DELETE FROM deuna_admin.editorial_revisions
   WHERE item_id = target.id;
  DELETE FROM deuna_admin.editorial_publications
   WHERE item_id = target.id;

  UPDATE deuna_admin.editorial_items
     SET published_from_revision = NULL
   WHERE id = target.id;

  INSERT INTO deuna_admin.editorial_revisions (
    item_id,
    revision,
    payload,
    action,
    actor_user_id,
    created_at
  )
  VALUES (
    target.id,
    target.revision,
    target.draft_payload,
    'baseline',
    target.updated_by,
    target.updated_at
  );

  INSERT INTO deuna_admin.editorial_publications (
    item_id,
    publication_number,
    payload,
    checksum,
    source_revision,
    action,
    actor_user_id,
    created_at
  )
  VALUES (
    target.id,
    target.publication_number,
    target.published_payload,
    target.published_checksum,
    NULL,
    CASE
      WHEN panel_created AND NOT ever_published THEN 'bootstrap'
      ELSE 'baseline'
    END,
    target.published_by,
    target.published_at
  );

  INSERT INTO deuna_admin.admin_audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    p_actor_user_id,
    'editorial_item_history_compacted',
    p_item_type,
    p_item_key,
    jsonb_build_object(
      'revisionsBefore', revision_before,
      'revisionsAfter', 1,
      'publicationsBefore', publication_before,
      'publicationsAfter', 1
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'compacted',
    'revisionsBefore', revision_before,
    'revisionsAfter', 1,
    'publicationsBefore', publication_before,
    'publicationsAfter', 1
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.compact_editorial_item_history(
  text, text, uuid, text, integer, integer
) FROM PUBLIC;
