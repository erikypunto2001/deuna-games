import {
  readFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  hashAdminPassword,
  validateAdminPassword,
  verifyAdminPassword,
} from "../src/lib/admin/password.ts";
import {
  createAdminSessionToken,
  hashAdminSessionToken,
  isValidAdminSessionToken,
} from "../src/lib/admin/session-token.ts";
import { games } from "../src/data/games.ts";
import {
  gameUpdates,
} from "../src/data/update-records.ts";
import {
  hashEditorialPayload,
} from "../src/lib/admin/content-hash.ts";
import {
  resolveDevelopmentAdminRedirect,
} from "../src/lib/admin/local-origin.ts";
import {
  editorialGameSchema,
  editorialSiteConfigSchema,
  editorialUpdateSchema,
} from "../src/lib/admin/content-validation.ts";
import {
  editorialUpdateFormSchema,
} from "../src/lib/admin/content-forms.ts";
import {
  gameValuationSectionSchema,
} from "../src/lib/admin/game-editor-section-validation.ts";
import { siteConfig } from "../src/lib/site.ts";

const root = process.cwd();
const failures: string[] = [];

function assert(
  condition: unknown,
  message: string
) {
  if (!condition) failures.push(message);
}

const passwordFixture =
  "Frase-Privada-Extensa-2026!";
const firstHash =
  await hashAdminPassword(passwordFixture);
const secondHash =
  await hashAdminPassword(passwordFixture);

assert(
  firstHash !== secondHash,
  "Dos contraseñas iguales deben usar sales diferentes."
);
assert(
  await verifyAdminPassword(
    passwordFixture,
    firstHash
  ),
  "El hash administrativo no reconoce la contraseña correcta."
);
assert(
  !(await verifyAdminPassword(
    `${passwordFixture}x`,
    firstHash
  )),
  "El hash administrativo aceptó una contraseña incorrecta."
);
assert(
  validateAdminPassword("corta").length > 0,
  "La política aceptó una contraseña débil."
);

const tokenOne = createAdminSessionToken();
const tokenTwo = createAdminSessionToken();
const tokenHash = hashAdminSessionToken(tokenOne);

assert(
  tokenOne !== tokenTwo,
  "Los tokens de sesión deben ser únicos."
);
assert(
  isValidAdminSessionToken(tokenOne),
  "El token seguro generado no cumple su formato."
);
assert(
  /^[0-9a-f]{64}$/.test(tokenHash),
  "El hash del token no usa SHA-256 hexadecimal."
);
assert(
  !tokenHash.includes(tokenOne),
  "El token sin procesar no debe persistir en su hash."
);

for (const game of games) {
  assert(
    editorialGameSchema.safeParse(game).success,
    `El juego ${game.slug} no puede importarse al área editorial.`
  );
}

for (const update of gameUpdates) {
  assert(
    editorialUpdateSchema.safeParse(update).success,
    `La actualización ${update.id} no puede importarse al área editorial.`
  );
}

assert(
  editorialSiteConfigSchema.safeParse(siteConfig).success,
  "La configuración pública no puede importarse al área editorial."
);
assert(
  hashEditorialPayload({ b: 2, a: 1 }) ===
    hashEditorialPayload({ a: 1, b: 2 }),
  "El checksum editorial debe ser estable ante el orden de claves."
);
assert(
  !gameValuationSectionSchema.safeParse({
    expectedRevision: "1",
    rating: "9",
    valuationMode: "manual",
  }).success,
  "Valoración no debe aceptar una puntuación editorial fuera de rango."
);
assert(
  !editorialUpdateFormSchema.safeParse({
    expectedRevision: "1",
    version: "v1.0",
    publishedAt: "2026-02-31T12:00",
    type: "update",
    summary: "Resumen válido",
    featured: "false",
  }).success,
  "El editor no debe normalizar silenciosamente una fecha imposible."
);

assert(
  resolveDevelopmentAdminRedirect({
    adminOrigin: "http://localhost:3000",
    nodeEnvironment: "development",
    pathname: "/admin/login",
    requestHost: "127.0.0.1:3000",
  }) === "http://localhost:3000/admin/login",
  "El acceso local debe normalizar el alias loopback antes de pedir credenciales."
);
assert(
  resolveDevelopmentAdminRedirect({
    adminOrigin: "http://localhost:3000",
    nodeEnvironment: "production",
    pathname: "/admin/login",
    requestHost: "127.0.0.1:3000",
  }) === null,
  "Producción no debe aceptar alias del origen administrativo."
);
assert(
  [
    "localhost.ejemplo.test:3000",
    "127.0.0.1:3001",
  ].every(
    (requestHost) =>
      resolveDevelopmentAdminRedirect({
        adminOrigin: "http://localhost:3000",
        nodeEnvironment: "development",
        pathname: "/admin/login",
        requestHost,
      }) === null
  ),
  "La normalización local debe rechazar hosts parecidos y puertos distintos."
);

const migration = (
  await Promise.all(
    [
      "001_admin_foundation.sql",
      "002_editorial_workspace.sql",
    ].map((name) =>
      readFile(
        path.join(
          root,
          "database",
          "migrations",
          name
        ),
        "utf8"
      )
    )
  )
).join("\n");

for (const forbidden of [
  "ip_address",
  "user_agent",
  "fingerprint",
  "visitor_id",
  "geolocation",
]) {
  assert(
    !migration.toLowerCase().includes(forbidden),
    `La base administrativa no debe incluir ${forbidden}.`
  );
}

const nginx = await readFile(
  path.join(
    root,
    "ops",
    "nginx",
    "deuna-games.conf.example"
  ),
  "utf8"
);

assert(
  nginx.includes("allow 10.8.0.0/24;") &&
    nginx.includes("deny all;"),
  "El ejemplo Nginx debe cerrar el panel fuera de la VPN."
);
assert(
  !/proxy_set_header\s+(?:X-Real-IP|X-Forwarded-For)/i.test(
    nginx
  ),
  "Nginx no debe reenviar IP de visitantes a Next."
);
assert(
  nginx.includes("access_log off;") &&
    nginx.includes("error_log /dev/null crit;"),
  "Nginx no debe persistir logs que puedan contener IP."
);

const databaseConfig = await readFile(
  path.join(
    root,
    "src",
    "lib",
    "admin",
    "database-config.ts"
  ),
  "utf8"
);

assert(
  databaseConfig.includes("DEUNA_ADMIN_ORIGIN") &&
    databaseConfig.includes(
      'url.protocol !== "https:"'
    ),
  "El panel debe fijar un origen HTTPS explícito en producción."
);

const requestSecurity = await readFile(
  path.join(
    root,
    "src",
    "lib",
    "admin",
    "request-security.ts"
  ),
  "utf8"
);

assert(
  requestSecurity.includes(
    'Buffer.byteLength(body, "utf8")'
  ) &&
    !requestSecurity.includes("multipart/form-data"),
  "Los formularios deben verificar su tamaño real y rechazar multipart innecesario."
);

const sessionStore = await readFile(
  path.join(
    root,
    "src",
    "lib",
    "admin",
    "session-store.ts"
  ),
  "utf8"
);

const adminSessionAdapter = await readFile(
  path.join(
    root,
    "src",
    "lib",
    "admin",
    "session.ts"
  ),
  "utf8"
);

const adminAuthService = await readFile(
  path.join(
    root,
    "src",
    "lib",
    "admin",
    "auth-service.ts"
  ),
  "utf8"
);

assert(
  sessionStore.includes("createAdminSession") &&
    sessionStore.includes("resolveAdminSession") &&
    sessionStore.includes("revokeAdminSession") &&
    !sessionStore.includes("next/headers") &&
    !sessionStore.includes("next/navigation") &&
    adminAuthService.includes('from "./session-store"') &&
    adminSessionAdapter.includes('from "./session-store"'),
  "Persistencia y autenticación de sesiones Admin deben permanecer desacopladas del adaptador HTTP de Next."
);

const criticalAdminRoutes = await Promise.all(
  ["create", "status", "password"].map((action) =>
    readFile(
      path.join(root, "src", "app", "api", "admin", "accounts", action, "route.ts"),
      "utf8"
    )
  )
);

assert(
  criticalAdminRoutes.every(
    (source) =>
      source.includes("currentPassword") &&
      source.includes("reauthenticateAdmin(session.userId")
  ),
  "Crear, activar o restablecer administradores debe exigir reautenticación del Owner."
);


const destructiveEditorialRoutes = await Promise.all([
  path.join(
    root,
    "src",
    "app",
    "api",
    "admin",
    "content",
    "games",
    "[slug]",
    "delete",
    "route.ts"
  ),
  path.join(
    root,
    "src",
    "app",
    "api",
    "admin",
    "content",
    "maintenance",
    "history-reset",
    "route.ts"
  ),
  path.join(
    root,
    "src",
    "app",
    "api",
    "admin",
    "content",
    "maintenance",
    "history-reset",
    "home",
    "route.ts"
  ),
  path.join(
    root,
    "src",
    "app",
    "api",
    "admin",
    "content",
    "games",
    "[slug]",
    "history",
    "publications",
    "reset",
    "route.ts"
  ),
  path.join(
    root,
    "src",
    "app",
    "api",
    "admin",
    "content",
    "games",
    "[slug]",
    "history",
    "reset",
    "route.ts"
  ),
  path.join(
    root,
    "src",
    "app",
    "api",
    "admin",
    "content",
    "maintenance",
    "media-cleanup",
    "[slug]",
    "route.ts"
  ),
].map((file) => readFile(file, "utf8")));

assert(
  destructiveEditorialRoutes.every(
    (source) =>
      source.includes("currentPassword") &&
      source.includes("reauthenticateAdmin(")
  ),
  "Borrado y compactaciones editoriales deben reautenticar al Owner."
);

const editorialCleanupMigration = await readFile(
  path.join(
    root,
    "database",
    "migrations",
    "015_editorial_cleanup.sql"
  ),
  "utf8"
);

const gameHistoryCleanupMigration = await readFile(
  path.join(
    root,
    "database",
    "migrations",
    "016_game_history_cleanup.sql"
  ),
  "utf8"
);

const mediaCleanupRecoveryMigration = await readFile(
  path.join(
    root,
    "database",
    "migrations",
    "017_game_media_cleanup_recovery.sql"
  ),
  "utf8"
);

assert(
  editorialCleanupMigration.includes(
    "IF target.public_visible THEN"
  ) &&
    editorialCleanupMigration.includes(
      "'outcome', 'still_public'"
    ) &&
    editorialCleanupMigration.includes(
      "action IN ('bootstrap', 'published', 'rollback', 'baseline')"
    ),
  "El hard-delete debe exigir contenido oculto y la compactación debe registrar un baseline explícito."
);

assert(
  gameHistoryCleanupMigration.includes(
    "compact_editorial_publication_history"
  ) &&
    gameHistoryCleanupMigration.includes(
      "DELETE FROM deuna_admin.editorial_publications"
    ) &&
    !gameHistoryCleanupMigration.includes(
      "DELETE FROM deuna_admin.editorial_revisions"
    ) &&
    gameHistoryCleanupMigration.includes(
      "editorial_publication_history_compacted"
    ),
  "Limpiar snapshots por juego debe conservar revisiones, crear un único baseline publicado y dejar auditoría."
);

assert(
  mediaCleanupRecoveryMigration.includes(
    "game_media_cleanup_queue"
  ) &&
    mediaCleanupRecoveryMigration.includes(
      "AFTER DELETE ON deuna_admin.editorial_items"
    ) &&
    mediaCleanupRecoveryMigration.includes(
      "BEFORE INSERT ON deuna_admin.editorial_items"
    ) &&
    mediaCleanupRecoveryMigration.includes(
      "begin_game_media_cleanup"
    ) &&
    mediaCleanupRecoveryMigration.includes(
      "complete_game_media_cleanup"
    ),
  "El hard-delete debe registrar la limpieza multimedia en la misma transacción, bloquear reutilización del slug y permitir un reintento Owner."
);

const editorialMaintenanceService = await readFile(
  path.join(
    root,
    "src",
    "lib",
    "admin",
    "editorial-maintenance-service.ts"
  ),
  "utf8"
);
const editorialMediaLibrary = await readFile(
  path.join(
    root,
    "src",
    "lib",
    "media",
    "editorial-media-library.ts"
  ),
  "utf8"
);

assert(
  editorialMaintenanceService.includes(
    "inspectEditorialMediaDeletionInventory"
  ) &&
    editorialMaintenanceService.includes(
      "deleteAllEditorialMediaResources"
    ) &&
    !editorialMaintenanceService.includes(
      "listEditorialMediaLibrary(slug)"
    ) &&
    editorialMediaLibrary.includes(
      "deleteAllEditorialMediaResources"
    ),
  "El hard-delete debe usar inventario multimedia destructivo completo y no la biblioteca visual limitada."
);

const migrator = await readFile(
  path.join(
    root,
    "tools",
    "admin",
    "migrate.ts"
  ),
  "utf8"
);

const ownerCreator = await readFile(
  path.join(
    root,
    "tools",
    "admin",
    "create-owner.ts"
  ),
  "utf8"
);

const ownerPasswordChanger = await readFile(
  path.join(
    root,
    "tools",
    "admin",
    "change-owner-password.ts"
  ),
  "utf8"
);

assert(
  ownerCreator.includes(
    "VALUES ($1::uuid, 'owner_created', 'admin_user', $2::text)"
  ) && ownerCreator.includes("[id, id]"),
  "La auditoría inicial debe usar parámetros separados para UUID y texto."
);

assert(
  ownerPasswordChanger.includes(
    "SET password_hash = $2"
  ) &&
    ownerPasswordChanger.includes(
      "failed_login_count = 0"
    ) &&
    ownerPasswordChanger.includes(
      "locked_until = NULL"
    ) &&
    ownerPasswordChanger.includes(
      "SET revoked_at = COALESCE(revoked_at, now())"
    ) &&
    ownerPasswordChanger.includes(
      "owner_password_changed"
    ),
  "El cambio de contraseña debe desbloquear la cuenta, revocar sesiones y dejar auditoría mínima."
);

assert(
  migrator.includes(
    "GRANT UPDATE (revoked_at)"
  ) &&
    !migrator.includes(
      "GRANT SELECT, INSERT, UPDATE, DELETE"
    ) &&
    !/GRANT\s+DELETE\s+ON\s+deuna_accounts\.sessions\b/i.test(
      migrator
    ),
  "El rol runtime debe usar permisos de columna y no borrar sesiones directamente."
);

const localSetup = await readFile(
  path.join(
    root,
    "tools",
    "setup-local-server.sh"
  ),
  "utf8"
);

const packageManifest = JSON.parse(
  await readFile(
    path.join(root, "package.json"),
    "utf8"
  )
) as {
  scripts?: Record<string, string>;
};

const nextRunner = await readFile(
  path.join(root, "tools", "run-next.mjs"),
  "utf8"
);

assert(
  packageManifest.scripts?.[
    "admin:change-password"
  ]?.includes(
    "--env-file=.env.admin-migration.local"
  ),
  "El cambio de contraseña debe usar únicamente las credenciales privadas de migración."
);

assert(
  localSetup.includes("set -Eeuo pipefail") &&
    localSetup.includes("umask 077") &&
    localSetup.includes(
      'NEXT_TELEMETRY_DISABLED=1'
    ) &&
    localSetup.includes(
      'NEXT_PUBLIC_SITE_URL=http://localhost:3000'
    ) &&
    localSetup.includes(
      'DEUNA_ADMIN_ORIGIN=http://localhost:3000'
    ),
  "El instalador local debe fallar cerrado, proteger archivos y desactivar telemetría."
);

assert(
  localSetup.includes(
    "PostgreSQL escucha en"
  ) &&
    localSetup.includes(
      "Debe escuchar sólo en localhost"
    ) &&
    localSetup.includes(
      "data_checksums=on"
    ),
  "El instalador local debe rechazar PostgreSQL expuesto o sin checksums."
);

assert(
  localSetup.includes(
    "openssl rand -hex 32"
  ) &&
    localSetup.includes(
      'chmod 600 -- "${MIGRATION_ENV}"'
    ) &&
    localSetup.includes(
      'chmod 600 -- "${RUNTIME_ENV}"'
    ) &&
    !localSetup.includes("set -x") &&
    !localSetup.includes("curl") &&
    !localSetup.includes("wget"),
  "El instalador local debe generar secretos privados sin descargar ni trazar comandos."
);

assert(
  packageManifest.scripts?.dev?.includes(
    "--hostname 127.0.0.1"
  ) &&
    packageManifest.scripts?.["dev:webpack"]?.includes(
      "--hostname 127.0.0.1"
    ),
  "Los servidores de desarrollo deben escuchar sólo en loopback."
);

assert(
  nextRunner.includes(
    'NEXT_TELEMETRY_DISABLED: "1"'
  ) &&
    ["dev", "dev:webpack", "build", "start"].every(
      (name) =>
        packageManifest.scripts?.[name]?.includes(
          "tools/run-next.mjs"
        )
    ),
  "Next.js debe ejecutarse siempre mediante el wrapper sin telemetría."
);
assert(
  !/GRANT\s+DELETE\s+ON\s+deuna_admin\./i.test(
    migrator
  ) &&
    migrator.includes(
      "GRANT UPDATE (\n        draft_payload"
    ),
  "El rol runtime no debe borrar contenido administrativo y sólo puede actualizar el borrador."
);

const importer = await readFile(
  path.join(
    root,
    "tools",
    "admin",
    "import-content.ts"
  ),
  "utf8"
);

assert(
  importer.includes(
    'current.draft_status === "modified"'
  ) &&
    !/\bDELETE\s+FROM\b/i.test(importer),
  "El importador debe preservar borradores modificados y registros ausentes."
);

const contentService = await readFile(
  path.join(
    root,
    "src",
    "lib",
    "admin",
    "content-service.ts"
  ),
  "utf8"
);

assert(
  contentService.includes("FOR UPDATE") &&
    contentService.includes("draft_restored") &&
    contentService.includes("admin_audit_log"),
  "La edición debe controlar concurrencia, permitir recuperación y auditar cambios."
);

const systemd = await readFile(
  path.join(
    root,
    "ops",
    "systemd",
    "deuna-games.service.example"
  ),
  "utf8"
);

assert(
  systemd.includes("HOSTNAME=127.0.0.1") &&
    systemd.includes("IPAddressDeny=any") &&
    systemd.includes("IPAddressAllow=localhost") &&
    systemd.includes("NoNewPrivileges=true"),
  "El servicio de producción debe quedar aislado y limitado a loopback."
);

const runtimeEnvironment = await readFile(
  path.join(root, ".env.example"),
  "utf8"
);

assert(
  !runtimeEnvironment.includes(
    "DEUNA_DATABASE_MIGRATION_PASSWORD"
  ),
  "Las credenciales de migración no deben estar en el entorno cargado por Next.js."
);

const preflight = await readFile(
  path.join(
    root,
    "tools",
    "admin",
    "preflight.ts"
  ),
  "utf8"
);

assert(
  preflight.includes(
    'has_database_privilege('
  ) &&
    preflight.includes(
      'has_schema_privilege('
    ) &&
    preflight.includes(
      'information_schema.column_privileges'
    ) &&
    preflight.includes(
      'acl.grantee = 0'
    ),
  "El preflight debe verificar privilegios mínimos y el cierre de PUBLIC."
);
assert(
  preflight.includes(
    'source_present = true'
  ) &&
    preflight.includes(
      'active_count === 1'
    ) &&
    !/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO|FROM|TABLE|deuna_admin)/i.test(
      preflight
    ),
  "El preflight debe validar propietario y contenido sin modificar datos."
);

const deployGuide = await readFile(
  path.join(
    root,
    "ops",
    "deploy",
    "README.md"
  ),
  "utf8"
);

assert(
  deployGuide.includes(
    "DEUNA_ADMIN_ENABLED=false"
  ) &&
    deployGuide.includes("`403`") &&
    deployGuide.includes(
      "No hacen falta contraseñas ni claves privadas en el chat."
    ),
  "La guía de despliegue debe mantener el panel cerrado y exigir la prueba fuera de la VPN."
);

if (failures.length > 0) {
  console.error("\nSeguridad administrativa: ERROR\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  "Seguridad administrativa: OK (scrypt, sesiones opacas, edición versionada sin rastreo y cierre por VPN verificados)."
);
