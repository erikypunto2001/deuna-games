import {
  randomBytes,
  randomUUID,
} from "node:crypto";
import process from "node:process";

import { Pool } from "pg";

import {
  getAdminDatabaseConfig,
} from "../src/lib/admin/database-config.ts";
import {
  createAdminSessionToken,
  hashAdminSessionToken,
} from "../src/lib/admin/session-token.ts";

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function asRecord(value: unknown) {
  assert(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value),
    "La función de mantenimiento general no devolvió JSON válido."
  );
  return value as Record<string, unknown>;
}

function count(
  value: Record<string, unknown>,
  key: string
) {
  return Number(value[key] ?? 0);
}

if (
  process.env.CI !== "true" ||
  process.env.GITHUB_ACTIONS !== "true"
) {
  console.log(
    "Mantenimiento general PostgreSQL: omitido fuera de GitHub Actions para no mutar datos locales."
  );
  process.exit(0);
}

const runtimePool = new Pool(
  getAdminDatabaseConfig("runtime")
);
const migrationPool = new Pool(
  getAdminDatabaseConfig("migration")
);

const suffix = randomBytes(5)
  .toString("hex");
const missingSlug =
  `ci-missing-game-${suffix}`;
const updateKey =
  `ci-orphan-update-${suffix}`;
const accountId = randomUUID();
const adminSessionId = randomUUID();
const secondAdminSessionId = randomUUID();
const accountSessionId = randomUUID();
const recoveryCodeId = randomUUID();
let oldEventId: number | null = null;
let updateId: string | null = null;

try {
  const owner = await runtimePool.query<{
    id: string;
  }>(
    `SELECT id
       FROM deuna_admin.admin_users
      WHERE role = 'owner'
        AND active = true
      LIMIT 1`
  );
  const ownerId = owner.rows[0]?.id;
  assert(ownerId, "Falta el Owner aislado de CI.");

  const sessionToken =
    createAdminSessionToken();
  await migrationPool.query(
    `INSERT INTO deuna_admin.admin_sessions (
       id, user_id, token_hash, expires_at
     )
     VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [
      randomUUID(),
      ownerId,
      hashAdminSessionToken(sessionToken),
    ]
  );

  await migrationPool.query(
    `INSERT INTO deuna_accounts.users (
       id, username, username_key, password_hash
     )
     VALUES ($1, $2, $2, 'ci-placeholder')`,
    [
      accountId,
      `ci_maint_${suffix}`,
    ]
  );

  await migrationPool.query(
    `INSERT INTO deuna_admin.admin_sessions (
       id,
       user_id,
       token_hash,
       expires_at,
       revoked_at
     )
     VALUES (
       $1, $2, $3,
       now() + interval '1 hour',
       now()
     )`,
    [
      adminSessionId,
      ownerId,
      "1".repeat(64),
    ]
  );

  await migrationPool.query(
    `INSERT INTO deuna_accounts.sessions (
       id,
       user_id,
       token_hash,
       expires_at,
       revoked_at
     )
     VALUES (
       $1, $2, $3,
       now() + interval '1 hour',
       now()
     )`,
    [
      accountSessionId,
      accountId,
      "2".repeat(64),
    ]
  );

  await migrationPool.query(
    `INSERT INTO deuna_accounts.recovery_codes (
       id,
       user_id,
       code_hash,
       used_at
     )
     VALUES ($1, $2, $3, now())`,
    [
      recoveryCodeId,
      accountId,
      "3".repeat(64),
    ]
  );

  const oldEvent = await migrationPool.query<{
    id: number;
  }>(
    `INSERT INTO deuna_admin.admin_events (
       user_id,
       event_type,
       occurred_at
     )
     VALUES (
       $1,
       'maintenance_ci',
       now() - interval '100 days'
     )
     RETURNING id`,
    [ownerId]
  );
  oldEventId = oldEvent.rows[0]?.id ?? null;

  await migrationPool.query(
    `INSERT INTO deuna_accounts.game_preferences (
       user_id,
       game_slug,
       favorite,
       library_state,
       follow_updates,
       followed_at
     )
     VALUES (
       $1, $2, true, 'playing', true, now()
     )`,
    [accountId, missingSlug]
  );

  await migrationPool.query(
    `INSERT INTO deuna_accounts.game_ratings (
       user_id,
       game_slug,
       rating
     )
     VALUES ($1, $2, 4)`,
    [accountId, missingSlug]
  );

  await migrationPool.query(
    `INSERT INTO deuna_admin.game_insight_scores (
       game_slug,
       score,
       confidence,
       evidence_count,
       breakdown,
       calculated_by
     )
     VALUES (
       $1, 50, 'medium', 1, '{}'::jsonb, $2
     )`,
    [missingSlug, ownerId]
  );

  updateId = randomUUID();
  const updatePayload = JSON.stringify({
    gameSlug: missingSlug,
    version: "ci",
  });
  await migrationPool.query(
    `INSERT INTO deuna_admin.editorial_items (
       id,
       item_type,
       item_key,
       source_payload,
       source_checksum,
       source_present,
       draft_payload,
       draft_status,
       published_payload,
       published_checksum,
       public_visible,
       updated_by
     )
     VALUES (
       $1,
       'game_update',
       $2,
       $3::jsonb,
       $4,
       false,
       $3::jsonb,
       'modified',
       $3::jsonb,
       $4,
       false,
       $5
     )`,
    [
      updateId,
      updateKey,
      updatePayload,
      "4".repeat(64),
      ownerId,
    ]
  );

  const privileges = await runtimePool.query<{
    can_delete_admin_sessions: boolean;
    can_delete_account_sessions: boolean;
    can_delete_ratings: boolean;
    can_delete_insights: boolean;
    can_inspect: boolean;
    can_purge: boolean;
  }>(
    `SELECT
       has_table_privilege(
         current_user,
         'deuna_admin.admin_sessions',
         'DELETE'
       ) AS can_delete_admin_sessions,
       has_table_privilege(
         current_user,
         'deuna_accounts.sessions',
         'DELETE'
       ) AS can_delete_account_sessions,
       has_table_privilege(
         current_user,
         'deuna_accounts.game_ratings',
         'DELETE'
       ) AS can_delete_ratings,
       has_table_privilege(
         current_user,
         'deuna_admin.game_insight_scores',
         'DELETE'
       ) AS can_delete_insights,
       has_function_privilege(
         current_user,
         'deuna_admin.inspect_site_runtime_junk(uuid,text)',
         'EXECUTE'
       ) AS can_inspect,
       has_function_privilege(
         current_user,
         'deuna_admin.purge_site_runtime_junk(uuid,text,integer,integer,integer,integer,integer,integer,integer)',
         'EXECUTE'
       ) AS can_purge`
  );
  const privilege = privileges.rows[0];
  assert(
    privilege &&
      privilege.can_delete_admin_sessions === false &&
      privilege.can_delete_account_sessions === false &&
      privilege.can_delete_ratings === false &&
      privilege.can_delete_insights === false &&
      privilege.can_inspect === true &&
      privilege.can_purge === true,
    "La limpieza general debe usar funciones autorizadas sin ampliar DELETE directo del runtime."
  );

  async function inspect() {
    const result = await runtimePool.query<{
      result: unknown;
    }>(
      `SELECT deuna_admin.inspect_site_runtime_junk(
         $1, $2
       ) AS result`,
      [ownerId, sessionToken]
    );
    return asRecord(
      result.rows[0]?.result
    );
  }

  const before = await inspect();
  assert(
    before.outcome === "ok" &&
      count(before, "adminSessions") >= 1 &&
      count(before, "accountSessions") >= 1 &&
      count(before, "usedRecoveryCodes") >= 1 &&
      count(before, "oldAdminEvents") >= 1 &&
      count(before, "orphanPreferences") >= 1 &&
      count(before, "orphanRatings") >= 1 &&
      count(before, "orphanInsights") >= 1 &&
      count(before, "orphanGameUpdates") >= 1,
    "El diagnóstico no detectó toda la basura sintética y la inconsistencia editorial."
  );

  await migrationPool.query(
    `INSERT INTO deuna_admin.admin_sessions (
       id,
       user_id,
       token_hash,
       expires_at,
       revoked_at
     )
     VALUES (
       $1, $2, $3,
       now() + interval '1 hour',
       now()
     )`,
    [
      secondAdminSessionId,
      ownerId,
      "5".repeat(64),
    ]
  );

  const stalePurge = await runtimePool.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.purge_site_runtime_junk(
       $1, $2, $3, $4, $5, $6, $7, $8, $9
     ) AS result`,
    [
      ownerId,
      sessionToken,
      count(before, "adminSessions"),
      count(before, "accountSessions"),
      count(before, "usedRecoveryCodes"),
      count(before, "oldAdminEvents"),
      count(before, "orphanPreferences"),
      count(before, "orphanRatings"),
      count(before, "orphanInsights"),
    ]
  );
  assert(
    asRecord(
      stalePurge.rows[0]?.result
    ).outcome === "conflict",
    "Un diagnóstico obsoleto debe abortar la purga general antes de eliminar filas."
  );

  const current = await inspect();
  const purge = await runtimePool.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.purge_site_runtime_junk(
       $1, $2, $3, $4, $5, $6, $7, $8, $9
     ) AS result`,
    [
      ownerId,
      sessionToken,
      count(current, "adminSessions"),
      count(current, "accountSessions"),
      count(current, "usedRecoveryCodes"),
      count(current, "oldAdminEvents"),
      count(current, "orphanPreferences"),
      count(current, "orphanRatings"),
      count(current, "orphanInsights"),
    ]
  );
  const purged = asRecord(
    purge.rows[0]?.result
  );
  assert(
    purged.outcome === "purged",
    "La purga general con snapshot vigente fue rechazada."
  );

  const after = await inspect();
  assert(
    count(after, "adminSessions") === 0 &&
      count(after, "accountSessions") === 0 &&
      count(after, "usedRecoveryCodes") === 0 &&
      count(after, "oldAdminEvents") === 0 &&
      count(after, "orphanPreferences") === 0 &&
      count(after, "orphanRatings") === 0 &&
      count(after, "orphanInsights") === 0 &&
      count(after, "orphanGameUpdates") >= 1,
    "La purga general no dejó únicamente la inconsistencia editorial de revisión manual."
  );

  const updateStillExists =
    await runtimePool.query<{
      count: number;
    }>(
      `SELECT count(*)::int AS count
         FROM deuna_admin.editorial_items
        WHERE id = $1`,
      [updateId]
    );
  assert(
    updateStillExists.rows[0]?.count === 1,
    "La limpieza automática borró una actualización huérfana que debía quedar para revisión manual."
  );

  console.log(
    "Mantenimiento general PostgreSQL: OK (diagnóstico, mínimo privilegio, conflicto optimista, purga segura y revisión manual preservada)."
  );
} finally {
  if (updateId) {
    await migrationPool.query(
      `DELETE FROM deuna_admin.editorial_items
        WHERE id = $1`,
      [updateId]
    ).catch(() => {});
  }
  await migrationPool.query(
    `DELETE FROM deuna_admin.game_insight_scores
      WHERE game_slug = $1`,
    [missingSlug]
  ).catch(() => {});
  await migrationPool.query(
    `DELETE FROM deuna_accounts.users
      WHERE id = $1`,
    [accountId]
  ).catch(() => {});
  await migrationPool.query(
    `DELETE FROM deuna_admin.admin_sessions
      WHERE id = ANY($1::uuid[])`,
    [[
      adminSessionId,
      secondAdminSessionId,
    ]]
  ).catch(() => {});
  if (oldEventId !== null) {
    await migrationPool.query(
      `DELETE FROM deuna_admin.admin_events
        WHERE id = $1`,
      [oldEventId]
    ).catch(() => {});
  }
  await runtimePool.end();
  await migrationPool.end();
}
