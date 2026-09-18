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

const files = Object.fromEntries(
  await Promise.all(
    Object.entries({
      creationService: "src/lib/admin/content-create-service.ts",
      publicCatalog: "src/lib/games/public-catalog.ts",
      publicationService: "src/lib/admin/publication-service.ts",
      publicationOverview: "src/lib/admin/publication-overview.ts",
      publicationReview: "src/lib/admin/game-publication-review.ts",
      publicationChanges: "src/lib/admin/game-publication-changes.ts",
      publicationReadiness: "src/lib/admin/game-publication-readiness.ts",
      editorFlow: "src/lib/admin/game-editor-flow.ts",
      mediaIntegrity: "src/lib/admin/game-media-integrity.ts",
      publicRevalidation: "src/lib/admin/game-public-revalidation.ts",
      performanceService: "src/lib/admin/game-performance-service.ts",
      contentValidation: "src/lib/admin/content-validation.ts",
      contentValidationCore: "src/lib/admin/content-validation-core.ts",
      contentForms: "src/lib/admin/content-forms.ts",
      performanceModel: "src/features/game-finder/performance-model.ts",
      performanceData: "src/features/game-finder/performance-data.ts",
      calibrationHook: "src/features/game-finder/useGamePerformanceCalibration.ts",
      performanceEstimate: "src/features/game-finder/GamePerformanceEstimate.tsx",
      compatibilityCard: "src/app/juegos/[slug]/GameCompatibilityCard.tsx",
      publicPerformanceRoute: "src/app/api/games/[slug]/performance/route.ts",
      createRoute: "src/app/api/admin/content/games/route.ts",
      informationRoute: "src/app/api/admin/content/games/[slug]/information/route.ts",
      classificationRoute: "src/app/api/admin/content/games/[slug]/classification/route.ts",
      compatibilityRoute: "src/app/api/admin/content/games/[slug]/compatibility/route.ts",
      performanceRoute: "src/app/api/admin/content/games/[slug]/performance/route.ts",
      mediaRoute: "src/app/api/admin/content/games/[slug]/media/route.ts",
      downloadRoute: "src/app/api/admin/content/games/[slug]/download/route.ts",
      valuationRoute: "src/app/api/admin/content/games/[slug]/valuation/route.ts",
      publishRoute: "src/app/api/admin/content/games/[slug]/publish/route.ts",
      hideRoute: "src/app/api/admin/content/games/[slug]/hide/route.ts",
      restoreRoute: "src/app/api/admin/content/publications/[publicationId]/restore/route.ts",
      gamesPage: "src/app/admin/(protected)/juegos/page.tsx",
      gameEditor: "src/app/admin/(protected)/juegos/[slug]/page.tsx",
      formActions: "src/components/admin/GameEditorFormActions.tsx",
      catalog: "src/components/admin/AdminGamesCatalog.tsx",
      contextBar: "src/components/admin/AdminContextBar.tsx",
      healthOverview: "src/components/admin/GameEditorHealthOverview.tsx",
      informationEditor: "src/components/admin/GameInformationEditor.tsx",
      classificationEditor: "src/components/admin/GameClassificationEditor.tsx",
      compatibilityEditor: "src/components/admin/GameCompatibilityEditor.tsx",
      performanceEditor: "src/components/admin/GamePerformanceEditor.tsx",
      distributionEditor: "src/components/admin/GameDistributionEditor.tsx",
      valuationEditor: "src/components/admin/GameValuationEditor.tsx",
      historyPanel: "src/components/admin/GameHistoryPanel.tsx",
      publicationPage: "src/app/admin/(protected)/juegos/[slug]/publicacion/page.tsx",
      publicationWorkspace: "src/components/admin/GamePublicationWorkspace.tsx",
      previewPage: "src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx",
      newGamePage: "src/app/admin/(protected)/juegos/nuevo/page.tsx",
      newGameForm: "src/components/admin/NewGameForm.tsx",
    }).map(async ([key, file]) => [key, await source(file)])
  )
);

const validation = `${files.contentValidation}\n${files.contentValidationCore}`;

assert(
  files.creationService.includes("public_visible") &&
    files.creationService.includes("false") &&
    files.creationService.includes("'modified'") &&
    files.creationService.includes("content_created") &&
    !/\bDELETE\s+FROM\b/i.test(files.creationService),
  "El alta debe crear un borrador privado, auditable y no destructivo."
);
assert(
  files.publicCatalog.includes("public_visible") &&
    files.publicCatalog.includes("published_payload") &&
    !files.publicCatalog.includes("draft_payload"),
  "El catálogo público debe consumir sólo snapshots publicados y visibles."
);
assert(
  files.publicationService.includes("draft_payload") &&
    files.publicationService.includes("published_payload = $2::jsonb") &&
    files.publicationService.includes("published_checksum") &&
    files.publicationService.includes("public_visible = true") &&
    files.publicationService.includes("FOR UPDATE") &&
    !/\bDELETE\s+FROM\b/i.test(files.publicationService),
  "Publicar debe ser transaccional, versionado y no destructivo."
);
assert(
  files.publicationOverview.includes("panel_created") &&
    files.publicationOverview.includes("ever_published") &&
    files.publicationOverview.includes("getGamePublicationIdentity") &&
    files.publicationOverview.includes("has_unpublished_changes"),
  "El estado editorial debe derivarse del historial y del snapshot real."
);
assert(
  files.publicationReview.includes("verifyAdminSession") &&
    files.publicationReview.includes("getGameDraftPublicationCandidate") &&
    files.publicationReview.includes("getHistoricalGamePublicationCandidate") &&
    !/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(files.publicationReview),
  "La revisión previa debe ser autenticada y de sólo lectura."
);

for (const section of [
  "Información e identidad",
  "Clasificación",
  "Compatibilidad",
  "Rendimiento",
  "Multimedia",
  "Distribución",
  "Valoración",
]) {
  assert(
    files.publicationChanges.includes(section),
    `La comparación previa debe contemplar ${section}.`
  );
}

for (const section of [
  'section: "ficha"',
  'section: "datos"',
  'section: "requisitos"',
  'section: "rendimiento"',
  'section: "multimedia"',
  'section: "descargas"',
  'section: "valoracion"',
]) {
  assert(
    files.publicationReadiness.includes(section),
    `El checklist debe conservar ${section}.`
  );
}
assert(
  files.publicationReadiness.includes("resolvePerformanceProfile") &&
    files.publicationReadiness.includes('label: "Estimación de FPS"') &&
    files.publicationReadiness.includes('label: "Plataformas confirmadas"') &&
    files.publicationReadiness.includes("ausencia ya no equivale a PC"),
  "Preparación debe cubrir rendimiento y plataformas explícitas."
);

assert(
  files.mediaIntegrity.includes("lstat") &&
    files.mediaIntegrity.includes("!stats.isSymbolicLink()") &&
    files.mediaIntegrity.includes("inspectGameMediaIntegrity") &&
    files.mediaIntegrity.includes("inspectLocalImageReferences"),
  "La integridad multimedia debe seguir bloqueando referencias inseguras."
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
    files.publicRevalidation.includes(publicPath),
    `El refresco público debe incluir ${publicPath}.`
  );
}

assert(
  validation.includes("performanceCalibrationSchema") &&
    validation.includes("performance: performanceCalibrationSchema.optional()") &&
    validation.includes("referenceFps") &&
    validation.includes("ramGb") &&
    validation.includes("fpsCap"),
  "La calibración de rendimiento debe permanecer validada en el payload."
);
assert(
  files.contentForms.includes("editorialGamePerformanceFormSchema") &&
    files.contentForms.includes("value.referenceFps > value.fpsCap"),
  "El formulario de Rendimiento debe validar rangos y coherencia."
);
assert(
  files.performanceService.includes("verifyAdminSession") &&
    files.performanceService.includes("FOR UPDATE") &&
    files.performanceService.includes("editorial_revisions") &&
    files.performanceService.includes("admin_audit_log") &&
    !/\bDELETE\s+FROM\b/i.test(files.performanceService),
  "Rendimiento debe seguir siendo transaccional, versionado y auditable."
);
assert(
  files.publicPerformanceRoute.includes("getPublicGameBySlug") &&
    files.publicPerformanceRoute.includes("game.performance ?? null") &&
    !files.publicPerformanceRoute.includes("draft_payload"),
  "Los FPS públicos deben usar sólo calibración publicada."
);
assert(
  files.performanceData.includes("resolvePerformanceProfile") &&
    files.performanceModel.includes("canEstimate: false") &&
    files.calibrationHook.includes("parsePublishedCalibration") &&
    files.calibrationHook.includes('cache: "no-store"'),
  "El motor debe degradar de forma segura cuando falta calibración."
);
for (const component of [files.performanceEstimate, files.compatibilityCard]) {
  assert(
    component.includes("useGamePerformanceCalibration") &&
      component.includes("estimateGamePerformance") &&
      component.includes("calibration ?? undefined"),
    "Los bloques públicos de rendimiento deben compartir la calibración publicada."
  );
}

assert(
  files.createRoute.includes("?seccion=datos&estado=creado"),
  "Después del alta se debe continuar por Clasificación."
);
for (const transition of [
  'ficha: "datos"',
  'datos: "requisitos"',
  'requisitos: "rendimiento"',
  'rendimiento: "multimedia"',
  'multimedia: "descargas"',
  'descargas: "valoracion"',
  'valoracion: "publicacion"',
]) {
  assert(
    files.editorFlow.includes(transition),
    `El avance guiado debe conservar ${transition}.`
  );
}
assert(
  files.editorFlow.includes('searchParams.get("continuar")') &&
    files.editorFlow.includes("requested === nextSection[current]"),
  "El destino de continuar debe aceptarse sólo desde la transición prevista."
);

for (const [name, route, current] of [
  ["Información", files.informationRoute, '"ficha"'],
  ["Clasificación", files.classificationRoute, '"datos"'],
  ["Compatibilidad", files.compatibilityRoute, '"requisitos"'],
  ["Rendimiento", files.performanceRoute, '"rendimiento"'],
  ["Multimedia", files.mediaRoute, '"multimedia"'],
  ["Distribución", files.downloadRoute, '"descargas"'],
  ["Valoración", files.valuationRoute, '"valoracion"'],
]) {
  assert(
    route.includes("requestedGameEditorContinuation") &&
      route.includes("request.nextUrl") &&
      route.includes("gameEditorSuccessTarget") &&
      route.includes(current) &&
      route.includes("hasExactAdminFormFields") &&
      route.includes('result.outcome === "conflict"'),
    `Guardar ${name} debe validar campos exactos, revisión y avance seguro.`
  );
}
assert(
  files.formActions.includes("formAction") &&
    files.formActions.includes("?continuar=") &&
    !files.formActions.includes('name="continuar"'),
  "Guardar y continuar debe expresar el destino sólo en la URL."
);

for (const [name, route] of [
  ["publicar", files.publishRoute],
  ["ocultar", files.hideRoute],
  ["restaurar", files.restoreRoute],
]) {
  assert(
    route.includes("/publicacion") &&
      route.includes("authorizeAdminFormRequest") &&
      route.includes("expected") &&
      route.includes("revalidatePublicGameSurfaces"),
    `La acción de ${name} debe conservar concurrencia, seguridad y refresco público.`
  );
}
assert(
  files.publishRoute.includes("getGameDraftPublicationCandidate") &&
    files.publishRoute.includes("inspectGameMediaIntegrity") &&
    files.restoreRoute.includes("getHistoricalGamePublicationCandidate") &&
    files.restoreRoute.includes("inspectGameMediaIntegrity"),
  "Publicar y restaurar deben revalidar el snapshot y sus recursos."
);
assert(
  files.gamesPage.includes('"unpublished"') &&
    files.gamesPage.includes("neverPublished") &&
    files.gamesPage.includes("publication?.panelCreated"),
  "La lista debe distinguir un alta nunca publicada de un juego oculto."
);

for (const componentName of [
  "GameEditorHealthOverview",
  "GameInformationEditor",
  "GameClassificationEditor",
  "GameCompatibilityEditor",
  "GamePerformanceEditor",
  "GameMultimediaEditor",
  "GameDistributionEditor",
  "GameValuationEditor",
  "GameHistoryPanel",
]) {
  assert(
    files.gameEditor.includes(componentName),
    `El editor modular debe integrar ${componentName}.`
  );
}
for (const section of [
  'section === "ficha"',
  'section === "datos"',
  'section === "requisitos"',
  'section === "rendimiento"',
  'section === "multimedia"',
  'section === "descargas"',
  'section === "valoracion"',
  'section === "historial"',
]) {
  assert(files.gameEditor.includes(section), `El editor debe resolver ${section}.`);
}
assert(
  files.gameEditor.includes("getGamePublicationIdentity") &&
    files.gameEditor.includes("publicationLabel") &&
    files.gameEditor.includes("Cambios pendientes") &&
    files.gameEditor.includes("Publicado · #"),
  "El editor debe mostrar el estado real de publicación."
);

assert(
  files.gameEditor.includes("evaluateGamePublicationReadiness") &&
    files.gameEditor.includes("readiness={readiness}") &&
    files.healthOverview.includes("readiness.percentage") &&
    files.healthOverview.includes("readiness.items.filter") &&
    files.healthOverview.includes("?seccion=${section.key}"),
  "El tablero global debe recibir la completitud real y navegar por cada sección."
);
assert(
  files.compatibilityEditor.includes("GamePlatformEditor") &&
    files.compatibilityEditor.includes("Requisitos mínimos") &&
    files.compatibilityEditor.includes("Requisitos recomendados"),
  "Compatibilidad debe ser dueña de plataformas y requisitos."
);
assert(
  files.distributionEditor.includes("Compatibilidad") &&
    files.distributionEditor.includes('source.status === "maintenance"') &&
    files.distributionEditor.includes("platformMismatch") &&
    files.distributionEditor.includes("Publicar nueva versión") &&
    files.distributionEditor.includes("SSRF"),
  "Distribución debe diagnosticar coherencia, estados de fuentes y proteger la verificación externa."
);
assert(
  files.valuationEditor.includes("Índice DeUna") &&
    files.valuationEditor.includes("Comunidad") &&
    files.valuationEditor.includes("Recalcular estadísticas") &&
    files.valuationEditor.includes("Usar sugerencia"),
  "Valoración debe separar editorial, comunidad e Índice DeUna."
);
assert(
  files.historyPanel.includes("AUDITORÍA Y RECUPERACIÓN") &&
    files.historyPanel.includes("publication") &&
    files.historyPanel.includes("Restaurar"),
  "Historial debe combinar auditoría y recuperación sin borrar snapshots."
);

assert(
  files.catalog.includes("/publicacion") &&
    files.catalog.includes("Publicar cambios") &&
    files.catalog.includes("Republicar"),
  "El catálogo debe conservar acceso claro a Publicación."
);
assert(
  files.contextBar.includes('key: "rendimiento"') &&
    files.contextBar.includes('key: "publicacion"') &&
    files.contextBar.includes("Publicación"),
  "El contexto del juego debe conservar Rendimiento y Publicación."
);
assert(
  files.publicationPage.includes("getGamePublicationState") &&
    files.publicationPage.includes("getPublishedGameSnapshot") &&
    files.publicationPage.includes("GamePublicationWorkspace"),
  "La estación de Publicación debe comparar borrador y snapshot real."
);
assert(
  files.publicationWorkspace.includes("evaluateGamePublicationChanges") &&
    files.publicationWorkspace.includes("CAMBIOS QUE SALDRÁN A LA WEB") &&
    files.publicationWorkspace.includes("Publicar por primera vez") &&
    files.publicationWorkspace.includes("expectedRevision") &&
    files.publicationWorkspace.includes("expectedPublicationNumber") &&
    !/\bDELETE\b/i.test(files.publicationWorkspace),
  "Publicación debe mostrar alcance, concurrencia y recuperación sin acciones destructivas."
);
assert(
  files.previewPage.includes("/publicacion") &&
    files.previewPage.includes("Esta vista sirve únicamente para revisar el contenido") &&
    !files.previewPage.includes('/publish"') &&
    !files.previewPage.includes('/hide"'),
  "Vista previa debe ser de sólo revisión."
);
assert(
  files.newGamePage.includes("NewGameForm") &&
    files.newGameForm.includes("slugFromTitle") &&
    files.newGameForm.includes("Crear borrador y continuar") &&
    files.newGameForm.includes("Crear no publica"),
  "El alta debe seguir siendo guiada y privada."
);

if (failures.length > 0) {
  console.error("\nFlujo editorial de juegos: REGRESIÓN\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    "Flujo editorial de juegos: OK (editor modular, secciones con responsabilidad única, Valoración real, avance guiado, snapshots, integridad multimedia, Rendimiento y Publicación protegidos)."
  );
}
