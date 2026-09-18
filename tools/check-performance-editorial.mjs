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
  gameTypes,
  validation,
  validationCore,
  forms,
  performanceService,
  performanceAdminRoute,
  editorFlow,
  editorPage,
  compatibilityEditor,
  contextBar,
  readiness,
  changes,
  performanceData,
  performanceModel,
  calibrationHook,
  performanceEstimate,
  compatibilityCard,
  publicPerformanceRoute,
  requirementsPage,
  previewPage,
] = await Promise.all([
  source("src/types/game.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/admin/content-validation-core.ts"),
  source("src/lib/admin/content-forms.ts"),
  source("src/lib/admin/game-performance-service.ts"),
  source("src/app/api/admin/content/games/[slug]/performance/route.ts"),
  source("src/lib/admin/game-editor-flow.ts"),
  source("src/app/admin/(protected)/juegos/[slug]/page.tsx"),
  source("src/components/admin/GameCompatibilityEditor.tsx"),
  source("src/components/admin/AdminContextBar.tsx"),
  source("src/lib/admin/game-publication-readiness.ts"),
  source("src/lib/admin/game-publication-changes.ts"),
  source("src/features/game-finder/performance-data.ts"),
  source("src/features/game-finder/performance-model.ts"),
  source("src/features/game-finder/useGamePerformanceCalibration.ts"),
  source("src/features/game-finder/GamePerformanceEstimate.tsx"),
  source("src/app/juegos/[slug]/GameCompatibilityCard.tsx"),
  source("src/app/api/games/[slug]/performance/route.ts"),
  source("src/app/requisitos/page.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx"),
]);

const completeValidation = `${validation}\n${validationCore}`;

assert(
  gameTypes.includes("GamePerformanceCalibration") &&
    gameTypes.includes("referenceFps: number") &&
    gameTypes.includes("ramGb: number") &&
    gameTypes.includes("fpsCap?: number") &&
    gameTypes.includes("performance?: GamePerformanceCalibration"),
  "El juego debe conservar una calibración de rendimiento opcional dentro de su payload versionado."
);

assert(
  /const performanceCalibrationSchema = z[\s\S]*?\.strict\(\)[\s\S]*?\.refine\([\s\S]*?value\.fpsCap === undefined[\s\S]*?(?:value\.fpsCap >= value\.referenceFps|value\.referenceFps <= value\.fpsCap)/.test(
    completeValidation
  ) &&
    completeValidation.includes("performance: performanceCalibrationSchema.optional()"),
  "La calibración editorial debe validarse como parte estricta del snapshot del juego."
);

assert(
  forms.includes("editorialGamePerformanceFormSchema") &&
    forms.includes("referenceFps: optionalCalibrationNumber(1_000)") &&
    forms.includes("ramGb: optionalCalibrationNumber(512)") &&
    forms.includes("fpsCap: optionalCalibrationNumber(1_000)") &&
    forms.includes(".superRefine((value, context) =>") &&
    forms.includes("const hasAny =") &&
    forms.includes("const hasMetadata =") &&
    forms.includes("if (!hasAny)") &&
    forms.includes("if (hasMetadata)") &&
    forms.includes("La procedencia sólo puede guardarse junto con una calibración") &&
    forms.includes("if (value.referenceFps === undefined)") &&
    forms.includes("if (value.ramGb === undefined)") &&
    forms.includes("value.referenceFps > value.fpsCap"),
  "El formulario debe impedir calibraciones parciales o fuera de rango y metadata de benchmark huérfana."
);

assert(
  performanceService.includes("verifyAdminSession") &&
    performanceService.includes("FOR UPDATE") &&
    performanceService.includes("editorial_revisions") &&
    performanceService.includes("admin_audit_log") &&
    performanceService.includes('section: "performance"') &&
    !/\bDELETE\s+FROM\b/i.test(performanceService),
  "Guardar Rendimiento debe ser autenticado, transaccional, auditable y no destructivo."
);

assert(
  performanceAdminRoute.includes("authorizeAdminFormRequest") &&
    performanceAdminRoute.includes("hasExactAdminFormFields") &&
    performanceAdminRoute.includes("editorialGamePerformanceFormSchema") &&
    performanceAdminRoute.includes("saveGamePerformanceDraft") &&
    performanceAdminRoute.includes('"rendimiento"'),
  "La ruta administrativa de Rendimiento debe conservar la misma protección de formulario que el resto del editor."
);

assert(
  editorFlow.includes('requisitos: "rendimiento"') &&
    editorFlow.includes('rendimiento: "multimedia"') &&
    editorPage.includes('section === "rendimiento"') &&
    editorPage.includes("GamePerformanceEditor") &&
    compatibilityEditor.includes('continueTo="rendimiento"') &&
    compatibilityEditor.includes("Guardar y continuar a Rendimiento") &&
    contextBar.includes('key: "compatibilidad"') &&
    contextBar.includes('key: "rendimiento"') &&
    contextBar.includes('label: "Rendimiento"') &&
    contextBar.includes('href: `${gamePath}?seccion=rendimiento`'),
  "Rendimiento debe formar parte real del flujo Compatibilidad → Rendimiento → Multimedia y permanecer accesible dentro de Compatibilidad."
);

assert(
  readiness.includes('section: "rendimiento"') &&
    readiness.includes("resolvePerformanceProfile") &&
    changes.includes('label: "Rendimiento"') &&
    changes.includes("draft.performance") &&
    changes.includes("published.performance"),
  "Publicación debe mostrar tanto la preparación como los cambios de calibración que saldrán a la web."
);

assert(
  performanceModel.includes("resolvePerformanceProfile") &&
    performanceModel.includes("if (!profile)") &&
    performanceModel.includes("canEstimate: false") &&
    performanceModel.includes("todavía no tiene una calibración de rendimiento publicada"),
  "Un juego nuevo sin calibración nunca debe provocar una excepción en el estimador."
);

assert(
  publicPerformanceRoute.includes("getPublicGameBySlug") &&
    publicPerformanceRoute.includes("game.performance ?? null") &&
    publicPerformanceRoute.includes('"Cache-Control": "no-store, max-age=0"') &&
    !publicPerformanceRoute.includes("draft_payload"),
  "El endpoint de calibración para visitantes debe leer exclusivamente el juego público y nunca el borrador."
);

assert(
  calibrationHook.includes("pending = new Map") &&
    calibrationHook.includes("resolved = new Map") &&
    calibrationHook.includes("parsePublishedCalibration") &&
    calibrationHook.includes("/performance") &&
    calibrationHook.includes('cache: "no-store"'),
  "Los estimadores de la ficha deben compartir y validar una sola lectura pública de calibración."
);

for (const [name, component] of [
  ["FPS de cabecera", performanceEstimate],
  ["compatibilidad", compatibilityCard],
]) {
  assert(
    component.includes("useGamePerformanceCalibration") &&
      component.includes("estimateGamePerformance") &&
      component.includes("calibration ?? undefined"),
    `${name} debe calcular con la misma calibración publicada.`
  );
}

assert(
  requirementsPage.includes("getPublicGames") &&
    requirementsPage.includes("game.performance") &&
    requirementsPage.includes('id="deuna-performance-calibrations"') &&
    requirementsPage.includes('type="application/json"') &&
    requirementsPage.includes("safeJsonLd(performanceCalibrations)"),
  "El comparador general debe recibir sólo calibraciones pertenecientes al catálogo público y hacerlo como JSON inerte."
);

assert(
  performanceData.includes('browserRegistryId = "deuna-performance-calibrations"') &&
    performanceData.includes('typeof document === "undefined"') &&
    performanceData.includes("document.getElementById(browserRegistryId)") &&
    performanceData.includes("validCalibration(value)") &&
    performanceData.includes("browserPublishedCalibration(slug)") &&
    performanceData.includes("profileMap.get(slug) ?? null"),
  "El motor del comparador debe validar el registro público y conservar el perfil histórico sólo como respaldo."
);

assert(
  previewPage.includes("GamePerformanceEstimate") &&
    previewPage.includes("RENDIMIENTO DEL BORRADOR") &&
    previewPage.includes("calibration={game.performance ?? null}") &&
    previewPage.includes("Esta pantalla usa el borrador de PostgreSQL") &&
    !previewPage.includes('/publish"') &&
    !previewPage.includes('/hide"'),
  "La vista previa autenticada debe poder probar la calibración privada sin adquirir acciones de publicación."
);

if (failures.length > 0) {
  console.error("\nRendimiento editorial: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Rendimiento editorial: OK (calibración privada versionada, preview autenticada y FPS públicos coherentes en ficha y comparador)."
  );
}
