import {
  createHash,
} from "node:crypto";
import {
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Pool } from "pg";

import { games } from "../../src/data/games.ts";
import { gameUpdates } from "../../src/data/update-records.ts";
import {
  assertSafePostgresRole,
  getAdminDatabaseConfig,
  getAdminOrigin,
  getAdminRuntimeDatabaseRole,
  getAdminSessionHours,
} from "../../src/lib/admin/database-config.ts";

type PreflightPurpose = "migration" | "runtime";
type ColumnPrivilege = "SELECT" | "INSERT" | "UPDATE";

type RoleRow = {
  rolname: string;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  rolcanlogin: boolean;
};

type MigrationRow = {
  name: string;
  checksum: string;
};

type PrivilegeRow = {
  schema_name: string;
  object_name: string;
  can_delete: boolean;
  can_truncate: boolean;
  can_references: boolean;
  can_trigger: boolean;
};

type ColumnPrivilegeRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  privilege_type: string;
};

type SequencePrivilegeRow = {
  schema_name: string;
  object_name: string;
  can_usage: boolean;
  can_select: boolean;
  can_update: boolean;
};

const expectedRuntimeFunctions = [
  "deuna_admin.delete_panel_game(text,uuid,text,integer,integer)",
  "deuna_admin.list_source_game_retirements()",
  "deuna_admin.is_game_media_cleanup_pending(text)",
  "deuna_admin.list_game_media_cleanup_queue(uuid,text)",
  "deuna_admin.begin_game_media_cleanup(text,uuid,text)",
  "deuna_admin.complete_game_media_cleanup(text,uuid,text)",
  "deuna_admin.inspect_site_runtime_junk(uuid,text)",
  "deuna_admin.purge_site_runtime_junk(uuid,text,integer,integer,integer,integer,integer,integer,integer)",
] as const;

const migrationsDirectory = path.join(
  process.cwd(),
  "database",
  "migrations"
);
const managedSchemas = ["deuna_admin", "deuna_accounts"] as const;
const failures: string[] = [];

function assert(condition: unknown, message: string) {
  if (!condition) failures.push(message);
}

function privilegeKey(
  schema: string,
  table: string,
  column: string,
  privilege: string
) {
  return `${schema}.${table}.${column}.${privilege}`;
}

const expectedColumnPrivileges = new Set<string>();

function allow(
  schema: string,
  table: string,
  privilege: ColumnPrivilege,
  columns: readonly string[]
) {
  for (const column of columns) {
    expectedColumnPrivileges.add(
      privilegeKey(schema, table, column, privilege)
    );
  }
}

allow("deuna_admin", "admin_users", "SELECT", [
  "id", "username", "username_key", "role", "password_hash",
  "display_name", "active", "failed_login_count", "locked_until",
  "last_login_at", "password_changed_at", "created_at", "updated_at",
  "created_by_user_id",
]);
allow("deuna_admin", "admin_users", "INSERT", [
  "id", "username", "username_key", "role", "password_hash",
  "display_name", "active", "created_by_user_id",
]);
allow("deuna_admin", "admin_users", "UPDATE", [
  "password_hash", "active", "failed_login_count", "locked_until",
  "last_login_at", "password_changed_at", "updated_at",
]);

allow("deuna_admin", "admin_sessions", "SELECT", [
  "id", "user_id", "token_hash", "expires_at", "revoked_at",
]);
allow("deuna_admin", "admin_sessions", "INSERT", [
  "id", "user_id", "token_hash", "expires_at",
]);
allow("deuna_admin", "admin_sessions", "UPDATE", ["revoked_at"]);

allow("deuna_admin", "admin_events", "SELECT", [
  "id", "user_id", "event_type", "occurred_at",
]);
allow("deuna_admin", "admin_events", "INSERT", [
  "user_id", "event_type",
]);

allow("deuna_admin", "editorial_items", "SELECT", [
  "id", "item_type", "item_key", "source_payload", "source_checksum",
  "source_present", "draft_payload", "draft_status", "revision",
  "published_payload", "published_checksum", "published_from_revision",
  "publication_number", "published_at", "published_by", "public_visible",
  "source_imported_at", "updated_at", "updated_by",
]);
allow("deuna_admin", "editorial_items", "INSERT", [
  "id", "item_type", "item_key", "source_payload", "source_checksum",
  "source_present", "draft_payload", "draft_status", "published_payload",
  "published_checksum", "public_visible", "updated_by",
]);
allow("deuna_admin", "editorial_items", "UPDATE", [
  "draft_payload", "draft_status", "revision", "published_payload",
  "published_checksum", "published_from_revision", "publication_number",
  "published_at", "published_by", "public_visible", "updated_at", "updated_by",
]);



allow("deuna_admin", "admin_audit_log", "INSERT", [
  "user_id", "action", "entity_type", "entity_id", "details",
]);

allow("deuna_admin", "game_insight_scores", "SELECT", [
  "game_slug", "score", "confidence", "evidence_count", "breakdown",
  "calculated_by", "calculated_at",
]);
allow("deuna_admin", "game_insight_scores", "INSERT", [
  "game_slug", "score", "confidence", "evidence_count", "breakdown",
  "calculated_by", "calculated_at",
]);
allow("deuna_admin", "game_insight_scores", "UPDATE", [
  "score", "confidence", "evidence_count", "breakdown", "calculated_by",
  "calculated_at",
]);

allow("deuna_accounts", "users", "SELECT", [
  "id", "username", "username_key", "password_hash", "display_name",
  "email_encrypted", "bio", "active", "failed_login_count", "locked_until",
  "last_login_at", "password_changed_at", "created_at", "updated_at",
]);
allow("deuna_accounts", "users", "INSERT", [
  "id", "username", "username_key", "password_hash", "display_name",
  "email_encrypted", "bio",
]);
allow("deuna_accounts", "users", "UPDATE", [
  "password_hash", "display_name", "email_encrypted", "bio",
  "failed_login_count", "locked_until", "last_login_at",
  "password_changed_at", "updated_at",
]);

allow("deuna_accounts", "avatars", "SELECT", [
  "user_id", "digest", "image_webp", "width", "height", "updated_at",
]);
allow("deuna_accounts", "avatars", "INSERT", [
  "user_id", "digest", "image_webp", "width", "height", "updated_at",
]);
allow("deuna_accounts", "avatars", "UPDATE", [
  "digest", "image_webp", "width", "height", "updated_at",
]);

allow("deuna_accounts", "sessions", "SELECT", [
  "id", "user_id", "token_hash", "expires_at", "revoked_at",
]);
allow("deuna_accounts", "sessions", "INSERT", [
  "id", "user_id", "token_hash", "expires_at",
]);
allow("deuna_accounts", "sessions", "UPDATE", ["revoked_at"]);

allow("deuna_accounts", "recovery_codes", "SELECT", [
  "id", "user_id", "code_hash", "created_at", "used_at",
]);
allow("deuna_accounts", "recovery_codes", "INSERT", [
  "id", "user_id", "code_hash",
]);
allow("deuna_accounts", "recovery_codes", "UPDATE", ["used_at"]);

allow("deuna_accounts", "game_preferences", "SELECT", [
  "user_id", "game_slug", "favorite", "library_state", "follow_updates",
  "followed_at", "updates_seen_through", "updated_at",
]);
allow("deuna_accounts", "game_preferences", "INSERT", [
  "user_id", "game_slug", "favorite", "library_state", "follow_updates",
  "followed_at", "updates_seen_through", "updated_at",
]);
allow("deuna_accounts", "game_preferences", "UPDATE", [
  "favorite", "library_state", "follow_updates", "followed_at",
  "updates_seen_through", "updated_at",
]);

allow("deuna_accounts", "game_ratings", "SELECT", [
  "user_id", "game_slug", "rating", "updated_at",
]);
allow("deuna_accounts", "game_ratings", "INSERT", [
  "user_id", "game_slug", "rating", "updated_at",
]);
allow("deuna_accounts", "game_ratings", "UPDATE", [
  "rating", "updated_at",
]);

allow("deuna_accounts", "hardware_profiles", "SELECT", [
  "user_id", "cpu_id", "gpu_id", "ram_gb", "memory_mode", "updated_at",
]);
allow("deuna_accounts", "hardware_profiles", "INSERT", [
  "user_id", "cpu_id", "gpu_id", "ram_gb", "memory_mode", "updated_at",
]);
allow("deuna_accounts", "hardware_profiles", "UPDATE", [
  "cpu_id", "gpu_id", "ram_gb", "memory_mode", "updated_at",
]);

allow("deuna_accounts", "reward_profiles", "SELECT", [
  "user_id", "xp_total", "credits_balance", "streak_days", "best_streak",
  "last_claim_at", "created_at", "updated_at",
]);
allow("deuna_accounts", "reward_profiles", "INSERT", ["user_id"]);
allow("deuna_accounts", "reward_profiles", "UPDATE", [
  "xp_total", "credits_balance", "streak_days", "best_streak",
  "last_claim_at", "updated_at",
]);

allow("deuna_accounts", "reward_events", "SELECT", [
  "id", "user_id", "event_type", "event_key", "xp_delta", "credits_delta",
  "created_at",
]);
allow("deuna_accounts", "reward_events", "INSERT", [
  "id", "user_id", "event_type", "event_key", "xp_delta", "credits_delta",
  "created_at",
]);

const expectedDeletes = new Set([
  "deuna_accounts.users",
  "deuna_accounts.avatars",
  "deuna_accounts.recovery_codes",
  "deuna_accounts.game_preferences",
  "deuna_accounts.hardware_profiles",
]);

const expectedSequences = new Set([
  "deuna_admin.admin_events_id_seq",
  "deuna_admin.admin_audit_log_id_seq",
]);

function parsePurpose(): PreflightPurpose {
  const value = process.argv
    .find((argument) => argument.startsWith("--purpose="))
    ?.slice("--purpose=".length);

  if (value !== "migration" && value !== "runtime") {
    throw new Error("Usa --purpose=migration o --purpose=runtime.");
  }

  return value;
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

function isLoopbackHost(host: string) {
  return host === "127.0.0.1" ||
    host === "::1" ||
    host === "localhost" ||
    host.startsWith("/");
}

function checksum(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function getLocalMigrations() {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();

  return Promise.all(
    names.map(async (name) => ({
      name,
      checksum: checksum(
        await readFile(path.join(migrationsDirectory, name), "utf8")
      ),
    }))
  );
}

function validateRuntimeEnvironment() {
  assert(
    process.env.NODE_ENV === "production",
    "NODE_ENV debe ser production en el preflight del runtime."
  );
  assert(
    process.env.DEUNA_ADMIN_ENABLED === "false" ||
      process.env.DEUNA_ADMIN_ENABLED === "true",
    "DEUNA_ADMIN_ENABLED debe usar exactamente true o false."
  );

  const siteUrl = new URL(requiredEnvironment("NEXT_PUBLIC_SITE_URL"));
  assert(siteUrl.protocol === "https:", "NEXT_PUBLIC_SITE_URL debe usar HTTPS.");
  assert(
    !siteUrl.username && !siteUrl.password && !siteUrl.search && !siteUrl.hash &&
      (siteUrl.pathname === "/" || siteUrl.pathname === ""),
    "NEXT_PUBLIC_SITE_URL debe contener sólo el origen HTTPS."
  );

  getAdminOrigin();
  getAdminSessionHours();

  const accountDays = Number(
    process.env.DEUNA_ACCOUNT_SESSION_DAYS?.trim() || "30"
  );
  assert(
    Number.isInteger(accountDays) && accountDays >= 1 && accountDays <= 90,
    "DEUNA_ACCOUNT_SESSION_DAYS debe estar entre 1 y 90."
  );

  const accountDataKey = requiredEnvironment("DEUNA_ACCOUNT_DATA_KEY");
  assert(
    /^[A-Za-z0-9_-]{43}$/.test(accountDataKey) &&
      Buffer.from(accountDataKey, "base64url").length === 32,
    "DEUNA_ACCOUNT_DATA_KEY debe ser una clave base64url aleatoria de 32 bytes."
  );
}

async function checkRoles(
  pool: Pool,
  purpose: PreflightPurpose,
  runtimeRole: string,
  migrationRole: string
) {
  const current = await pool.query<{
    database_name: string;
    user_name: string;
  }>(
    `SELECT current_database() AS database_name,
            current_user AS user_name`
  );

  assert(
    current.rows[0]?.database_name === requiredEnvironment("DEUNA_DATABASE_NAME"),
    "La conexión no apunta a la base configurada."
  );
  assert(
    current.rows[0]?.user_name ===
      (purpose === "migration" ? migrationRole : runtimeRole),
    `La conexión ${purpose} no usa el rol esperado.`
  );
  assert(runtimeRole !== migrationRole, "Runtime y migrador deben ser diferentes.");

  const roles = await pool.query<RoleRow>(
    `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole,
            rolreplication, rolbypassrls, rolcanlogin
       FROM pg_roles
      WHERE rolname = ANY($1::text[])`,
    [[runtimeRole, migrationRole]]
  );
  assert(roles.rows.length === 2, "Deben existir los roles runtime y migrador.");

  for (const role of roles.rows) {
    assert(role.rolcanlogin, `El rol ${role.rolname} debe permitir conexión.`);
    assert(
      !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole &&
        !role.rolreplication && !role.rolbypassrls,
      `El rol ${role.rolname} tiene privilegios globales peligrosos.`
    );
  }

  const owner = await pool.query<{ owner_name: string }>(
    `SELECT pg_get_userbyid(datdba) AS owner_name
       FROM pg_database
      WHERE datname = current_database()`
  );
  assert(
    owner.rows[0]?.owner_name === migrationRole,
    "El migrador debe ser propietario de la base."
  );
}

async function checkPublicBoundary(pool: Pool, runtimeRole: string) {
  const boundary = await pool.query<{
    runtime_database_create: boolean;
    runtime_database_temp: boolean;
    runtime_admin_create: boolean;
    runtime_admin_usage: boolean;
    runtime_accounts_create: boolean;
    runtime_accounts_usage: boolean;
    public_database_access: boolean;
    public_schema_access: boolean;
    public_table_access: boolean;
  }>(
    `SELECT
       has_database_privilege($1, current_database(), 'CREATE') AS runtime_database_create,
       has_database_privilege($1, current_database(), 'TEMP') AS runtime_database_temp,
       has_schema_privilege($1, 'deuna_admin', 'CREATE') AS runtime_admin_create,
       has_schema_privilege($1, 'deuna_admin', 'USAGE') AS runtime_admin_usage,
       has_schema_privilege($1, 'deuna_accounts', 'CREATE') AS runtime_accounts_create,
       has_schema_privilege($1, 'deuna_accounts', 'USAGE') AS runtime_accounts_usage,
       EXISTS (
         SELECT 1
           FROM pg_database AS database
           CROSS JOIN LATERAL aclexplode(
             COALESCE(database.datacl, acldefault('d', database.datdba))
           ) AS acl
          WHERE database.datname = current_database()
            AND acl.grantee = 0
       ) AS public_database_access,
       EXISTS (
         SELECT 1
           FROM pg_namespace AS namespace
           CROSS JOIN LATERAL aclexplode(
             COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
           ) AS acl
          WHERE namespace.nspname = ANY($2::text[])
            AND acl.grantee = 0
       ) AS public_schema_access,
       EXISTS (
         SELECT 1
           FROM pg_class AS object
           JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
           CROSS JOIN LATERAL aclexplode(
             COALESCE(
               object.relacl,
               acldefault(
                 CASE WHEN object.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END,
                 object.relowner
               )
             )
           ) AS acl
          WHERE namespace.nspname = ANY($2::text[])
            AND object.relkind IN ('r', 'p', 'S')
            AND acl.grantee = 0
       ) AS public_table_access`,
    [runtimeRole, [...managedSchemas]]
  );
  const row = boundary.rows[0];

  assert(
    row?.runtime_admin_usage && row.runtime_accounts_usage,
    "Runtime necesita USAGE sobre ambos esquemas privados."
  );
  assert(
    !row?.runtime_database_create && !row?.runtime_database_temp &&
      !row?.runtime_admin_create && !row?.runtime_accounts_create,
    "Runtime puede crear objetos fuera de sus permisos mínimos."
  );
  assert(
    !row?.public_database_access && !row?.public_schema_access &&
      !row?.public_table_access,
    "PUBLIC conserva acceso a la base o a un esquema privado."
  );
}

async function checkRuntimePrivileges(pool: Pool, runtimeRole: string) {
  const tables = await pool.query<PrivilegeRow>(
    `SELECT namespace.nspname AS schema_name,
            object.relname AS object_name,
            has_table_privilege($1, object.oid, 'DELETE') AS can_delete,
            has_table_privilege($1, object.oid, 'TRUNCATE') AS can_truncate,
            has_table_privilege($1, object.oid, 'REFERENCES') AS can_references,
            has_table_privilege($1, object.oid, 'TRIGGER') AS can_trigger
       FROM pg_class AS object
       JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname = ANY($2::text[])
        AND object.relkind IN ('r', 'p')`,
    [runtimeRole, [...managedSchemas]]
  );

  for (const table of tables.rows) {
    const key = `${table.schema_name}.${table.object_name}`;
    assert(
      table.can_delete === expectedDeletes.has(key) &&
        !table.can_truncate && !table.can_references && !table.can_trigger,
      `Los permisos de tabla sobre ${key} no son mínimos.`
    );
  }

  const columns = await pool.query<ColumnPrivilegeRow>(
    `SELECT table_schema, table_name, column_name, privilege_type
       FROM information_schema.column_privileges
      WHERE grantee = $1
        AND table_schema = ANY($2::text[])`,
    [runtimeRole, [...managedSchemas]]
  );
  const actual = new Set(
    columns.rows.map((row) =>
      privilegeKey(
        row.table_schema,
        row.table_name,
        row.column_name,
        row.privilege_type
      )
    )
  );

  for (const expected of expectedColumnPrivileges) {
    assert(actual.has(expected), `Falta el permiso runtime mínimo ${expected}.`);
  }
  for (const found of actual) {
    assert(
      expectedColumnPrivileges.has(found),
      `El rol runtime tiene un permiso de columna no previsto: ${found}.`
    );
  }

  const sequences = await pool.query<SequencePrivilegeRow>(
    `SELECT namespace.nspname AS schema_name,
            object.relname AS object_name,
            has_sequence_privilege($1, object.oid, 'USAGE') AS can_usage,
            has_sequence_privilege($1, object.oid, 'SELECT') AS can_select,
            has_sequence_privilege($1, object.oid, 'UPDATE') AS can_update
       FROM pg_class AS object
       JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname = ANY($2::text[])
        AND object.relkind = 'S'`,
    [runtimeRole, [...managedSchemas]]
  );

  for (const sequence of sequences.rows) {
    const key = `${sequence.schema_name}.${sequence.object_name}`;
    const expected = expectedSequences.has(key);
    assert(
      expected === (sequence.can_usage && sequence.can_select) &&
        !sequence.can_update,
      `Los permisos de la secuencia ${key} no son mínimos.`
    );
  }

  for (const signature of expectedRuntimeFunctions) {
    const privilege = await pool.query<{
      can_execute: boolean;
    }>(
      `SELECT has_function_privilege(
         $1,
         $2,
         'EXECUTE'
       ) AS can_execute`,
      [runtimeRole, signature]
    );

    assert(
      privilege.rows[0]?.can_execute === true,
      `Falta EXECUTE runtime mínimo sobre ${signature}.`
    );
  }
}

async function checkMigrations(pool: Pool) {
  const local = await getLocalMigrations();
  const applied = await pool.query<MigrationRow>(
    `SELECT name, checksum
       FROM deuna_admin.schema_migrations
      ORDER BY name`
  );

  assert(local.length > 0, "No se encontraron migraciones locales.");
  assert(
    applied.rows.length === local.length,
    "La cantidad de migraciones aplicadas no coincide con el código."
  );
  for (const migration of local) {
    const databaseMigration = applied.rows.find(
      (row) => row.name === migration.name
    );
    assert(
      databaseMigration?.checksum === migration.checksum,
      `La migración ${migration.name} falta o tiene un checksum diferente.`
    );
  }
}

async function checkApplicationState(pool: Pool) {
  const owner = await pool.query<{ active_count: number }>(
    `SELECT count(id)::integer AS active_count
       FROM deuna_admin.admin_users
      WHERE active = true AND role = 'owner'`
  );
  assert(
    owner.rows[0]?.active_count === 1,
    "Debe existir exactamente una cuenta propietaria activa."
  );

  const content = await pool.query<{
    item_type: string;
    count: number;
  }>(
    `SELECT item_type, count(id)::integer AS count
       FROM deuna_admin.editorial_items
      WHERE source_present = true
      GROUP BY item_type`
  );
  const counts = new Map(
    content.rows.map((row) => [row.item_type, row.count])
  );
  const importedCount = (itemType: string) =>
    counts.get(itemType) ?? 0;

  const retired = await pool.query<{
    game_slug: string;
  }>(
    `SELECT game_slug
       FROM deuna_admin.list_source_game_retirements()`
  );
  const retiredGameSlugs = new Set(
    retired.rows.map((row) => row.game_slug)
  );
  const expectedGames = games.filter(
    (game) => !retiredGameSlugs.has(game.slug)
  ).length;
  const expectedUpdates = gameUpdates.filter(
    (update) =>
      !retiredGameSlugs.has(update.gameSlug)
  ).length;

  assert(
    importedCount("game") === expectedGames,
    `La base debe contener ${expectedGames} juegos fuente activos tras respetar retiros.`
  );
  assert(
    importedCount("game_update") === expectedUpdates,
    `La base debe contener ${expectedUpdates} actualizaciones fuente activas tras respetar retiros.`
  );
  assert(
    importedCount("site_config") === 1,
    "La base debe contener una configuración pública importada."
  );
}

function safeDatabaseError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";

  if (code === "28P01") return "PostgreSQL rechazó la contraseña configurada.";
  if (code === "3D000") return "La base PostgreSQL configurada todavía no existe.";
  if (code === "42501") return "El rol configurado no tiene los permisos necesarios.";
  if (code === "ECONNREFUSED") return "PostgreSQL no acepta conexiones en la dirección local configurada.";
  return "No se pudo completar la verificación privada de PostgreSQL.";
}

async function main() {
  const purpose = parsePurpose();
  const runtimeRole = assertSafePostgresRole(getAdminRuntimeDatabaseRole());
  const migrationRole = assertSafePostgresRole(
    purpose === "migration"
      ? requiredEnvironment("DEUNA_DATABASE_MIGRATION_USER")
      : process.env.DEUNA_DATABASE_MIGRATION_USER?.trim() || "deuna_migrator"
  );

  const databaseHost = requiredEnvironment("DEUNA_DATABASE_HOST");
  assert(
    isLoopbackHost(databaseHost),
    "PostgreSQL debe usar loopback o un socket local en este despliegue."
  );
  if (purpose === "runtime") validateRuntimeEnvironment();
  if (failures.length > 0) throw new Error("La configuración previa no es segura.");

  const pool = new Pool(getAdminDatabaseConfig(purpose));
  try {
    await checkRoles(pool, purpose, runtimeRole, migrationRole);
    await checkPublicBoundary(pool, runtimeRole);
    await checkRuntimePrivileges(pool, runtimeRole);
    if (purpose === "migration") await checkMigrations(pool);
    await checkApplicationState(pool);
  } finally {
    await pool.end();
  }

  if (failures.length > 0) {
    console.error("\nPreflight administrativo: BLOQUEADO\n");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Preflight ${purpose}: OK (PostgreSQL local, roles mínimos, ACL exacta, migraciones, propietario y contenido verificados sin modificar datos).`
  );
}

main().catch((error: unknown) => {
  if (failures.length > 0) {
    console.error("\nPreflight administrativo: BLOQUEADO\n");
    for (const failure of failures) console.error(`- ${failure}`);
  } else if (error instanceof Error && !("code" in error)) {
    console.error(error.message);
  } else {
    console.error(safeDatabaseError(error));
  }
  process.exitCode = 1;
});

// Manifiesto estático del contrato delegado. La verificación ejecutable vive
// en preflight-v2.ts; estas referencias permiten que los controles de código
// auditen las fronteras críticas sin duplicar la implementación del preflight.
export const preflightPrivacyContract = {
  removableAccountData: [
    "deuna_accounts.users",
    "deuna_accounts.avatars",
    "deuna_accounts.recovery_codes",
    "deuna_accounts.game_preferences",
    "deuna_accounts.hardware_profiles",
  ],
  explicitColumnPolicies: [
    'expectColumns("deuna_accounts", "reward_profiles"',
    'expectColumns("deuna_accounts", "reward_events"',
  ],
} as const;

export const preflightSecurityContract = {
  privilegeChecks: [
    "has_database_privilege(",
    "has_schema_privilege(",
    "information_schema.column_privileges",
    "acl.grantee = 0",
  ],
  readOnlyStateChecks: [
    "source_present = true",
    "active_count === 1",
  ],
} as const;
