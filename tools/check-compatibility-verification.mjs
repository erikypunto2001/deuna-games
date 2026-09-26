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
  sectionValidation,
  service,
  adminRoute,
  editor,
  publicRoute,
  hook,
  card,
  changes,
  readiness,
] = await Promise.all([
  source("src/types/game.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/admin/game-editor-section-validation.ts"),
  source("src/lib/admin/game-editor-sections-service.ts"),
  source("src/app/api/admin/content/games/[slug]/compatibility/route.ts"),
  source("src/components/admin/GameCompatibilityEditor.tsx"),
  source("src/app/api/games/[slug]/compatibility/route.ts"),
  source("src/features/game-finder/useGameCompatibilityMetadata.ts"),
  source("src/app/juegos/[slug]/GameCompatibilityCard.tsx"),
  source("src/lib/admin/game-publication-changes.ts"),
  source("src/lib/admin/game-publication-readiness.ts"),
]);

assert(
  types.includes("GameCompatibilityVerificationStatus") &&
    types.includes("GameCompatibilityVerificationSource") &&
    types.includes("GameCompatibilityMetadata") &&
    types.includes("compatibilityMetadata?: GameCompatibilityMetadata"),
  "El snapshot debe modelar verificación de compatibilidad de forma separada y opcional."
);

assert(
  validation.includes("compatibilityMetadataSchema") &&
    validation.includes('z.enum(["declared", "reviewed", "tested"])') &&
    validation.includes('"developer", "publisher", "internal", "community", "external"') &&
    validation.includes("delete clean.compatibilityMetadata") &&
    validation.includes("compatibilityMetadata ? { compatibilityMetadata }"),
  "La metadata de compatibilidad debe validarse estrictamente y atravesar el parser compatible."
);

assert(
  sectionValidation.includes("verificationStatus: optionalCompatibilityStatusSchema") &&
    sectionValidation.includes("verificationSource: optionalCompatibilitySourceSchema") &&
    sectionValidation.includes("verifiedAt: optionalCanonicalDateSchema") &&
    sectionValidation.includes("const hasCompatibilityData") &&
    sectionValidation.includes("const hasVerification") &&
    sectionValidation.includes("La verificación sólo puede documentarse cuando existe al menos una plataforma o requisito"),
  "El formulario debe impedir verificación huérfana sin datos reales de compatibilidad."
);

assert(
  service.includes("GameCompatibilityMetadata") &&
    service.includes("compactCompatibilityMetadata") &&
    service.includes("compatibilityMetadata: hasCompatibilityData") &&
    service.includes("FOR UPDATE") &&
    service.includes("admin_audit_log"),
  "La verificación debe guardarse dentro de la misma revisión transaccional y limpiarse al vaciar Compatibilidad."
);

for (const field of [
  '"verificationStatus"',
  '"verificationSource"',
  '"verifiedAt"',
]) {
  assert(
    adminRoute.includes(field),
    `La ruta de Compatibilidad debe incluir el campo exacto ${field}.`
  );
}
assert(
  adminRoute.includes("hasExactAdminFormFields") &&
    adminRoute.includes("gameCompatibilitySectionSchema") &&
    adminRoute.includes("saveGameCompatibilitySection"),
  "La ruta debe conservar origen/sesión, lista blanca de campos y validación estructurada."
);

assert(
  editor.includes('name="verificationStatus"') &&
    editor.includes('name="verificationSource"') &&
    editor.includes('name="verifiedAt"') &&
    editor.includes("Sin verificar") &&
    editor.includes("Declarado") &&
    editor.includes("Revisado") &&
    editor.includes("Probado") &&
    editor.includes("no se guarda ubicación, dispositivo ni información personal"),
  "El editor debe documentar estado/origen/fecha sin recopilar datos personales de la prueba."
);

assert(
  publicRoute.includes("getPublicGameBySlug") &&
    publicRoute.includes("game.compatibilityMetadata ?? null") &&
    !publicRoute.includes("draft_payload") &&
    hook.includes("parsePublishedCompatibilityMetadata") &&
    hook.includes("allowedStatus") &&
    hook.includes("allowedSources") &&
    hook.includes('cache: "no-store"'),
  "La metadata pública debe salir sólo del snapshot visible y revalidarse en cliente."
);

assert(
  card.includes("useGameCompatibilityMetadata") &&
    card.includes("Confianza del cálculo") &&
    card.includes("Estado de verificación") &&
    card.includes("verificationStatusLabels") &&
    card.includes("verificationSourceLabels") &&
    card.includes("La confianza del cálculo describe la estimación para tu hardware") &&
    card.includes("calibration ?? undefined"),
  "La ficha debe separar verificación editorial de confianza del algoritmo sin alterar el cálculo de FPS."
);

assert(
  changes.includes("compatibilityState(") &&
    changes.includes("metadata:") &&
    changes.includes("game.compatibilityMetadata") &&
    changes.includes("estado, origen y fecha de verificación") &&
    readiness.includes('id: "compatibility-verification"') &&
    readiness.includes("game.compatibilityMetadata?.status") &&
    readiness.includes("game.compatibilityMetadata?.source") &&
    readiness.includes("game.compatibilityMetadata?.verifiedAt") &&
    readiness.includes('priority: "recommended"'),
  "Publicación debe visibilizar cambios de verificación y recomendar completarla sin bloquear legado."
);

if (failures.length > 0) {
  console.error("\nVerificación de compatibilidad: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Verificación de compatibilidad: OK (snapshot versionado, validación estricta, publicación segura y separación del cálculo protegidas)."
  );
}
