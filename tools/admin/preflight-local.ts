import process from "node:process";

import { Pool } from "pg";

import { games } from "../../src/data/games.ts";
import {
  gameUpdates,
} from "../../src/data/update-records.ts";
import {
  parseEditorialPayload,
  type EditorialItemType,
} from "../../src/lib/admin/content-validation.ts";
import {
  getAdminDatabaseConfig,
  getAdminRuntimeDatabaseRole,
} from "../../src/lib/admin/database-config.ts";

type WorkspaceRow = {
  item_type: EditorialItemType;
  item_key: string;
  source_present: boolean;
  public_visible: boolean;
  published_payload: unknown;
  published_checksum: string;
  publication_number: number;
};

type ContentCountRow = {
  item_type: string;
  count: number;
};


const failures: string[] = [];

function assert(
  condition: unknown,
  message: string
) {
  if (!condition) failures.push(message);
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }

  return value;
}

function validateLocalEnvironment() {
  const siteUrl = new URL(
    requiredEnvironment("NEXT_PUBLIC_SITE_URL")
  );
  const adminOrigin = new URL(
    requiredEnvironment("DEUNA_ADMIN_ORIGIN")
  );
  const databaseHost = requiredEnvironment(
    "DEUNA_DATABASE_HOST"
  );
  const accountDataKey = requiredEnvironment(
    "DEUNA_ACCOUNT_DATA_KEY"
  );
  const accountSessionDays = Number(
    process.env.DEUNA_ACCOUNT_SESSION_DAYS?.trim() || "30"
  );

  assert(
    siteUrl.origin === "http://localhost:3000" &&
      (siteUrl.pathname === "/" || siteUrl.pathname === ""),
    "NEXT_PUBLIC_SITE_URL debe ser exactamente http://localhost:3000 en el entorno local."
  );
  assert(
    adminOrigin.origin === "http://localhost:3000" &&
      (adminOrigin.pathname === "/" || adminOrigin.pathname === ""),
    "DEUNA_ADMIN_ORIGIN debe ser exactamente http://localhost:3000 en el entorno local."
  );
  assert(
    process.env.DEUNA_ADMIN_ENABLED === "true",
    "DEUNA_ADMIN_ENABLED debe ser true para probar el panel local."
  );
  assert(
    databaseHost === "127.0.0.1" ||
      databaseHost === "localhost" ||
      databaseHost === "::1" ||
      databaseHost.startsWith("/"),
    "PostgreSQL local debe permanecer en loopback o socket local."
  );
  assert(
    /^[A-Za-z0-9_-]{43}$/.test(accountDataKey) &&
      Buffer.from(accountDataKey, "base64url").length === 32,
    "DEUNA_ACCOUNT_DATA_KEY debe ser una clave base64url aleatoria de 32 bytes."
  );
  assert(
    Number.isInteger(accountSessionDays) &&
      accountSessionDays >= 1 &&
      accountSessionDays <= 90,
    "DEUNA_ACCOUNT_SESSION_DAYS debe estar entre 1 y 90."
  );
}

async function checkRuntimeIdentity(pool: Pool) {
  const runtimeRole =
    getAdminRuntimeDatabaseRole();
  const result = await pool.query<{
    user_name: string;
    database_name: string;
  }>(
    `SELECT current_user AS user_name,
            current_database() AS database_name`
  );

  assert(
    result.rows[0]?.user_name === runtimeRole,
    "El preflight local no está conectado con el rol runtime esperado."
  );
  assert(
    result.rows[0]?.database_name ===
      requiredEnvironment("DEUNA_DATABASE_NAME"),
    "El preflight local no está conectado a la base configurada."
  );
}

async function checkOwner(pool: Pool) {
  const result = await pool.query<{
    active_count: number;
  }>(
    `SELECT count(id)::integer AS active_count
       FROM deuna_admin.admin_users
      WHERE active = true
        AND role = 'owner'`
  );

  assert(
    result.rows[0]?.active_count === 1,
    "Debe existir exactamente una cuenta propietaria activa."
  );
}

async function checkAccountSchema(pool: Pool) {
  const result = await pool.query<{
    schema_name: string | null;
    users_table: string | null;
    sessions_table: string | null;
    recovery_table: string | null;
  }>(
    `SELECT
       to_regnamespace('deuna_accounts')::text AS schema_name,
       to_regclass('deuna_accounts.users')::text AS users_table,
       to_regclass('deuna_accounts.sessions')::text AS sessions_table,
       to_regclass('deuna_accounts.recovery_codes')::text AS recovery_table`
  );
  const state = result.rows[0];

  assert(
    state?.schema_name === "deuna_accounts" &&
      state.users_table === "deuna_accounts.users" &&
      state.sessions_table === "deuna_accounts.sessions" &&
      state.recovery_table === "deuna_accounts.recovery_codes",
    "La base local no contiene la fundación completa de cuentas privadas."
  );
}

async function checkSourceContent(pool: Pool) {
  const result = await pool.query<ContentCountRow>(
    `SELECT item_type,
            count(id)::integer AS count
       FROM deuna_admin.editorial_items
      WHERE source_present = true
      GROUP BY item_type`
  );
  const counts = new Map(
    result.rows.map((row) => [
      row.item_type,
      row.count,
    ])
  );
  const countFor = (type: EditorialItemType) =>
    counts.get(type) ?? 0;

  assert(
    countFor("game") === games.length,
    `La base debe contener ${games.length} juegos fuente importados.`
  );
  assert(
    countFor("game_update") === gameUpdates.length,
    `La base debe contener ${gameUpdates.length} actualizaciones fuente importadas.`
  );
  assert(
    countFor("site_config") === 1,
    "Falta la configuración pública importada."
  );
  assert(
    countFor("home_config") === 1,
    "Falta la configuración editorial de Portada."
  );
  assert(
    countFor("about_config") === 1,
    "Falta la configuración editorial de Quiénes somos."
  );
  assert(
    countFor("game_taxonomy") === 1,
    "Falta el catálogo maestro de juegos."
  );
  assert(
    countFor("public_pages_config") === 1,
    "Falta la configuración editorial de superficies públicas."
  );
}

async function checkPublishedWorkspace(pool: Pool) {
  const expected = [
    ["site_config", "site"],
    ["home_config", "home"],
    ["about_config", "about"],
    ["game_taxonomy", "games"],
    ["public_pages_config", "public-pages"],
    ["platform_catalog", "platforms"],
  ] as const;
  const result = await pool.query<WorkspaceRow>(
    `SELECT item_type,
            item_key,
            source_present,
            public_visible,
            published_payload,
            published_checksum,
            publication_number
       FROM deuna_admin.editorial_items
      WHERE (item_type, item_key) IN (
        ('site_config', 'site'),
        ('home_config', 'home'),
        ('about_config', 'about'),
        ('game_taxonomy', 'games'),
        ('public_pages_config', 'public-pages'),
        ('platform_catalog', 'platforms')
      )`
  );

  for (const [type, key] of expected) {
    const row = result.rows.find(
      (candidate) =>
        candidate.item_type === type &&
        candidate.item_key === key
    );

    assert(
      Boolean(row),
      `No existe el workspace editorial ${type}:${key}.`
    );

    if (!row) continue;

    assert(
      row.source_present,
      `${type}:${key} no conserva su fuente importada.`
    );
    assert(
      row.public_visible,
      `${type}:${key} no tiene un snapshot público visible.`
    );
    assert(
      /^[0-9a-f]{64}$/.test(row.published_checksum),
      `${type}:${key} no tiene un checksum publicado válido.`
    );
    assert(
      Number.isInteger(row.publication_number) &&
        row.publication_number >= 1,
      `${type}:${key} no tiene un número de publicación válido.`
    );

    try {
      parseEditorialPayload(
        type,
        row.published_payload
      );
    } catch {
      failures.push(
        `${type}:${key} contiene un snapshot publicado inválido.`
      );
    }
  }

}

function safeDatabaseError(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";

  switch (code) {
    case "28P01":
      return "PostgreSQL rechazó la contraseña del rol runtime local.";
    case "3D000":
      return "La base PostgreSQL local todavía no existe.";
    case "42501":
      return "El rol runtime local no tiene los permisos mínimos esperados.";
    case "ECONNREFUSED":
      return "PostgreSQL no está aceptando conexiones locales.";
    default:
      return "No se pudo completar el preflight local. Revisa PostgreSQL y .env.local.";
  }
}

async function main() {
  validateLocalEnvironment();

  if (failures.length > 0) {
    throw new Error(
      "La configuración local previa no coincide con el entorno seguro esperado."
    );
  }

  const pool = new Pool(
    getAdminDatabaseConfig("runtime")
  );

  try {
    await checkRuntimeIdentity(pool);
    await checkOwner(pool);
    await checkAccountSchema(pool);
    await checkSourceContent(pool);
    await checkPublishedWorkspace(pool);
  } finally {
    await pool.end();
  }

  if (failures.length > 0) {
    console.error("\nPreflight local: BLOQUEADO\n");
    failures.forEach((failure) =>
      console.error(`- ${failure}`)
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Preflight local: OK (${games.length} juegos, ${gameUpdates.length} actualizaciones, cuentas privadas, identidad, Portada, Quiénes somos, Catálogos y superficies públicas con snapshots publicados vigentes verificados sin modificar datos).`
  );
}

main().catch((error: unknown) => {
  if (failures.length > 0) {
    console.error("\nPreflight local: BLOQUEADO\n");
    failures.forEach((failure) =>
      console.error(`- ${failure}`)
    );
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(safeDatabaseError(error));
  }

  process.exitCode = 1;
});
