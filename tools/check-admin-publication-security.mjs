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

const [
  publicationService,
  creationService,
  visibilityService,
  publicSiteConfig,
  publicHomeConfig,
  publicAboutConfig,
  publicPagesConfig,
  publicTaxonomy,
  publicCatalog,
  publicUpdates,
  gamePublicRevalidation,
  publishRoute,
  restoreRoute,
  homePublishRoute,
  homeRestoreRoute,
  aboutPublishRoute,
  aboutRestoreRoute,
  taxonomyPublishRoute,
  taxonomyRestoreRoute,
  publicPagesPublishRoute,
  publicPagesRestoreRoute,
  hideGameRoute,
  hideUpdateRoute,
  publicationMigration,
  visibilityMigration,
  homeMigration,
  aboutMigration,
  taxonomyMigration,
  publicPagesMigration,
  migrator,
] = await Promise.all([
  source("src/lib/admin/publication-service.ts"),
  source("src/lib/admin/content-create-service.ts"),
  source("src/lib/admin/visibility-service.ts"),
  source("src/lib/site/public-site-config.ts"),
  source("src/lib/home/public-home-config.ts"),
  source("src/lib/about/public-about-config.ts"),
  source("src/lib/site/public-pages-config.ts"),
  source("src/lib/games/public-taxonomy.ts"),
  source("src/lib/games/public-catalog.ts"),
  source("src/lib/updates/public-updates.ts"),
  source("src/lib/admin/game-public-revalidation.ts"),
  source("src/app/api/admin/content/configuration/publish/route.ts"),
  source("src/app/api/admin/content/configuration-publications/[publicationId]/restore/route.ts"),
  source("src/app/api/admin/content/" + "home/publish/route.ts"),
  source("src/app/api/admin/content/home-publications/[publicationId]/restore/route.ts"),
  source("src/app/api/admin/content/about/publish/route.ts"),
  source("src/app/api/admin/content/about-publications/[publicationId]/restore/route.ts"),
  source("src/app/api/admin/content/catalogs/publish/route.ts"),
  source("src/app/api/admin/content/catalog-publications/[publicationId]/restore/route.ts"),
  source("src/app/api/admin/content/public-pages/publish/route.ts"),
  source("src/app/api/admin/content/public-pages-publications/[publicationId]/restore/route.ts"),
  source("src/app/api/admin/content/games/[slug]/hide/route.ts"),
  source("src/app/api/admin/content/updates/[id]/hide/route.ts"),
  source("database/migrations/003_editorial_publications.sql"),
  source("database/migrations/004_editorial_visibility.sql"),
  source("database/migrations/005_home_editorial_config.sql"),
  source("database/migrations/006_about_editorial_config.sql"),
  source("database/migrations/007_game_taxonomy.sql"),
  source("database/migrations/008_public_pages_editorial.sql"),
  source("tools/admin/migrate.ts"),
]);

assert(
  publicationService.includes('| "site_config"') &&
    publicationService.includes('| "home_config"') &&
    publicationService.includes('| "about_config"') &&
    publicationService.includes('| "game_taxonomy"') &&
    publicationService.includes('| "public_pages_config"') &&
    publicationService.includes("parseEditorialPayload(type, payload)") &&
    publicationService.includes(
      'return getPublicationState("site_config", "site")'
    ) &&
    publicationService.includes(
      'return getPublicationState("home_config", "home")'
    ) &&
    publicationService.includes(
      'return getPublicationState("about_config", "about")'
    ) &&
    publicationService.includes(
      'return getPublicationState("game_taxonomy", "games")'
    ) &&
    publicationService.includes("PUBLIC_PAGES_EDITORIAL_KEY") &&
    publicationService.includes(
      'publishEditorialDraft(\n    "about_config",\n    "about"'
    ) &&
    publicationService.includes(
      'restoreEditorialPublication(\n    "about_config"'
    ) &&
    publicationService.includes(
      'publishEditorialDraft(\n    "game_taxonomy",\n    "games"'
    ) &&
    publicationService.includes(
      'restoreEditorialPublication(\n    "game_taxonomy"'
    ) &&
    publicationService.includes(
      'publishEditorialDraft(\n    "public_pages_config"'
    ) &&
    publicationService.includes(
      'restoreEditorialPublication(\n    "public_pages_config"'
    ),
  "Identidad, portada, páginas, Catálogos y superficies públicas deben compartir el mismo servicio genérico de publicación y restauración."
);

assert(
  publicationService.includes("FOR UPDATE") &&
    publicationService.includes("published_payload") &&
    publicationService.includes("published_checksum") &&
    publicationService.includes("editorial_publications") &&
    publicationService.includes("admin_audit_log") &&
    publicationService.includes("public_visible = true") &&
    publicationService.includes("!item.public_visible") &&
    !/\bDELETE\s+FROM\b/i.test(publicationService),
  "La publicación debe ser transaccional, auditable, activar visibilidad explícita, conservar historial y no borrar registros."
);

assert(
  creationService.includes("source_present") &&
    creationService.includes("'modified'") &&
    creationService.includes("public_visible") &&
    creationService.includes("false") &&
    creationService.includes("ON CONFLICT (item_type, item_key)") &&
    creationService.includes("content_created") &&
    creationService.includes('Extract<EditorialItemType, "game">') &&
    creationService.includes("createGameDraft") &&
    !creationService.includes("game_update") &&
    !/\bDELETE\s+FROM\b/i.test(creationService),
  "Las altas directas del panel deben limitarse a juegos privados; las actualizaciones nuevas sólo pueden nacer desde Nueva versión."
);

assert(
  visibilityService.includes("FOR UPDATE") &&
    visibilityService.includes("public_visible = false") &&
    visibilityService.includes("content_hidden") &&
    visibilityService.includes("admin_audit_log") &&
    !visibilityService.includes("published_payload") &&
    !visibilityService.includes("published_checksum") &&
    !/\bDELETE\s+FROM\b/i.test(visibilityService),
  "Ocultar debe ser transaccional y auditable, cambiar sólo visibilidad y nunca tocar snapshots ni borrar contenido."
);

for (const [name, content] of [
  ["catálogo", publicCatalog],
  ["actualizaciones", publicUpdates],
]) {
  assert(
    content.includes("public_visible") &&
      content.includes("published_payload") &&
      content.includes("!editorial.public_visible") &&
      !content.includes("draft_payload"),
    `La lectura pública de ${name} debe considerar filas ocultas para suprimir contenido fuente y usar sólo snapshots publicados.`
  );
}

assert(
  publicSiteConfig.includes("public_visible = true") &&
    publicSiteConfig.includes("published_payload") &&
    !publicSiteConfig.includes("draft_payload"),
  "La configuración pública debe exigir visibilidad explícita y usar sólo el snapshot publicado."
);

assert(
  publicHomeConfig.includes("public_visible = true") &&
    publicHomeConfig.includes("published_payload") &&
    publicHomeConfig.includes("item_type = 'home_config'") &&
    !publicHomeConfig.includes("draft_payload"),
  "La portada pública debe exigir visibilidad explícita y usar sólo el snapshot publicado."
);

assert(
  publicAboutConfig.includes("public_visible = true") &&
    publicAboutConfig.includes("published_payload") &&
    publicAboutConfig.includes("item_type = 'about_config'") &&
    !publicAboutConfig.includes("draft_payload"),
  "Quiénes somos debe exigir visibilidad explícita y usar sólo el snapshot publicado."
);

assert(
  publicTaxonomy.includes("public_visible = true") &&
    publicTaxonomy.includes("published_payload") &&
    publicTaxonomy.includes("item_type = 'game_taxonomy'") &&
    !publicTaxonomy.includes("draft_payload"),
  "Catálogos públicos debe exigir visibilidad explícita y leer sólo el snapshot publicado."
);

assert(
  publicPagesConfig.includes("public_visible = true") &&
    publicPagesConfig.includes("published_payload") &&
    publicPagesConfig.includes("item_type = 'public_pages_config'") &&
    publicPagesConfig.includes("PUBLIC_PAGES_EDITORIAL_KEY") &&
    !publicPagesConfig.includes("draft_payload"),
  "Las superficies públicas deben leer sólo snapshots publicados y usar una identidad editorial centralizada."
);

assert(
  hideGameRoute.includes("authorizeAdminFormRequest") &&
    hideGameRoute.includes("expectedPublicationNumber") &&
    hideGameRoute.includes("hasExactAdminFormFields") &&
    hideGameRoute.includes("revalidatePublicGameSurfaces"),
  "Ocultar juego debe exigir sesión/origen, control de concurrencia y el refresco público compartido."
);

for (const publicPath of [
  'revalidatePath("/")',
  'revalidatePath("/juegos")',
  'revalidatePath("/actualizaciones")',
  'revalidatePath("/requisitos")',
  'revalidatePath(`/juegos/${slug}`)',
  'revalidatePath(`/juegos/${slug}/descargar`)',
]) {
  assert(
    gamePublicRevalidation.includes(publicPath),
    `El refresco público de juegos debe conservar ${publicPath}.`
  );
}

assert(
  hideUpdateRoute.includes("authorizeAdminFormRequest") &&
    hideUpdateRoute.includes("expectedPublicationNumber") &&
    hideUpdateRoute.includes("hasExactAdminFormFields") &&
    hideUpdateRoute.includes("revalidatePath"),
  "Ocultar actualización debe exigir sesión/origen, control de concurrencia y revalidación pública."
);

assert(
  publishRoute.includes("authorizeAdminFormRequest") &&
    publishRoute.includes("publishSiteConfigDraft") &&
    publishRoute.includes('revalidatePath("/", "layout")'),
  "Publicar configuración debe exigir sesión/origen y revalidar la identidad pública."
);

assert(
  restoreRoute.includes("authorizeAdminFormRequest") &&
    restoreRoute.includes("restoreSiteConfigPublication") &&
    restoreRoute.includes("expectedPublicationNumber"),
  "Restaurar configuración debe exigir sesión/origen y control de concurrencia por número de publicación."
);

assert(
  homePublishRoute.includes("authorizeAdminFormRequest") &&
    homePublishRoute.includes("publishHomeConfigDraft") &&
    homePublishRoute.includes('revalidatePath("/")'),
  "Publicar portada debe exigir sesión/origen y revalidar Inicio."
);

assert(
  homeRestoreRoute.includes("authorizeAdminFormRequest") &&
    homeRestoreRoute.includes("restoreHomeConfigPublication") &&
    homeRestoreRoute.includes("expectedPublicationNumber") &&
    homeRestoreRoute.includes('revalidatePath("/")'),
  "Restaurar portada debe exigir sesión/origen, concurrencia y revalidación de Inicio."
);

assert(
  aboutPublishRoute.includes("authorizeAdminFormRequest") &&
    aboutPublishRoute.includes("publishAboutConfigDraft") &&
    aboutPublishRoute.includes('revalidatePath("/quienes-somos")'),
  "Publicar Quiénes somos debe exigir sesión/origen y revalidar la página pública."
);

assert(
  aboutRestoreRoute.includes("authorizeAdminFormRequest") &&
    aboutRestoreRoute.includes("restoreAboutConfigPublication") &&
    aboutRestoreRoute.includes("expectedPublicationNumber") &&
    aboutRestoreRoute.includes('revalidatePath("/quienes-somos")'),
  "Restaurar Quiénes somos debe exigir sesión/origen, concurrencia y revalidación pública."
);

for (const [name, route, action] of [
  ["publicación", taxonomyPublishRoute, "publishGameTaxonomyDraft"],
  ["restauración", taxonomyRestoreRoute, "restoreGameTaxonomyPublication"],
]) {
  assert(
    route.includes("authorizeAdminFormRequest") &&
      route.includes(action) &&
      route.includes('revalidatePath("/")') &&
      route.includes('revalidatePath("/juegos")'),
    `La ${name} de Catálogos debe exigir sesión/origen y refrescar Inicio y Juegos.`
  );
}

assert(
  taxonomyRestoreRoute.includes("expectedPublicationNumber"),
  "Restaurar Catálogos debe exigir control de concurrencia por número de publicación."
);

for (const [name, route, action] of [
  ["publicación", publicPagesPublishRoute, "publishPublicPagesConfigDraft"],
  ["restauración", publicPagesRestoreRoute, "restorePublicPagesConfigPublication"],
]) {
  assert(
    route.includes("authorizeAdminFormRequest") &&
      route.includes(action) &&
      route.includes('revalidatePath("/juegos")') &&
      route.includes('revalidatePath("/actualizaciones")') &&
      route.includes('revalidatePath("/requisitos")'),
    `La ${name} de superficies públicas debe exigir sesión/origen y refrescar todas las rutas afectadas.`
  );
}

assert(
  publicPagesRestoreRoute.includes("expectedPublicationNumber"),
  "Restaurar superficies públicas debe exigir control de concurrencia por número de publicación."
);

assert(
  publicationMigration.includes("published_payload") &&
    publicationMigration.includes("editorial_publications") &&
    publicationMigration.includes("'bootstrap'") &&
    !/WHERE\s+item_type\s*=\s*'game'/i.test(publicationMigration),
  "La migración de publicaciones debe inicializar snapshots para todos los tipos editoriales."
);

assert(
  visibilityMigration.includes("public_visible") &&
    visibilityMigration.includes("DEFAULT true") &&
    visibilityMigration.includes("SET public_visible = true"),
  "La migración de visibilidad debe conservar visible todo contenido existente y permitir que las altas nuevas nazcan ocultas."
);

for (const [name, migration, type] of [
  ["portada", homeMigration, "home_config"],
  ["páginas", aboutMigration, "about_config"],
  ["Catálogos", taxonomyMigration, "game_taxonomy"],
  ["superficies públicas", publicPagesMigration, "public_pages_config"],
]) {
  assert(
    migration.includes(type) &&
      migration.includes("editorial_items_type_check") &&
      !/\bDELETE\s+FROM\b/i.test(migration),
    `La migración de ${name} debe ampliar únicamente los tipos editoriales sin borrar contenido.`
  );
}

assert(
  migrator.includes("GRANT INSERT (\n        id,\n        item_type,\n        item_key") &&
    migrator.includes("public_visible") &&
    !/GRANT\s+DELETE\s+ON\s+deuna_admin\./i.test(migrator),
  "El runtime debe recibir INSERT editorial sólo por columnas y nunca permisos DELETE sobre el esquema administrativo."
);

if (failures.length > 0) {
  console.error("\nPublicación administrativa: BLOQUEADA\n");
  failures.forEach((failure) =>
    console.error(`- ${failure}`)
  );
  process.exitCode = 1;
} else {
  console.log(
    "Publicación administrativa: OK (juegos, actualizaciones, identidad, portada, Catálogos, páginas y superficies públicas usan snapshots, auditoría, refresco público y restauración sin borrado)."
  );
}
