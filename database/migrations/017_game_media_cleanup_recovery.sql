-- Recuperación durable de limpieza multimedia posterior a hard-delete.
-- La cola se crea en la misma transacción que elimina el juego.

CREATE TABLE IF NOT EXISTS deuna_admin.game_media_cleanup_queue (
  game_slug varchar(160) PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  CONSTRAINT game_media_cleanup_queue_slug_check CHECK (
    game_slug ~ '^[a-z0-9][a-z0-9._-]{0,159}$'
  ),
  CONSTRAINT game_media_cleanup_queue_attempts_check CHECK (
    attempts >= 0
  )
);

REVOKE ALL ON deuna_admin.game_media_cleanup_queue FROM PUBLIC;

CREATE OR REPLACE FUNCTION deuna_admin.enqueue_deleted_game_media_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
BEGIN
  IF OLD.item_type = 'game'
     AND OLD.source_present = false
     AND OLD.source_payload = '{}'::jsonb THEN
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

DROP TRIGGER IF EXISTS editorial_items_queue_game_media_cleanup
  ON deuna_admin.editorial_items;

CREATE TRIGGER editorial_items_queue_game_media_cleanup
AFTER DELETE ON deuna_admin.editorial_items
FOR EACH ROW
EXECUTE FUNCTION deuna_admin.enqueue_deleted_game_media_cleanup();

CREATE OR REPLACE FUNCTION deuna_admin.begin_game_media_cleanup(
  p_game_slug text,
  p_actor_user_id uuid,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
DECLARE
  attempt_count integer;
BEGIN
  IF p_game_slug IS NULL
     OR p_game_slug !~ '^[a-z0-9][a-z0-9._-]{0,159}$' THEN
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

  UPDATE deuna_admin.game_media_cleanup_queue
     SET attempts = attempts + 1,
         last_attempt_at = now()
   WHERE game_slug = p_game_slug
   RETURNING attempts INTO attempt_count;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'pending',
    'attempts', attempt_count
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.begin_game_media_cleanup(
  text, uuid, text
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION deuna_admin.complete_game_media_cleanup(
  p_game_slug text,
  p_actor_user_id uuid,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin
AS $$
DECLARE
  removed integer := 0;
BEGIN
  IF p_game_slug IS NULL
     OR p_game_slug !~ '^[a-z0-9][a-z0-9._-]{0,159}$' THEN
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

  DELETE FROM deuna_admin.game_media_cleanup_queue
   WHERE game_slug = p_game_slug;
  GET DIAGNOSTICS removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'outcome',
    CASE WHEN removed = 1 THEN 'completed' ELSE 'not_found' END
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.complete_game_media_cleanup(
  text, uuid, text
) FROM PUBLIC;
