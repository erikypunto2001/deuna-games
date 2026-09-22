-- Mantenimiento general seguro del sitio.
-- Purga únicamente basura transitoria o referencias inequívocamente huérfanas.

CREATE OR REPLACE FUNCTION deuna_admin.inspect_site_runtime_junk(
  p_actor_user_id uuid,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin, deuna_accounts
AS $$
DECLARE
  admin_sessions_count integer;
  account_sessions_count integer;
  used_recovery_codes_count integer;
  old_admin_events_count integer;
  orphan_preferences_count integer;
  orphan_ratings_count integer;
  orphan_insights_count integer;
  orphan_updates_count integer;
  pending_media_cleanup_count integer;
BEGIN
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

  SELECT count(*)::integer
    INTO admin_sessions_count
    FROM deuna_admin.admin_sessions
   WHERE revoked_at IS NOT NULL
      OR expires_at <= now();

  SELECT count(*)::integer
    INTO account_sessions_count
    FROM deuna_accounts.sessions
   WHERE revoked_at IS NOT NULL
      OR expires_at <= now();

  SELECT count(*)::integer
    INTO used_recovery_codes_count
    FROM deuna_accounts.recovery_codes
   WHERE used_at IS NOT NULL;

  SELECT count(*)::integer
    INTO old_admin_events_count
    FROM deuna_admin.admin_events
   WHERE occurred_at < now() - interval '90 days';

  SELECT count(*)::integer
    INTO orphan_preferences_count
    FROM deuna_accounts.game_preferences AS preference
   WHERE NOT EXISTS (
     SELECT 1
       FROM deuna_admin.editorial_items AS game
      WHERE game.item_type = 'game'
        AND game.item_key = preference.game_slug
   );

  SELECT count(*)::integer
    INTO orphan_ratings_count
    FROM deuna_accounts.game_ratings AS rating
   WHERE NOT EXISTS (
     SELECT 1
       FROM deuna_admin.editorial_items AS game
      WHERE game.item_type = 'game'
        AND game.item_key = rating.game_slug
   );

  SELECT count(*)::integer
    INTO orphan_insights_count
    FROM deuna_admin.game_insight_scores AS insight
   WHERE NOT EXISTS (
     SELECT 1
       FROM deuna_admin.editorial_items AS game
      WHERE game.item_type = 'game'
        AND game.item_key = insight.game_slug
   );

  SELECT count(*)::integer
    INTO orphan_updates_count
    FROM deuna_admin.editorial_items AS update_item
   WHERE update_item.item_type = 'game_update'
     AND (
       (
         NULLIF(update_item.source_payload->>'gameSlug', '') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM deuna_admin.editorial_items AS game
            WHERE game.item_type = 'game'
              AND game.item_key =
                update_item.source_payload->>'gameSlug'
         )
       )
       OR
       (
         NULLIF(update_item.draft_payload->>'gameSlug', '') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM deuna_admin.editorial_items AS game
            WHERE game.item_type = 'game'
              AND game.item_key =
                update_item.draft_payload->>'gameSlug'
         )
       )
       OR
       (
         NULLIF(update_item.published_payload->>'gameSlug', '') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM deuna_admin.editorial_items AS game
            WHERE game.item_type = 'game'
              AND game.item_key =
                update_item.published_payload->>'gameSlug'
         )
       )
     );

  SELECT count(*)::integer
    INTO pending_media_cleanup_count
    FROM deuna_admin.game_media_cleanup_queue;

  RETURN jsonb_build_object(
    'outcome', 'ok',
    'adminSessions', admin_sessions_count,
    'accountSessions', account_sessions_count,
    'usedRecoveryCodes', used_recovery_codes_count,
    'oldAdminEvents', old_admin_events_count,
    'orphanPreferences', orphan_preferences_count,
    'orphanRatings', orphan_ratings_count,
    'orphanInsights', orphan_insights_count,
    'orphanGameUpdates', orphan_updates_count,
    'pendingMediaCleanups', pending_media_cleanup_count
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.inspect_site_runtime_junk(
  uuid, text
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION deuna_admin.purge_site_runtime_junk(
  p_actor_user_id uuid,
  p_session_token text,
  p_expected_admin_sessions integer,
  p_expected_account_sessions integer,
  p_expected_used_recovery_codes integer,
  p_expected_old_admin_events integer,
  p_expected_orphan_preferences integer,
  p_expected_orphan_ratings integer,
  p_expected_orphan_insights integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, deuna_admin, deuna_accounts
AS $$
DECLARE
  admin_sessions_count integer;
  account_sessions_count integer;
  used_recovery_codes_count integer;
  old_admin_events_count integer;
  orphan_preferences_count integer;
  orphan_ratings_count integer;
  orphan_insights_count integer;
  deleted_admin_sessions integer := 0;
  deleted_account_sessions integer := 0;
  deleted_recovery_codes integer := 0;
  deleted_admin_events integer := 0;
  deleted_preferences integer := 0;
  deleted_ratings integer := 0;
  deleted_insights integer := 0;
BEGIN
  IF p_expected_admin_sessions < 0
     OR p_expected_account_sessions < 0
     OR p_expected_used_recovery_codes < 0
     OR p_expected_old_admin_events < 0
     OR p_expected_orphan_preferences < 0
     OR p_expected_orphan_ratings < 0
     OR p_expected_orphan_insights < 0 THEN
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

  LOCK TABLE
    deuna_admin.admin_sessions,
    deuna_accounts.sessions,
    deuna_accounts.recovery_codes,
    deuna_admin.admin_events,
    deuna_accounts.game_preferences,
    deuna_accounts.game_ratings,
    deuna_admin.game_insight_scores
  IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*)::integer
    INTO admin_sessions_count
    FROM deuna_admin.admin_sessions
   WHERE revoked_at IS NOT NULL
      OR expires_at <= now();

  SELECT count(*)::integer
    INTO account_sessions_count
    FROM deuna_accounts.sessions
   WHERE revoked_at IS NOT NULL
      OR expires_at <= now();

  SELECT count(*)::integer
    INTO used_recovery_codes_count
    FROM deuna_accounts.recovery_codes
   WHERE used_at IS NOT NULL;

  SELECT count(*)::integer
    INTO old_admin_events_count
    FROM deuna_admin.admin_events
   WHERE occurred_at < now() - interval '90 days';

  SELECT count(*)::integer
    INTO orphan_preferences_count
    FROM deuna_accounts.game_preferences AS preference
   WHERE NOT EXISTS (
     SELECT 1
       FROM deuna_admin.editorial_items AS game
      WHERE game.item_type = 'game'
        AND game.item_key = preference.game_slug
   );

  SELECT count(*)::integer
    INTO orphan_ratings_count
    FROM deuna_accounts.game_ratings AS rating
   WHERE NOT EXISTS (
     SELECT 1
       FROM deuna_admin.editorial_items AS game
      WHERE game.item_type = 'game'
        AND game.item_key = rating.game_slug
   );

  SELECT count(*)::integer
    INTO orphan_insights_count
    FROM deuna_admin.game_insight_scores AS insight
   WHERE NOT EXISTS (
     SELECT 1
       FROM deuna_admin.editorial_items AS game
      WHERE game.item_type = 'game'
        AND game.item_key = insight.game_slug
   );

  IF admin_sessions_count <> p_expected_admin_sessions
     OR account_sessions_count <> p_expected_account_sessions
     OR used_recovery_codes_count <> p_expected_used_recovery_codes
     OR old_admin_events_count <> p_expected_old_admin_events
     OR orphan_preferences_count <> p_expected_orphan_preferences
     OR orphan_ratings_count <> p_expected_orphan_ratings
     OR orphan_insights_count <> p_expected_orphan_insights THEN
    RETURN jsonb_build_object(
      'outcome', 'conflict',
      'adminSessions', admin_sessions_count,
      'accountSessions', account_sessions_count,
      'usedRecoveryCodes', used_recovery_codes_count,
      'oldAdminEvents', old_admin_events_count,
      'orphanPreferences', orphan_preferences_count,
      'orphanRatings', orphan_ratings_count,
      'orphanInsights', orphan_insights_count
    );
  END IF;

  DELETE FROM deuna_admin.admin_sessions
   WHERE revoked_at IS NOT NULL
      OR expires_at <= now();
  GET DIAGNOSTICS deleted_admin_sessions = ROW_COUNT;

  DELETE FROM deuna_accounts.sessions
   WHERE revoked_at IS NOT NULL
      OR expires_at <= now();
  GET DIAGNOSTICS deleted_account_sessions = ROW_COUNT;

  DELETE FROM deuna_accounts.recovery_codes
   WHERE used_at IS NOT NULL;
  GET DIAGNOSTICS deleted_recovery_codes = ROW_COUNT;

  DELETE FROM deuna_admin.admin_events
   WHERE occurred_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_admin_events = ROW_COUNT;

  DELETE FROM deuna_accounts.game_preferences AS preference
   WHERE NOT EXISTS (
     SELECT 1
       FROM deuna_admin.editorial_items AS game
      WHERE game.item_type = 'game'
        AND game.item_key = preference.game_slug
   );
  GET DIAGNOSTICS deleted_preferences = ROW_COUNT;

  DELETE FROM deuna_accounts.game_ratings AS rating
   WHERE NOT EXISTS (
     SELECT 1
       FROM deuna_admin.editorial_items AS game
      WHERE game.item_type = 'game'
        AND game.item_key = rating.game_slug
   );
  GET DIAGNOSTICS deleted_ratings = ROW_COUNT;

  DELETE FROM deuna_admin.game_insight_scores AS insight
   WHERE NOT EXISTS (
     SELECT 1
       FROM deuna_admin.editorial_items AS game
      WHERE game.item_type = 'game'
        AND game.item_key = insight.game_slug
   );
  GET DIAGNOSTICS deleted_insights = ROW_COUNT;

  INSERT INTO deuna_admin.admin_audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    p_actor_user_id,
    'site_runtime_junk_purged',
    'maintenance',
    'site',
    jsonb_build_object(
      'adminSessions', deleted_admin_sessions,
      'accountSessions', deleted_account_sessions,
      'usedRecoveryCodes', deleted_recovery_codes,
      'oldAdminEvents', deleted_admin_events,
      'orphanPreferences', deleted_preferences,
      'orphanRatings', deleted_ratings,
      'orphanInsights', deleted_insights
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'purged',
    'adminSessions', deleted_admin_sessions,
    'accountSessions', deleted_account_sessions,
    'usedRecoveryCodes', deleted_recovery_codes,
    'oldAdminEvents', deleted_admin_events,
    'orphanPreferences', deleted_preferences,
    'orphanRatings', deleted_ratings,
    'orphanInsights', deleted_insights
  );
END;
$$;

REVOKE ALL ON FUNCTION deuna_admin.purge_site_runtime_junk(
  uuid, text, integer, integer, integer, integer, integer, integer, integer
) FROM PUBLIC;
