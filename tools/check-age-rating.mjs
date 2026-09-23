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
  route,
  editor,
  publicPage,
  preview,
  changes,
  readiness,
] = await Promise.all([
  source("src/types/game.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/admin/game-editor-section-validation.ts"),
  source("src/lib/admin/game-editor-sections-service.ts"),
  source("src/app/api/admin/content/games/[slug]/classification/route.ts"),
  source("src/components/admin/GameClassificationEditor.tsx"),
  source("src/app/juegos/[slug]/page.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx"),
  source("src/lib/admin/game-publication-changes.ts"),
  source("src/lib/admin/game-publication-readiness.ts"),
]);

assert(
  types.includes("GameAgeRatingSystem") &&
    types.includes("GameAgeRating") &&
    types.includes("ageRating?: GameAgeRating") &&
    types.includes('"ESRB"') &&
    types.includes('"PEGI"') &&
    types.includes('"IARC"') &&
    types.includes('"CLASSIND"') &&
    types.includes('"USK"') &&
    types.includes('"ACB"') &&
    types.includes('"GRAC"') &&
    types.includes('"CERO"') &&
    types.includes('"OTHER"'),
  "El snapshot debe modelar clasificación etaria estructurada sin inferir equivalencias entre sistemas."
);

assert(
  validation.includes("const ageRatingSchema") &&
    validation.includes("rating: z.string().trim().min(1).max(40)") &&
    validation.includes(".max(8)") &&
    validation.includes("delete clean.ageRating") &&
    validation.includes("ageRating ? { ageRating }"),
  "El parser compatible debe validar sistema, rating y descriptores y preservar snapshots históricos sin ageRating."
);

assert(
  sectionValidation.includes("ageRatingSystem: optionalAgeRatingSystemSchema") &&
    sectionValidation.includes("ageRatingValue: optionalText(40)") &&
    sectionValidation.includes("ageRatingDescriptorsText: delimitedTextList(8, 80, 800)") &&
    sectionValidation.includes("Selecciona el sistema de clasificación etaria") &&
    sectionValidation.includes("Indica el rating exactamente como fue publicado"),
  "El formulario debe impedir clasificaciones etarias parciales y limitar descriptores."
);

for (const field of [
  '"ageRatingSystem"',
  '"ageRatingValue"',
  '"ageRatingDescriptorsText"',
]) {
  assert(
    route.includes(field),
    `La ruta modular debe incluir el campo exacto ${field}.`
  );
}
assert(
  route.includes("hasExactAdminFormFields") &&
    route.includes("const ageRating =") &&
    route.includes("ageRating,") &&
    service.includes('"category" | "genres" | "tags" | "ageRating"') &&
    service.includes("FOR UPDATE") &&
    service.includes("revision = $4") &&
    !service.includes("editorial_revisions") &&
    service.includes("admin_audit_log"),
  "Clasificación etaria debe guardarse en la misma mutación transaccional y auditada de Clasificación, avanzando la revisión actual sin recrear historial restaurable de juegos."
);

assert(
  editor.includes('name="ageRatingSystem"') &&
    editor.includes('name="ageRatingValue"') &&
    editor.includes('name="ageRatingDescriptorsText"') &&
    editor.includes("No conviertas edades entre sistemas ni inventes equivalencias") &&
    editor.includes("Copia la etiqueta literalmente"),
  "El editor debe pedir el dato literal y advertir contra equivalencias inventadas."
);

assert(
  publicPage.includes("contentRating: ageRatingLabel ?? undefined") &&
    publicPage.includes("Clasificación etaria") &&
    publicPage.includes("game.ageRating.descriptors.join") &&
    publicPage.includes("getPublicGameBySlug") &&
    !publicPage.includes("draft_payload"),
  "La ficha pública y JSON-LD deben exponer únicamente la clasificación del snapshot publicado."
);

assert(
  preview.includes("Clasificación etaria") &&
    preview.includes("game.ageRating.descriptors.join") &&
    preview.includes('getEditorialItem("game", slug)'),
  "La vista previa autenticada debe mostrar el rating del borrador antes de publicar."
);

assert(
  changes.includes("ageRating: draft.ageRating") &&
    changes.includes("ageRating: published.ageRating") &&
    changes.includes("clasificación etaria publicada") &&
    readiness.includes('id: "age-rating"') &&
    readiness.includes("game.ageRating?.system") &&
    readiness.includes("game.ageRating?.rating") &&
    readiness.includes('priority: "recommended"'),
  "Publicación debe detectar cambios de rating y recomendar completarlo sin bloquear juegos históricos."
);

if (failures.length > 0) {
  console.error("\nClasificación etaria: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Clasificación etaria: OK (snapshot estructurado, edición auditada, publicación explícita y ficha pública sin equivalencias inferidas)."
  );
}
