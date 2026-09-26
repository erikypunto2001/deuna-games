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
  types,
  validation,
  forms,
  service,
  adminRoute,
  editor,
  adminPage,
  publicRoute,
  hook,
  estimate,
  preview,
  changes,
  readiness,
] = await Promise.all([
  source("src/types/game.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/admin/content-forms.ts"),
  source("src/lib/admin/game-performance-service.ts"),
  source("src/app/api/admin/content/games/[slug]/performance/route.ts"),
  source("src/components/admin/GamePerformanceEditor.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/page.tsx"),
  source("src/app/api/games/[slug]/performance/route.ts"),
  source("src/features/game-finder/useGamePerformanceCalibration.ts"),
  source("src/features/game-finder/GamePerformanceEstimate.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx"),
  source("src/lib/admin/game-publication-changes.ts"),
  source("src/lib/admin/game-publication-readiness.ts"),
]);

assert(
  types.includes("GamePerformanceMetadata") &&
    types.includes("GamePerformanceBenchmarkSource") &&
    types.includes("GamePerformanceBenchmarkConfidence") &&
    types.includes("performanceMetadata?: GamePerformanceMetadata"),
  "El snapshot del juego debe modelar procedencia de benchmark separada de la calibración matemática."
);

assert(
  validation.includes("performanceMetadataSchema") &&
    validation.includes('"internal", "developer", "publisher", "community", "external"') &&
    validation.includes('z.enum(["low", "medium", "high"])') &&
    validation.includes("delete clean.performanceMetadata") &&
    validation.includes("performanceMetadata ? { performanceMetadata }"),
  "La procedencia debe validarse estrictamente y atravesar el parser compatible sin entrar al esquema legacy."
);

assert(
  forms.includes("benchmarkSource: optionalBenchmarkSourceSchema") &&
    forms.includes("benchmarkSourceLabel: optionalText(160)") &&
    forms.includes("benchmarkMeasuredAt: optionalCanonicalDateSchema") &&
    forms.includes("benchmarkConfidence: optionalBenchmarkConfidenceSchema") &&
    forms.includes("La procedencia sólo puede guardarse junto con una calibración"),
  "El formulario debe aceptar metadata acotada y rechazar procedencia huérfana sin calibración."
);

for (const field of [
  '"benchmarkSource"',
  '"benchmarkSourceLabel"',
  '"benchmarkMeasuredAt"',
  '"benchmarkConfidence"',
]) {
  assert(
    adminRoute.includes(field),
    `La ruta administrativa debe incluir el campo exacto ${field}.`
  );
}
assert(
  adminRoute.includes("saveGamePerformanceDraft") &&
    adminRoute.includes("metadata") &&
    service.includes("GamePerformanceMetadata") &&
    service.includes("resolvePcRelease") &&
    service.includes("const performanceMetadata =") &&
    service.includes("calibration ? metadata : undefined") &&
    service.includes('release.platformId === "pc-windows"') &&
    service.includes("FOR UPDATE") &&
    service.includes("admin_audit_log"),
  "Guardar procedencia debe reutilizar la revisión transaccional y eliminar metadata cuando desaparece la calibración."
);

assert(
  editor.includes('name="benchmarkSource"') &&
    editor.includes('name="benchmarkSourceLabel"') &&
    editor.includes('name="benchmarkMeasuredAt"') &&
    editor.includes('name="benchmarkConfidence"') &&
    editor.includes("no ejecuta ni consulta URLs externas") &&
    adminPage.includes("resolvePcRelease") &&
    adminPage.includes("pcRelease?.performance") &&
    adminPage.includes("pcRelease?.performanceMetadata"),
  "Rendimiento debe editar y recargar la procedencia sin ejecutar fuentes externas."
);

assert(
  publicRoute.includes("resolvePcRelease") &&
    publicRoute.includes("pcRelease?.performance") &&
    publicRoute.includes("pcRelease?.performanceMetadata") &&
    !publicRoute.includes("draft_payload") &&
    hook.includes("parsePublishedMetadata") &&
    hook.includes("allowedSources") &&
    hook.includes("allowedConfidence") &&
    hook.includes("metadata: state.metadata") &&
    hook.includes("metadata: nextCached.metadata") &&
    estimate.includes("metadata: publishedMetadata"),
  "La web pública debe recibir calibración y procedencia únicamente desde el snapshot publicado, revalidarlas en cliente y entregarlas al consumidor."
);

assert(
  estimate.includes("benchmarkContext") &&
    estimate.includes("benchmarkSourceLabel") &&
    estimate.includes("benchmarkConfidenceLabel") &&
    estimate.includes("publishedMetadata") &&
    estimate.includes("El resultado real puede variar") &&
    preview.includes("resolvePcRelease") &&
    preview.includes("pcRelease?.performance") &&
    preview.includes("pcRelease?.performanceMetadata"),
  "La ficha y la vista previa deben explicar la fuente sin mezclarla con la confianza del algoritmo."
);

assert(
  changes.includes("performanceState(") &&
    changes.includes("resolvePcRelease") &&
    changes.includes("procedencia, fecha y confianza") &&
    readiness.includes('id: "performance-provenance"') &&
    readiness.includes("resolvePcRelease") &&
    readiness.includes("performanceMetadata?.source") &&
    readiness.includes("performanceMetadata?.measuredAt") &&
    readiness.includes("performanceMetadata?.confidence") &&
    readiness.includes('priority: "recommended"'),
  "Publicación debe visibilizar cambios de procedencia y recomendar completarla sin bloquear legado."
);

if (failures.length > 0) {
  console.error("\nProcedencia de rendimiento: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Procedencia de rendimiento: OK (snapshot versionado, validación estricta, revisión pública y transparencia de benchmark protegidas)."
  );
}
