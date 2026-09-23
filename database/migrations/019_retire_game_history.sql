-- Los juegos conservan únicamente su estado editorial actual.
-- El historial restaurable continúa disponible para las demás superficies.

CREATE OR REPLACE FUNCTION deuna_admin.reject_game_editorial_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
DECLARE
  target_type text;
BEGIN
  SELECT item_type
    INTO target_type
    FROM deuna_admin.editorial_items
   WHERE id = NEW.item_id;

  IF target_type = 'game' THEN
    RAISE EXCEPTION 'Los juegos no admiten historial editorial restaurable.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.reject_game_editorial_history()
FROM PUBLIC;

DELETE FROM deuna_admin.editorial_revisions AS revision
USING deuna_admin.editorial_items AS item
WHERE revision.item_id = item.id
  AND item.item_type = 'game';

DELETE FROM deuna_admin.editorial_publications AS publication
USING deuna_admin.editorial_items AS item
WHERE publication.item_id = item.id
  AND item.item_type = 'game';

DROP TRIGGER IF EXISTS editorial_revisions_reject_game_history
  ON deuna_admin.editorial_revisions;
CREATE TRIGGER editorial_revisions_reject_game_history
BEFORE INSERT OR UPDATE OF item_id
ON deuna_admin.editorial_revisions
FOR EACH ROW
EXECUTE FUNCTION deuna_admin.reject_game_editorial_history();

DROP TRIGGER IF EXISTS editorial_publications_reject_game_history
  ON deuna_admin.editorial_publications;
CREATE TRIGGER editorial_publications_reject_game_history
BEFORE INSERT OR UPDATE OF item_id
ON deuna_admin.editorial_publications
FOR EACH ROW
EXECUTE FUNCTION deuna_admin.reject_game_editorial_history();

-- Ya no existe una operación separada de compactación de publicaciones de
-- juegos: no hay snapshots históricos que compactar ni restaurar.
DROP FUNCTION IF EXISTS deuna_admin.compact_editorial_publication_history(
  text, text, uuid, text, integer
);

-- La compactación general conserva un baseline por elemento únicamente para
-- superficies que sí mantienen historial. Los juegos quedan deliberadamente
-- fuera tanto del borrado como de la reconstrucción de snapshots históricos.
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
    FROM deuna_admin.editorial_items
   WHERE item_type <> 'game';

  SELECT count(*)::integer
    INTO revision_before
    FROM deuna_admin.editorial_revisions AS revision
    INNER JOIN deuna_admin.editorial_items AS editorial
      ON editorial.id = revision.item_id
   WHERE editorial.item_type <> 'game';

  SELECT count(*)::integer
    INTO publication_before
    FROM deuna_admin.editorial_publications AS publication
    INNER JOIN deuna_admin.editorial_items AS editorial
      ON editorial.id = publication.item_id
   WHERE editorial.item_type <> 'game';

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
  FROM deuna_admin.editorial_items AS editorial
  WHERE editorial.item_type <> 'game';

  DELETE FROM deuna_admin.editorial_revisions AS revision
  USING deuna_admin.editorial_items AS editorial
  WHERE revision.item_id = editorial.id
    AND editorial.item_type <> 'game';

  DELETE FROM deuna_admin.editorial_publications AS publication
  USING deuna_admin.editorial_items AS editorial
  WHERE publication.item_id = editorial.id
    AND editorial.item_type <> 'game';

  UPDATE deuna_admin.editorial_items
     SET published_from_revision = NULL
   WHERE item_type <> 'game';

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
