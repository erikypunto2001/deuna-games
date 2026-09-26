import {
  readFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function source(relativePath) {
  return readFile(
    path.join(root, relativePath),
    "utf8"
  );
}

const [packageSource, localPreflight] =
  await Promise.all([
    source("package.json"),
    source("tools/admin/preflight-local.ts"),
  ]);
const packageJson = JSON.parse(packageSource);
const scripts = packageJson.scripts ?? {};

assert(
  scripts["admin:update-local"] ===
    "npm run db:migrate && npm run admin:import-content && npm run admin:purge-junk:check && npm run admin:purge-media-junk:check && npm run admin:preflight",
  "admin:update-local debe aplicar migraciones, importar contenido, diagnosticar residuos sin borrarlos y terminar con el preflight completo, sin recrear propietario ni contraseña."
);
assert(
  scripts["admin:preflight"] ===
    "npm run admin:preflight:migration && npm run admin:preflight:local",
  "admin:preflight debe verificar migraciones y después el workspace local."
);
assert(
  typeof scripts["admin:preflight:local"] === "string" &&
    scripts["admin:preflight:local"].includes(
      "--env-file=.env.local"
    ) &&
    scripts["admin:preflight:local"].includes(
      "preflight-local.ts"
    ),
  "El preflight local debe cargar únicamente .env.local y usar su comprobador dedicado."
);
assert(
  typeof scripts["admin:preflight:runtime"] === "string" &&
    scripts["admin:preflight:runtime"].includes(
      "--purpose=runtime"
    ) &&
    !scripts["admin:preflight:runtime"].includes(
      ".env.local"
    ),
  "El preflight de producción no debe reutilizar el entorno HTTP local."
);

for (const required of [
  '"site_config", "site"',
  '"home_config", "home"',
  '"about_config", "about"',
  '"public_pages_config", "public-pages"',
  '"platform_catalog", "platforms"',
  "published_payload",
  "published_checksum",
  "public_visible",
  "parseEditorialPayload",
  "current_user",
]) {
  assert(
    localPreflight.includes(required),
    `El preflight local debe conservar la comprobación ${required}.`
  );
}

assert(
  !localPreflight.includes("editorial_revisions") &&
    !localPreflight.includes("editorial_publications"),
  "El preflight local no debe depender de tablas de historial restaurable retiradas."
);

assert(
  localPreflight.includes("counts.get(type) ?? 0") &&
    localPreflight.includes(
      'countFor("game_update") === gameUpdates.length'
    ),
  "El preflight local debe tratar como cero los tipos sin filas agrupadas para soportar colecciones fuente vacías sin falsos bloqueos."
);

const sqlQueries = [
  ...localPreflight.matchAll(
    /pool\.query(?:<[\s\S]*?>)?\(\s*`([\s\S]*?)`/g
  ),
].map((match) => match[1].trim());

assert(
  sqlQueries.length >= 5,
  "El preflight local debe mantener sus consultas explícitas bajo inspección."
);
assert(
  sqlQueries.every((query) => /^SELECT\b/i.test(query)),
  "El preflight local debe permanecer estrictamente de sólo lectura: todas sus consultas deben ser SELECT."
);
assert(
  localPreflight.includes(
    'siteUrl.origin === "http://localhost:3000"'
  ) &&
    localPreflight.includes(
      'adminOrigin.origin === "http://localhost:3000"'
    ) &&
    localPreflight.includes(
      'process.env.DEUNA_ADMIN_ENABLED === "true"'
    ),
  "El preflight local debe exigir el origen local exacto y el panel habilitado."
);

if (failures.length > 0) {
  console.error("\nPreflight administrativo: REGRESIÓN\n");
  failures.forEach((failure) =>
    console.error(`- ${failure}`)
  );
  process.exitCode = 1;
} else {
  console.log(
    "Preflight administrativo: OK (actualización local segura, colecciones fuente vacías soportadas, local y producción separados; workspace editorial current-only completo y chequeo local de sólo lectura protegidos)."
  );
}
