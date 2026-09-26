import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) failures.push(message); };
const has = (text, ...needles) => needles.every((needle) => text.includes(needle));
const missing = async (relativePath) => {
  try { await access(path.join(root, relativePath)); return false; } catch { return true; }
};

const [
  publicationService,
  contentService,
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
  configPublishRoute,
  homePublishRoute,
  aboutPublishRoute,
  taxonomyPublishRoute,
  publicPagesPublishRoute,
  hideGameRoute,
  hideUpdateRoute,
  retirementMigration,
  migrator,
  publicationPanel,
] = await Promise.all([
  source("src/lib/admin/publication-service.ts"),
  source("src/lib/admin/content-service.ts"),
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
  source("src/app/api/admin/content/home/publish/route.ts"),
  source("src/app/api/admin/content/about/publish/route.ts"),
  source("src/app/api/admin/content/catalogs/publish/route.ts"),
  source("src/app/api/admin/content/public-pages/publish/route.ts"),
  source("src/app/api/admin/content/games/[slug]/hide/route.ts"),
  source("src/app/api/admin/content/updates/[id]/hide/route.ts"),
  source("database/migrations/020_retire_editorial_history.sql"),
  source("tools/admin/migrate.ts"),
  source("src/components/admin/PublicationPanel.tsx"),
]);

assert(
  publicationService.includes('| "site_config"') &&
    publicationService.includes('| "home_config"') &&
    publicationService.includes('| "about_config"') &&
    publicationService.includes('| "game_taxonomy"') &&
    publicationService.includes('| "public_pages_config"') &&
    publicationService.includes("parseEditorialPayload(type, payload)") &&
    !publicationService.includes("editorial_publications") &&
    !publicationService.includes("restoreEditorialPublication"),
  "Todas las superficies deben compartir publicación current-only sin servicio de restauración ni tabla de snapshots históricos."
);

assert(
  contentService.includes("FOR UPDATE") &&
    contentService.includes("admin_audit_log") &&
    !contentService.includes("editorial_revisions") &&
    !contentService.includes("restoreEditorialRevision") &&
    !contentService.includes("draft_restored"),
  "Guardar borradores debe conservar concurrencia y auditoría sin crear revisiones restaurables."
);

assert(
  publicationService.includes("FOR UPDATE") &&
    publicationService.includes("published_payload") &&
    publicationService.includes("published_checksum") &&
    publicationService.includes("admin_audit_log") &&
    publicationService.includes("public_visible = true") &&
    !/\bDELETE\s+FROM\b/i.test(publicationService),
  "Publicar debe reemplazar el snapshot vigente de forma transaccional y auditable, sin borrar el item."
);

assert(
  creationService.includes("source_present") &&
    creationService.includes("public_visible") &&
    creationService.includes("content_created") &&
    !/\bDELETE\s+FROM\b/i.test(creationService),
  "Las altas desde el panel deben conservar el contrato privado y auditable."
);

assert(
  visibilityService.includes("FOR UPDATE") &&
    visibilityService.includes("public_visible = false") &&
    visibilityService.includes("content_hidden") &&
    visibilityService.includes("admin_audit_log") &&
    !visibilityService.includes("published_payload") &&
    !/\bDELETE\s+FROM\b/i.test(visibilityService),
  "Ocultar debe cambiar sólo visibilidad y nunca reescribir el snapshot vigente."
);

for (const [name, content] of [["catálogo", publicCatalog], ["actualizaciones", publicUpdates]]) {
  assert(
    content.includes("public_visible") && content.includes("published_payload") && !content.includes("draft_payload"),
    `La lectura pública de ${name} debe usar sólo el estado publicado vigente.`
  );
}

for (const [name, content, type] of [
  ["configuración", publicSiteConfig, "site_config"],
  ["Inicio", publicHomeConfig, "home_config"],
  ["Quiénes somos", publicAboutConfig, "about_config"],
  ["Catálogos", publicTaxonomy, "game_taxonomy"],
  ["superficies públicas", publicPagesConfig, "public_pages_config"],
]) {
  assert(
    content.includes("public_visible = true") && content.includes("published_payload") && content.includes(type) && !content.includes("draft_payload"),
    `${name} debe exigir visibilidad y leer únicamente la publicación vigente.`
  );
}

for (const [name, route, action] of [
  ["configuración", configPublishRoute, "publishSiteConfigDraft"],
  ["Inicio", homePublishRoute, "publishHomeConfigDraft"],
  ["Quiénes somos", aboutPublishRoute, "publishAboutConfigDraft"],
  ["Catálogos", taxonomyPublishRoute, "publishGameTaxonomyDraft"],
  ["superficies públicas", publicPagesPublishRoute, "publishPublicPagesConfigDraft"],
]) {
  assert(route.includes("authorizeAdminFormRequest") && route.includes(action), `Publicar ${name} debe exigir autorización administrativa.`);
}

assert(
  hideGameRoute.includes("authorizeAdminFormRequest") &&
    hideGameRoute.includes("expectedPublicationNumber") &&
    hideGameRoute.includes("revalidatePublicGameSurfaces"),
  "Ocultar juego debe conservar autorización, concurrencia y revalidación pública."
);
assert(
  hideUpdateRoute.includes("authorizeAdminFormRequest") &&
    hideUpdateRoute.includes("expectedPublicationNumber") &&
    hideUpdateRoute.includes("revalidatePath"),
  "Ocultar actualización debe conservar autorización, concurrencia y revalidación pública."
);
for (const publicPath of [
  'revalidatePath("/")',
  'revalidatePath("/juegos")',
  'revalidatePath("/actualizaciones")',
  'revalidatePath("/requisitos")',
  'revalidatePath(`/juegos/${slug}`)',
  'revalidatePath(`/juegos/${slug}/descargar`)',
]) {
  assert(gamePublicRevalidation.includes(publicPath), `El refresco público de juegos debe conservar ${publicPath}.`);
}

assert(
  has(
    retirementMigration,
    "DROP TABLE IF EXISTS deuna_admin.editorial_revisions",
    "DROP TABLE IF EXISTS deuna_admin.editorial_publications",
    "DROP FUNCTION IF EXISTS deuna_admin.compact_editorial_history",
    "DROP FUNCTION IF EXISTS deuna_admin.compact_editorial_item_history"
  ),
  "La migración 020 debe retirar físicamente toda infraestructura restaurable."
);

for (const route of [
  "src/app/api/admin/content/revisions/[revisionId]/restore/route.ts",
  "src/app/api/admin/content/configuration-publications/[publicationId]/restore/route.ts",
  "src/app/api/admin/content/home-publications/[publicationId]/restore/route.ts",
  "src/app/api/admin/content/about-publications/[publicationId]/restore/route.ts",
  "src/app/api/admin/content/catalog-publications/[publicationId]/restore/route.ts",
  "src/app/api/admin/content/public-pages-publications/[publicationId]/restore/route.ts",
  "src/app/api/admin/content/update-publications/[publicationId]/restore/route.ts",
]) {
  assert(await missing(route), `La ruta retirada todavía existe: ${route}`);
}

assert(
  !publicationPanel.includes("restoreActionBase") &&
    !publicationPanel.includes("Restaurar") &&
    !publicationPanel.includes("Historial de publicaciones"),
  "El panel de Publicación no debe exponer historial ni acciones de rollback."
);

assert(
  migrator.includes("GRANT INSERT (\n        id,\n        item_type,\n        item_key") &&
    !migrator.includes("editorial_revisions") &&
    !migrator.includes("editorial_publications") &&
    !migrator.includes("compact_editorial_history") &&
    !/GRANT\s+DELETE\s+ON\s+deuna_admin\./i.test(migrator),
  "El runtime debe conservar privilegios mínimos y no recibir permisos sobre objetos históricos retirados."
);

if (failures.length > 0) {
  console.error("\nPublicación administrativa: BLOQUEADA\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Publicación administrativa: OK (estado actual único, auditoría, concurrencia y revalidación pública; sin historial restaurable ni endpoints de rollback).");
}
