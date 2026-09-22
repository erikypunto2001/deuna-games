import { spawnSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function repoRelative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

const packageManifest = JSON.parse(
  await read("package.json")
);
const scripts = packageManifest.scripts ?? {};

const trackedFilesResult = spawnSync(
  "git",
  ["ls-files", "-z"],
  { encoding: "utf8" }
);
assert(
  trackedFilesResult.status === 0,
  `No se pudo enumerar el árbol versionado: ${trackedFilesResult.stderr.trim() || "git ls-files falló"}.`
);
const trackedFiles = trackedFilesResult.status === 0
  ? trackedFilesResult.stdout.split("\0").filter(Boolean)
  : [];

const forbiddenTrackedPatterns = [
  {
    pattern: /(^|\/)(?:legacy-archive|theme-recovery-backup-[^/]*|payload|DEUNA_ANALISIS_COMPLETO)(?:\/|$)/i,
    label: "directorio de backup/análisis temporal",
  },
  {
    pattern: /\.(?:log|tmp|temp|bak|backup|dump|orig|rej|swp|zip)$/i,
    label: "archivo temporal, backup, dump o paquete generado",
  },
  {
    pattern: /(^|\/)(?:PROJECT_CONTEXT|PROJECT_REVIEW|PROJECT_AUDIT|PROJECT_COLOR_AUDIT|PROJECT_VISUAL_AUDIT|DEBUG_REPORT).*\.md$/i,
    label: "reporte local de análisis",
  },
  {
    pattern: /(^|\/)(?:APLICAR-|REPARAR-|RECUPERAR-|LIMPIEZA-SEGURA-|PREPARAR-DEUNA-|FIX-|FORZAR-|LIMPIAR-).*\.ps1$/i,
    label: "script temporal de reparación",
  },
];

for (const file of trackedFiles) {
  for (const { pattern, label } of forbiddenTrackedPatterns) {
    assert(
      !pattern.test(file),
      `${file} es un ${label} y no debe estar versionado.`
    );
  }
}

for (const removedRecoveryFile of [
  "src/components/admin/useInitialSessionStorageSnapshot.ts",
  "tools/check-home-recovery-gate.mjs",
  "tools/home-live-recovery-browser-smoke.mjs",
]) {
  assert(
    !trackedFiles.includes(removedRecoveryFile),
    `${removedRecoveryFile} pertenece al recovery local retirado y no debe volver al repo.`
  );
}

for (const retiredVersionedTool of [
  "tools/admin/preflight-v2.ts",
  "tools/check-performance-editorial-v2.mjs",
  "tools/check-game-editorial-flow-v3.mjs",
  "tools/check-game-taxonomy-editorial-v2.mjs",
  "tools/check-multimedia-v2-hardening.mjs",
]) {
  assert(
    !trackedFiles.includes(retiredVersionedTool),
    `${retiredVersionedTool} es una implementación histórica reemplazada y no debe volver al repo.`
  );
}

for (const [label, relativePath] of [
  ["Curaduría de Inicio", "src/components/admin/HomeCurationEditor.tsx"],
  ["Presentación de Inicio", "src/components/admin/HomePresentationEditor.tsx"],
  ["Visualización de filas", "src/components/admin/HomeRowRevealEditor.tsx"],
  ["Hero de Inicio", "src/components/admin/HomeHeroEditor.tsx"],
  ["Guardado de Hero", "src/components/admin/HomeHeroSaveBoundary.tsx"],
]) {
  const content = await read(relativePath);
  assert(
    !content.includes("sessionStorage") &&
      !content.includes("deuna:home-curation-draft") &&
      !content.includes("deuna:home-presentation-draft") &&
      !content.includes("deuna:home-row-reveal-draft") &&
      !content.includes("deuna:hero-draft:"),
    `${label} no debe reintroducir recovery local paralelo al borrador de servidor.`
  );
}

for (const script of [
  "admin:test-user",
  "admin:diagnose-login",
  "admin:auth-status",
  "admin:diagnose",
]) {
  assert(
    !Object.hasOwn(scripts, script),
    `El comando temporal ${script} no debe volver a package.json.`
  );
}

assert(
  scripts["check:maintenance"]?.includes(
    "tools/check-maintenance.mjs"
  ),
  "El control de mantenimiento debe permanecer integrado en package.json."
);

assert(
  scripts["admin:purge-junk:check"] ===
    "node --env-file=.env.admin-migration.local ./tools/admin/purge-junk.ts" &&
    scripts["admin:purge-junk"] ===
      "node --env-file=.env.admin-migration.local ./tools/admin/purge-junk.ts --apply",
  "La purga de basura transitoria debe conservar modos lectura/aplicar explícitos."
);

assert(
  scripts["admin:purge-media-junk:check"] ===
    "node --conditions=react-server --env-file=.env.local ./tools/admin/purge-orphan-editorial-media.ts" &&
    scripts["admin:purge-media-junk"] ===
      "node --conditions=react-server --env-file=.env.local ./tools/admin/purge-orphan-editorial-media.ts --apply",
  "La higiene de assets editoriales debe usar el rol runtime de sólo lectura y conservar modos lectura/aplicar explícitos."
);

assert(
  scripts["admin:update-local"] ===
    "npm run db:migrate && npm run admin:import-content && npm run admin:purge-junk:check && npm run admin:purge-media-junk:check && npm run admin:preflight",
  "La actualización local debe diagnosticar residuos sin eliminarlos automáticamente."
);

const localSetupForPurge = await read("tools/setup-local-server.sh");
const localSetupLines = localSetupForPurge
  .split("\n")
  .map((line) => line.trim());
assert(
  localSetupLines.includes("npm run admin:purge-junk:check") &&
    localSetupLines.includes("npm run admin:purge-media-junk:check") &&
    !localSetupLines.includes("npm run admin:purge-junk") &&
    !localSetupLines.includes("npm run admin:purge-media-junk"),
  "El setup local debe diagnosticar basura sin ejecutar purgas destructivas."
);

const localBackup = await read("tools/admin/backup-local.ts");
assert(
  localBackup.includes("const MAX_LOCAL_BACKUPS = 3;") &&
    localBackup.includes("LOCAL_BACKUP_PATTERN") &&
    localBackup.includes("backups.slice(MAX_LOCAL_BACKUPS)") &&
    localBackup.includes("pruneOldLocalBackups(backupDirectory)"),
  "El backup pre-migración debe conservar sólo las 3 copias locales propias más recientes."
);

const purgeMediaJunk = await read(
  "tools/admin/purge-orphan-editorial-media.ts"
);
const taxonomyIconStorage = await read(
  "src/lib/media/taxonomy-icon-upload.ts"
);
const taxonomyIconPolicy = await read(
  "src/lib/media/taxonomy-icon-policy.ts"
);
const editorialUpload = await read(
  "src/lib/media/editorial-upload.ts"
);
const backgroundPolicy = await read(
  "src/lib/site/backgrounds.ts"
);
const backgroundUploadRoute = await read(
  "src/app/api/admin/content/configuration/background-upload/route.ts"
);
const siteBackgroundManager = await read(
  "src/components/admin/SiteBackgroundManager.tsx"
);
const contentValidationCore = await read(
  "src/lib/admin/content-validation-core.ts"
);
assert(
  taxonomyIconStorage.includes("utimes") &&
    taxonomyIconStorage.includes("await utimes(filePath, now, now)") &&
    taxonomyIconStorage.includes("reused = true") &&
    editorialUpload.includes("slug === SITE_BACKGROUND_MEDIA_SLUG") &&
    editorialUpload.includes("await utimes(filePath, now, now)"),
  "Reutilizar un asset purgable de logo, taxonomía o fondo debe renovar su gracia antes de que pueda ser considerado huérfano."
);

assert(
  taxonomyIconPolicy.includes('TAXONOMY_ICON_SLUG = "taxonomy-icons"') &&
    taxonomyIconPolicy.includes("taxonomyIconAssetPattern") &&
    taxonomyIconStorage.includes("TAXONOMY_ICON_SLUG") &&
    contentValidationCore.includes("taxonomyIconAssetPattern") &&
    backgroundPolicy.includes('SITE_BACKGROUND_MEDIA_SLUG = "site-backgrounds"') &&
    backgroundPolicy.includes("siteBackgroundAssetPattern") &&
    backgroundUploadRoute.includes("SITE_BACKGROUND_MEDIA_SLUG") &&
    editorialUpload.includes("SITE_BACKGROUND_MEDIA_SLUG") &&
    purgeMediaJunk.includes("taxonomyIconAssetPattern") &&
    purgeMediaJunk.includes("siteBackgroundAssetPattern"),
  "Upload, validación y purga deben compartir las mismas policies de rutas hash para taxonomía y Fondos."
);

const backgroundBusyGuards =
  siteBackgroundManager.match(/disabled={uploadBusy}/g) ?? [];
assert(
  siteBackgroundManager.includes("const uploadLock = useRef(false)") &&
    siteBackgroundManager.includes("if (uploadLock.current) return") &&
    siteBackgroundManager.includes("uploadLock.current = true") &&
    siteBackgroundManager.includes("uploadLock.current = false") &&
    backgroundBusyGuards.length >= 3,
  "Fondos debe serializar uploads y bloquear nombre, archivo y guardado del fondo mientras la carga está en curso."
);

for (const requiredGuard of [
  'getAdminDatabaseConfig("runtime")',
  "getEditorialMediaRoot",
  "MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1_000",
  "item.source_payload",
  "item.draft_payload",
  "item.published_payload",
  "editorial_revisions",
  "editorial_publications",
  "siteBrandLogoAssetPattern",
  "taxonomyIconAssetPattern",
  "siteBackgroundAssetPattern",
  "SITE_BACKGROUND_MEDIA_SLUG",
  "const currentReferences =",
  "await loadProtectedReferences(pool)",
  "stats.isSymbolicLink()",
]) {
  assert(
    purgeMediaJunk.includes(requiredGuard),
    `La purga multimedia debe conservar la guarda ${requiredGuard}.`
  );
}
assert(
  purgeMediaJunk.includes("unlink(candidate.filePath)") &&
    !purgeMediaJunk.includes("DELETE FROM"),
  "La purga multimedia sólo debe eliminar archivos físicos huérfanos y nunca mutar PostgreSQL."
);
assert(
  purgeMediaJunk.includes("if (unexpected.length > 0)") &&
    purgeMediaJunk.includes("process.exitCode = 1;\n      return;"),
  "La purga multimedia debe abortar toda eliminación cuando detecta entradas inesperadas o symlinks."
);

const purgeJunk = await read("tools/admin/purge-junk.ts");
for (const allowedDelete of [
  "DELETE FROM deuna_admin.admin_sessions",
  "DELETE FROM deuna_accounts.sessions",
  "DELETE FROM deuna_accounts.recovery_codes",
  "DELETE FROM deuna_admin.admin_events",
]) {
  assert(
    purgeJunk.includes(allowedDelete),
    `La purga transitoria debe conservar ${allowedDelete}.`
  );
}
assert(
  purgeJunk.includes("occurred_at < now() - interval '90 days'"),
  "Los eventos operativos de autenticación sólo deben purgarse después de 90 días."
);

const ciWorkflow = await read(".github/workflows/ci.yml");
assert(
  ciWorkflow.includes("retention-days: 1"),
  "La evidencia visual de CI debe expirar después de 1 día para no acumular artifacts."
);

assert(
  scripts["repo:housekeeping"] ===
    "node ./tools/repository-housekeeping.mjs",
  "El housekeeping remoto debe conservar un único entrypoint canónico."
);

const repositoryHousekeeping = await read(
  "tools/repository-housekeeping.mjs"
);
for (const requiredGuard of [
  'process.env.GITHUB_ACTIONS !== "true"',
  '"/pulls?state=closed"',
  'pull?.head?.repo?.full_name === repository',
  'branch.name !== defaultBranch',
  '!openHeads.has(branch.name)',
  'branch.protected !== true',
  'TEMPORARY_BRANCH_PATTERN',
  'branch?.commit?.sha',
  'Number(result.body?.behind_by) === 0',
  '"closed-pr"',
  '"temporary"',
  '"contained-in-master"',
  'RETENTION_HOURS = 24',
  '/actions/artifacts/',
]) {
  assert(
    repositoryHousekeeping.includes(requiredGuard),
    `El housekeeping remoto debe conservar la guarda ${requiredGuard}.`
  );
}
assert(
  !repositoryHousekeeping.includes("pull?.merged_at"),
  "El housekeeping debe retirar heads de PRs cerrados, no limitarse a los mergeados."
);
assert(
  !repositoryHousekeeping.includes("SUPERSEDED_BRANCHES") &&
    !repositoryHousekeeping.includes('"superseded"'),
  "El housekeeping no debe conservar tombstones de branches históricas ya eliminadas."
);
assert(
  !repositoryHousekeeping.includes("force") &&
    !repositoryHousekeeping.includes("editorial_") &&
    !repositoryHousekeeping.includes("deuna_accounts") &&
    !repositoryHousekeeping.includes("deuna_admin"),
  "El housekeeping remoto sólo debe tocar refs Git y artifacts; nunca datos de producto."
);

const housekeepingWorkflow = await read(
  ".github/workflows/repository-housekeeping.yml"
);
for (const requiredWorkflowContract of [
  "branches: [master]",
  'cron: "17 5 * * 0"',
  "contents: write",
  "actions: write",
  "pull-requests: read",
  "persist-credentials: false",
  "npm run repo:housekeeping",
]) {
  assert(
    housekeepingWorkflow.includes(requiredWorkflowContract),
    `El workflow de housekeeping debe conservar ${requiredWorkflowContract}.`
  );
}
assert(
  !housekeepingWorkflow.includes("pull_request:"),
  "El housekeeping con permisos de escritura nunca debe ejecutarse desde pull_request."
);

for (const forbiddenDeleteTarget of [
  "editorial_items",
  "editorial_revisions",
  "editorial_publications",
  "admin_audit_log",
  "reward_events",
]) {
  assert(
    !purgeJunk.includes(`DELETE FROM deuna_admin.${forbiddenDeleteTarget}`) &&
      !purgeJunk.includes(`DELETE FROM deuna_accounts.${forbiddenDeleteTarget}`),
    `La purga transitoria no debe borrar ${forbiddenDeleteTarget}.`
  );
}

for (const temporaryFile of [
  "tools/admin/test-owner-rollback.ts",
  "tools/admin/diagnose-login.ts",
  "tools/admin/auth-status.ts",
]) {
  assert(
    !(await exists(temporaryFile)),
    `El diagnóstico temporal ${temporaryFile} no debe quedar versionado.`
  );
}

const toolExtensions = new Set([".mjs", ".js", ".cjs", ".ts", ".tsx", ".sh"]);
const toolFiles = (await walk(path.join(root, "tools")))
  .filter((file) => toolExtensions.has(path.extname(file)))
  .map(repoRelative);
const toolFileSet = new Set(toolFiles);
const toolRoots = new Set();
const scriptText = Object.values(scripts).join("\n");
const toolReferencePattern = /(?:^|[\s"'])(?:\.\/)?(tools\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|ts|tsx|sh))/g;

for (const match of scriptText.matchAll(toolReferencePattern)) {
  if (toolFileSet.has(match[1])) toolRoots.add(match[1]);
}

function resolveToolImport(importer, specifier) {
  if (!specifier.startsWith(".")) return null;

  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier)
  );
  const candidates = path.posix.extname(base)
    ? [base]
    : [
        base,
        ...[".mjs", ".js", ".cjs", ".ts", ".tsx"].map(
          (extension) => `${base}${extension}`
        ),
        ...[".mjs", ".js", ".cjs", ".ts", ".tsx"].map(
          (extension) => `${base}/index${extension}`
        ),
      ];

  return candidates.find((candidate) => toolFileSet.has(candidate)) ?? null;
}

const importPattern = /(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g;
const reachableTools = new Set();
const queue = [...toolRoots];

while (queue.length > 0) {
  const current = queue.shift();
  if (!current || reachableTools.has(current)) continue;

  reachableTools.add(current);
  if (path.posix.extname(current) === ".sh") continue;

  const content = await read(current);
  for (const match of content.matchAll(importPattern)) {
    const dependency = resolveToolImport(current, match[1]);
    if (dependency && !reachableTools.has(dependency)) queue.push(dependency);
  }
}

for (const file of toolFiles) {
  assert(
    reachableTools.has(file),
    `${file} no está conectado a ningún comando mantenido de package.json ni a otro tool alcanzable.`
  );
}

const forbiddenToolFragments = [
  ["TO", "DO"].join(""),
  ["FIX", "ME"].join(""),
  ["HA", "CK"].join(""),
  ["@ts-", "ignore"].join(""),
  ["@ts-", "nocheck"].join(""),
  ["eslint-", "disable"].join(""),
];
const toolPolicyDefinitionFiles = new Set([
  "tools/check-source-hygiene.mjs",
]);

for (const file of toolFiles) {
  if (toolPolicyDefinitionFiles.has(file)) continue;

  const content = await read(file);
  for (const fragment of forbiddenToolFragments) {
    assert(
      !content.includes(fragment),
      `${file} contiene un marcador pendiente o una supresión no permitida.`
    );
  }
}

const requestSecurity = await read(
  "src/lib/admin/request-security.ts"
);
assert(
  requestSecurity.includes('origin !== "null"') &&
    requestSecurity.includes('fetchSite === "cross-site"') &&
    requestSecurity.includes('fetchSite === "same-origin"') &&
    requestSecurity.includes('fetchSite === "none"'),
  "La protección de formularios debe conservar el manejo local compatible y rechazar cross-site."
);
assert(
  !requestSecurity.includes("[admin-login-rejected]") &&
    !requestSecurity.includes("console.warn"),
  "No deben quedar trazas de diagnóstico del formulario administrativo."
);

for (const route of [
  "src/app/api/admin/auth/login/route.ts",
  "src/app/api/admin/auth/logout/route.ts",
]) {
  const content = await read(route);
  assert(
    content.includes("hasExactAdminFormFields"),
    `${route} debe rechazar campos administrativos extra o duplicados.`
  );
}

const secureBuild = await read(
  "tools/build-secure-deploy.mjs"
);
assert(
  secureBuild.includes('"tools/run-next.mjs"') &&
    secureBuild.includes('"tools/smoke-test.mjs"'),
  "El staging seguro debe copiar los wrappers requeridos por build y smoke."
);

const localSetup = await read(
  "tools/setup-local-server.sh"
);
const localSetupSyntax = spawnSync(
  "bash",
  ["-n", path.join(root, "tools/setup-local-server.sh")],
  { encoding: "utf8" }
);
assert(
  localSetupSyntax.status === 0,
  `El bootstrap local debe conservar sintaxis Bash válida: ${localSetupSyntax.stderr.trim() || "bash -n falló"}.`
);
assert(
  localSetup.includes("DEUNA_ACCOUNT_SESSION_DAYS=30") &&
    localSetup.includes("DEUNA_ACCOUNT_DATA_KEY=%s") &&
    localSetup.includes("DEUNA_ACCOUNT_REGISTRATION_ENABLED=auto") &&
    localSetup.includes("ensure_runtime_account_environment") &&
    localSetup.includes("require_account_data_key"),
  "El bootstrap local debe crear o completar el contrato privado de cuentas sin depender del entorno heredado."
);
assert(
  localSetup.includes("DEUNA_ACCOUNT_DATA_KEY \\") &&
    localSetup.includes("npm run admin:preflight:local") &&
    localSetup.includes(
      'node --env-file="${RUNTIME_ENV}" ./tools/admin/preflight.ts --purpose=runtime'
    ),
  "El bootstrap local debe limpiar claves heredadas y validar los env files reales, incluido el runtime con las credenciales privadas locales, antes de terminar."
);

const visualSmoke = await read(
  "tools/visual-smoke.mjs"
);
const loginPreflight = visualSmoke.indexOf(
  "const prepared = await cdp.evaluate"
);
const loginNavigationWait = visualSmoke.indexOf(
  'const loaded = cdp.waitFor("Page.loadEventFired")',
  loginPreflight
);
assert(
  loginPreflight >= 0 &&
    visualSmoke.includes("if (!prepared)") &&
    visualSmoke.includes("No se encontró el formulario real de login del Admin.") &&
    loginNavigationWait > loginPreflight,
  "El smoke visual debe validar el formulario real de login antes de iniciar la espera de navegación, evitando timeouts huérfanos y diagnósticos duplicados."
);

const gamesPageStyles = await read(
  "src/app/juegos/page.module.css"
);
const gamesHeroBlock =
  gamesPageStyles.match(/\.hero\s*\{([\s\S]*?)\}/)?.[1] ?? "";
assert(
  gamesHeroBlock.includes("background:\n    transparent;") &&
    !gamesPageStyles.includes("var(--background)") &&
    !gamesHeroBlock.includes("border-") &&
    !gamesHeroBlock.includes("isolation:") &&
    !gamesHeroBlock.includes("overflow:"),
  "La cabecera visual retirada de /juegos no debe volver como una superficie opaca que tape el fondo general configurado."
);

const workflow = await read(
  ".github/workflows/ci.yml"
);
assert(
  workflow.includes("pull_request:") &&
    !workflow.includes("feature/game-detail-download-v2"),
  "CI no debe depender de una rama temporal concreta."
);
assert(
  workflow.includes("npm run check:maintenance"),
  "CI debe ejecutar las invariantes de mantenimiento."
);

if (failures.length > 0) {
  console.error("\nMantenimiento del repositorio: ERROR\n");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  console.error(
    "\nRetira diagnósticos, tools huérfanos o restaura las invariantes antes de integrar.\n"
  );
  process.exit(1);
}

console.log(
  `Mantenimiento: OK (${reachableTools.size} tools alcanzables, sin diagnósticos temporales ni marcadores pendientes y con invariantes críticas preservadas).`
);
