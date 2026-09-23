-- Limpieza manual por juego de snapshots históricos.
-- Conserva el snapshot actual y deja las revisiones de borrador intactas.

CREATE OR REPLACE FUNCTION deuna_admin.compact_editorial_publication_history(
  p_item_type text,
  p_item_key text,
  p_actor_user_id uuid,
  p_session_token text,
  p_expected_publications integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
DECLARE
  target deuna_admin.editorial_items%ROWTYPE;
  publication_before integer;
  panel_created boolean;
  ever_published boolean;
  baseline_action text;
BEGIN
  IF p_item_type IS NULL
     OR p_item_key IS NULL
     OR char_length(p_item_type) NOT BETWEEN 1 AND 30
     OR char_length(p_item_key) NOT BETWEEN 1 AND 160
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
    INTO publication_before
    FROM deuna_admin.editorial_publications
   WHERE item_id = target.id;

  IF publication_before <> p_expected_publications THEN
    RETURN jsonb_build_object(
      'outcome', 'conflict',
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

  baseline_action := CASE
    WHEN panel_created AND NOT ever_published THEN 'bootstrap'
    ELSE 'baseline'
  END;

  DELETE FROM deuna_admin.editorial_publications
   WHERE item_id = target.id;

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
    target.published_from_revision,
    baseline_action,
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
    'editorial_publication_history_compacted',
    p_item_type,
    p_item_key,
    jsonb_build_object(
      'publicationsBefore', publication_before,
      'publicationsAfter', 1
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'compacted',
    'publicationsBefore', publication_before,
    'publicationsAfter', 1
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.compact_editorial_publication_history(
  text, text, uuid, text, integer
) FROM PUBLIC;
