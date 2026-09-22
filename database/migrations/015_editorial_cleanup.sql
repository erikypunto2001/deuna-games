-- Mantenimiento editorial seguro: borrado definitivo de juegos creados
-- desde Admin y compactación del historial conservando el estado actual.

CREATE OR REPLACE FUNCTION deuna_admin.delete_panel_game(
  p_game_slug text,
  p_actor_user_id uuid,
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

  IF NOT EXISTS (
    SELECT 1
      FROM deuna_admin.admin_users
     WHERE id = p_actor_user_id
       AND role = 'owner'
       AND active = true
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

  -- Los juegos respaldados por archivos fuente no pueden eliminarse sólo
  -- desde PostgreSQL: el importador/fallback podría recrearlos.
  IF target.source_present
     OR target.source_payload <> '{}'::jsonb THEN
    RETURN jsonb_build_object('outcome', 'source_managed');
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
  SELECT count(*)::integer INTO update_count FROM deleted;

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
      'wasPublicVisible', target.public_visible
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
  text, uuid, integer, integer
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION deuna_admin.compact_editorial_history(
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
DECLARE
  item record;
  revision_before integer;
  publication_before integer;
  revision_after integer := 0;
  publication_after integer := 0;
  item_count integer := 0;
  panel_created boolean;
  ever_published boolean;
  revision_action text;
  publication_action text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM deuna_admin.admin_users
     WHERE id = p_actor_user_id
       AND role = 'owner'
       AND active = true
  ) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  LOCK TABLE deuna_admin.editorial_items IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE deuna_admin.editorial_revisions IN EXCLUSIVE MODE;
  LOCK TABLE deuna_admin.editorial_publications IN EXCLUSIVE MODE;

  SELECT count(*)::integer
    INTO revision_before
    FROM deuna_admin.editorial_revisions;

  SELECT count(*)::integer
    INTO publication_before
    FROM deuna_admin.editorial_publications;

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
    editorial.published_from_revision,
    editorial.publication_number,
    editorial.published_by,
    editorial.published_at,
    EXISTS (
      SELECT 1
        FROM deuna_admin.editorial_publications AS publication
       WHERE publication.item_id = editorial.id
         AND publication.action IN ('published', 'rollback')
    ) AS ever_published
  FROM deuna_admin.editorial_items AS editorial;

  DELETE FROM deuna_admin.editorial_revisions;
  DELETE FROM deuna_admin.editorial_publications;

  FOR item IN
    SELECT *
      FROM editorial_history_compaction_state
     ORDER BY item_type, item_key
  LOOP
    item_count := item_count + 1;
    panel_created :=
      item.source_present = false
      AND item.source_payload = '{}'::jsonb;

    revision_action := CASE
      WHEN panel_created THEN 'draft_saved'
      WHEN item.revision = 1 THEN 'imported'
      ELSE 'source_refreshed'
    END;

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
      revision_action,
      item.updated_by,
      item.updated_at
    );
    revision_after := revision_after + 1;

    ever_published := item.ever_published;
    publication_action := CASE
      WHEN panel_created AND NOT ever_published THEN 'bootstrap'
      WHEN NOT ever_published AND item.publication_number = 1 THEN 'bootstrap'
      ELSE 'published'
    END;

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
      item.published_from_revision,
      publication_action,
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
      'items', item_count,
      'revisionsBefore', revision_before,
      'revisionsAfter', revision_after,
      'publicationsBefore', publication_before,
      'publicationsAfter', publication_after
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'compacted',
    'items', item_count,
    'revisionsBefore', revision_before,
    'revisionsAfter', revision_after,
    'publicationsBefore', publication_before,
    'publicationsAfter', publication_after
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.compact_editorial_history(uuid)
  FROM PUBLIC;
