import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [
  validation,
  validationCore,
  migration,
  importer,
  service,
  route,
  page,
  publicationService,
  publishRoute,
  restoreRoute,
  navigation,
  contextBar,
  gamePublicationReview,
  gamePublishRoute,
  gameRestoreRoute,
  gamePublicationWorkspace,
  createRoute,
  coreRoute,
  advancedRoute,
  classificationRoute,
  newGamePage,
  newGameForm,
  gameEditorPage,
  gameClassificationEditor,
  taxonomySelector,
  taxonomyEditor,
  taxonomyPresentation,
  taxonomyIcon,
  publicTaxonomy,
  homeClassifications,
  homePage,
  catalogClient,
  gamesPage,
  publicCatalog,
] = await Promise.all([
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/admin/content-validation-core.ts"),
  source("database/migrations/007_game_taxonomy.sql"),
  source("tools/admin/import-content.ts"),
  source("src/lib/admin/game-taxonomy-service.ts"),
  source("src/app/api/admin/content/catalogs/games/route.ts"),
  source("src/app/admin/(protected)/catalogos/page.tsx"),
  source("src/lib/admin/publication-service.ts"),
  source("src/app/api/admin/content/catalogs/publish/route.ts"),
  source("src/app/api/admin/content/catalog-publications/[publicationId]/restore/route.ts"),
  source("src/components/admin/AdminNavigation.tsx"),
  source("src/components/admin/AdminContextBar.tsx"),
  source("src/lib/admin/game-publication-review.ts"),
  source("src/app/api/admin/content/games/[slug]/publish/route.ts"),
  source("src/app/api/admin/content/publications/[publicationId]/restore/route.ts"),
  source("src/components/admin/GamePublicationWorkspace.tsx"),
  source("src/app/api/admin/content/games/route.ts"),
  source("src/app/api/admin/content/games/[slug]/route.ts"),
  source("src/app/api/admin/content/games/[slug]/advanced/route.ts"),
  source("src/app/api/admin/content/games/[slug]/classification/route.ts"),
  source("src/app/admin/(protected)/juegos/nuevo/page.tsx"),
  source("src/components/admin/NewGameForm.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/page.tsx"),
  source("src/components/admin/GameClassificationEditor.tsx"),
  source("src/components/admin/GameTaxonomyMultiSelect.tsx"),
  source("src/components/admin/GameTaxonomyEditor.tsx"),
  source("src/lib/games/taxonomy-presentation.ts"),
  source("src/components/taxonomy/TaxonomyIcon.tsx"),
  source("src/lib/games/public-taxonomy.ts"),
  source("src/components/home/FeaturedCategories.tsx"),
  source("src/app/page.tsx"),
  source("src/components/games/GameCatalogClient.tsx"),
  source("src/app/juegos/page.tsx"),
  source("src/lib/games/catalog.ts"),
]);

const completeValidation = `${validation}\n${validationCore}`;

assert(
  completeValidation.includes('"game_taxonomy"') &&
    completeValidation.includes("editorialGameTaxonomySchema") &&
    completeValidation.includes("classifications: taxonomyTerms(280)") &&
    completeValidation.includes("legacyGameTaxonomySchema") &&
    completeValidation.includes("mergeLegacyTaxonomyTerms") &&
    completeValidation.includes("tags: taxonomyTerms(500)") &&
    completeValidation.includes("icon: z.enum(taxonomyIconKeys).optional()") &&
    completeValidation.includes("tone: z.enum(taxonomyToneKeys).optional()"),
  "La taxonomía debe validar una sola clasificación, migrar la forma antigua y admitir presentación visual segura."
);

assert(
  migration.includes("'game_taxonomy'") &&
    migration.includes("editorial_items_type_check") &&
    !/\bDELETE\s+FROM\b/i.test(migration),
  "La migración de taxonomía sólo debe ampliar tipos editoriales sin borrar datos."
);

assert(
  importer.includes("ensureGameTaxonomyItem") &&
    importer.includes("buildGameTaxonomy") &&
    importer.includes("classifications: taxonomyTerms") &&
    importer.includes("...(game.genres ?? [])") &&
    importer.includes("published_payload") &&
    importer.includes("published_checksum") &&
    importer.includes("public_visible = true") &&
    importer.includes("current.draft_payload") &&
    importer.includes("nextPublication"),
  "El importador debe generar una clasificación única y promover de forma única el estado ya visible a un snapshot publicado sin perder apariencia."
);

assert(
  service.includes("FOR UPDATE") &&
    service.includes("expectedRevision") &&
    service.includes("preservesUsedGameTerms") &&
    service.includes("editorial_revisions") &&
    service.includes("admin_audit_log") &&
    service.includes("resolveGameTaxonomySelection") &&
    service.includes("taxonomy.classifications") &&
    service.includes("gameClassifications") &&
    service.includes("currentGameKey") &&
    service.includes("term.active") &&
    !/\bDELETE\s+FROM\b/i.test(service),
  "Catálogos debe usar una sola clasificación, concurrencia, historial, auditoría y protección de términos en uso."
);

assert(
  route.includes("authorizeAdminFormRequest") &&
    route.includes("hasExactAdminFormFields") &&
    route.includes("gameTaxonomyFormSchema") &&
    route.includes("saveGameTaxonomyDraft"),
  "La ruta de Catálogos debe exigir sesión/origen, campos exactos y validación estructurada."
);

assert(
  page.includes("verifyAdminSession") &&
    page.includes('getEditorialItem("game_taxonomy", "games")') &&
    page.includes("classifications") &&
    page.includes("GameTaxonomyEditor") &&
    page.includes("PublicationPanel") &&
    page.includes("getGameTaxonomyPublicationState") &&
    page.includes('"publicacion"') &&
    page.includes("EditorialHistory"),
  "Catálogos debe permanecer protegido y separar edición, publicación e historial de la única clasificación maestra."
);

assert(
  publicationService.includes('| "game_taxonomy"') &&
    publicationService.includes('return getPublicationState("game_taxonomy", "games")') &&
    publicationService.includes('publishEditorialDraft(\n    "game_taxonomy",\n    "games"') &&
    publicationService.includes('restoreEditorialPublication(\n    "game_taxonomy"'),
  "Catálogos debe reutilizar el servicio genérico de snapshots para publicar y restaurar."
);

for (const [name, content, action] of [
  ["publicación", publishRoute, "publishGameTaxonomyDraft"],
  ["restauración", restoreRoute, "restoreGameTaxonomyPublication"],
]) {
  assert(
    content.includes("authorizeAdminFormRequest") &&
      content.includes(action) &&
      content.includes('revalidatePath("/")') &&
      content.includes('revalidatePath("/juegos")'),
    `La ${name} de Catálogos debe exigir sesión/origen y refrescar Inicio y Juegos.`
  );
}

assert(
  restoreRoute.includes("expectedPublicationNumber"),
  "Restaurar una publicación de Catálogos debe usar control de concurrencia por número de publicación."
);

assert(
  navigation.includes('href: "/admin/catalogos"') &&
    navigation.includes('label: "Clasificaciones y etiquetas"') &&
    contextBar.includes("const catalogSections") &&
    contextBar.includes('id: "clasificaciones"') &&
    contextBar.includes('id: "etiquetas"') &&
    contextBar.includes('id: "publicacion"') &&
    contextBar.includes('id: "historial"') &&
    contextBar.includes('label="Secciones de Clasificaciones y etiquetas"'),
  "Clasificaciones y etiquetas debe estar en la navegación principal y conservar sus secciones de edición, publicación e historial."
);

assert(
  gamePublicationReview.includes("inspectPublishedGameTaxonomyIntegrity") &&
    gamePublicationReview.includes("published_payload") &&
    gamePublicationReview.includes("public_visible = true") &&
    gamePublicationReview.includes('parseEditorialPayload(\n    "game_taxonomy"') &&
    gamePublishRoute.includes("inspectPublishedGameTaxonomyIntegrity") &&
    gamePublishRoute.includes("catalogos-sin-publicar") &&
    gameRestoreRoute.includes("inspectPublishedGameTaxonomyIntegrity") &&
    gameRestoreRoute.includes("catalogos-sin-publicar") &&
    gamePublicationWorkspace.includes("catalogos-sin-publicar") &&
    gamePublicationWorkspace.includes("/admin/catalogos?seccion=publicacion"),
  "Publicar o restaurar un juego debe bloquear referencias a clasificaciones/etiquetas que aún no existen en el snapshot publicado de Catálogos."
);

assert(
  createRoute.includes("resolveGameTaxonomySelection") &&
    createRoute.includes("classification.category") &&
    coreRoute.includes("resolveGameTaxonomySelection") &&
    coreRoute.includes("currentGameKey: slug") &&
    advancedRoute.includes("resolveGameTaxonomySelection") &&
    advancedRoute.includes("genres: classification.genres") &&
    advancedRoute.includes("tags: classification.tags") &&
    classificationRoute.includes("resolveGameTaxonomySelection") &&
    classificationRoute.includes("saveGameClassificationSection") &&
    classificationRoute.includes("genres: classification.genres") &&
    classificationRoute.includes("tags: classification.tags"),
  "Crear y editar juegos debe validar clasificación principal, adicionales y etiquetas en el servidor, incluida la ruta modular activa."
);

assert(
  newGamePage.includes('getEditorialItem("game_taxonomy", "games")') &&
    newGamePage.includes("payload.classifications") &&
    newGamePage.includes("term.active") &&
    newGameForm.includes("Clasificación principal") &&
    newGameForm.includes("classifications.map") &&
    !newGameForm.includes('list="game-category-options"'),
  "Nuevo juego debe consumir sólo clasificaciones activas de la única lista maestra."
);

assert(
  gameEditorPage.includes('getEditorialItem("game_taxonomy", "games")') &&
    gameEditorPage.includes("taxonomy?.classifications.filter") &&
    gameEditorPage.includes("GameClassificationEditor") &&
    gameEditorPage.includes("classificationTerms={classificationTerms}") &&
    gameEditorPage.includes("tagTerms={tagTerms}") &&
    gameClassificationEditor.includes('label="Clasificaciones adicionales"') &&
    gameClassificationEditor.includes('name="genresText"') &&
    gameClassificationEditor.includes('name="tagsText"') &&
    gameClassificationEditor.includes("terms={classificationTerms}") &&
    taxonomySelector.includes('type="hidden"') &&
    taxonomySelector.includes("!term.active && !selectedTerm"),
  "El editor modular debe usar la misma lista maestra para clasificación principal y adicionales, conservando compatibilidad interna."
);

assert(
  taxonomyEditor.includes('kind: "classifications"') &&
    !taxonomyEditor.includes('kind: "genres"') &&
    taxonomyEditor.includes("taxonomyIconOptions") &&
    taxonomyEditor.includes("taxonomyToneOptions") &&
    taxonomyEditor.includes("moveTerm") &&
    taxonomyEditor.includes('field: "icon" | "tone"') &&
    taxonomyPresentation.includes("taxonomyIconKeys") &&
    taxonomyPresentation.includes("taxonomyToneKeys") &&
    taxonomyIcon.includes("iconMap"),
  "Catálogos debe gobernar una sola clasificación con icono, color y orden reutilizables."
);

assert(
  publicTaxonomy.includes("published_payload") &&
    publicTaxonomy.includes("public_visible = true") &&
    !publicTaxonomy.includes("draft_payload") &&
    publicTaxonomy.includes("taxonomy.classifications") &&
    publicTaxonomy.includes("ensureVisuals") &&
    homeClassifications.includes("getPublicTaxonomyPresentation") &&
    homeClassifications.includes("taxonomy.classifications") &&
    homeClassifications.includes("getOrderedClassificationStats") &&
    homeClassifications.includes('copy: HomeCopy["classifications"]') &&
    homeClassifications.includes("{copy.title}") &&
    homeClassifications.includes("{copy.highlight}") &&
    homeClassifications.includes("{copy.linkLabel}") &&
    !homeClassifications.includes("function orderedClassifications") &&
    !homePage.includes("FeaturedGenres") &&
    !homePage.includes("Explora por género"),
  "Inicio debe leer sólo la taxonomía publicada, mostrar una sola superficie de clasificación y reutilizar el cálculo compartido."
);

assert(
  gamesPage.includes("getPublicTaxonomyPresentation") &&
    gamesPage.includes("categoryTerms={taxonomy.classifications}") &&
    catalogClient.includes("categoryTerms: GameTaxonomyTerm[]") &&
    catalogClient.includes("getOrderedClassificationStats") &&
    !catalogClient.includes("function orderedCategoryStats") &&
    catalogClient.includes("resolveTaxonomyVisual") &&
    catalogClient.includes("<TaxonomyIcon") &&
    publicCatalog.includes("gameClassifications") &&
    publicCatalog.includes("getCategoryStats") &&
    publicCatalog.includes("hasClassification") &&
    publicCatalog.includes("seen.has(normalized)"),
  "El catálogo público debe reutilizar el mismo orden/conteo de clasificaciones y deduplicar cada juego dentro de cada término."
);

assert(
  publicCatalog.includes("getOrderedClassificationStats") &&
    homeClassifications.includes("getOrderedClassificationStats") &&
    catalogClient.includes("getOrderedClassificationStats"),
  "Home y catálogo deben depender de una sola función compartida para ordenar y contar clasificaciones."
);

if (failures.length > 0) {
  console.error("\nTaxonomía editorial: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Taxonomía editorial: OK (clasificación única; snapshot publicado separado del borrador; ruta modular protegida; contador, orden e identidad visual compartidos)."
  );
}
