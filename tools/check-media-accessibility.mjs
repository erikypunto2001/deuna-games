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
      types: "src/types/game.ts",
      validation: "src/lib/admin/content-validation.ts",
      sectionValidation: "src/lib/admin/game-editor-section-validation.ts",
      service: "src/lib/admin/game-editor-sections-service.ts",
      route: "src/app/api/admin/content/games/[slug]/media-accessibility/route.ts",
      editor: "src/components/admin/GameMediaAccessibilityEditor.tsx",
      multimediaEditor: "src/components/admin/GameMultimediaEditor.tsx",
      workspaceProvider: "src/components/admin/GameMultimediaWorkspaceProvider.tsx",
      workspace: "src/lib/admin/game-media-workspace.ts",
      accessibility: "src/lib/media/game-media-accessibility.ts",
      cover: "src/components/ui/GameCoverMedia.tsx",
      cardPresentation: "src/lib/media/game-card-presentation.ts",
      card: "src/components/ui/UniversalGameCardBase.tsx",
      publicPage: "src/app/juegos/[slug]/page.tsx",
      adminPreview: "src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx",
      galleryMedia: "src/lib/media/game-gallery-media.ts",
      publicationChanges: "src/lib/admin/game-publication-changes.ts",
      readiness: "src/lib/admin/game-publication-readiness.ts",
      framedVideo: "src/components/ui/FramedVideo.tsx",
      galleryVideo: "src/components/games/GameGalleryVideo.tsx",
    }).map(async ([key, file]) => [key, await source(file)])
  )
);

assert(
  files.types.includes("export type GameMediaAccessibility") &&
    files.types.includes("export type GameGalleryAccessibilityItem") &&
    files.types.includes("mediaAccessibility?: GameMediaAccessibility"),
  "El snapshot debe tipar accesibilidad multimedia contextual y Galería por recurso."
);

const accessibilityType = /export type GameMediaAccessibility = \{([\s\S]*?)\n\};/.exec(
  files.types
)?.[1] ?? "";
assert(
  accessibilityType.includes("cover?: string") &&
    accessibilityType.includes("hero?: string") &&
    accessibilityType.includes("card?: string") &&
    accessibilityType.includes("detail?: string") &&
    accessibilityType.includes("gallery?: GameGalleryAccessibilityItem[]") &&
    !accessibilityType.includes("background?:"),
  "La metadata accesible debe ser contextual y no convertir el Fondo decorativo en contenido semántico."
);

assert(
  files.validation.includes("mediaAccessibilitySchema") &&
    files.validation.includes("galleryAccessibilityItemSchema") &&
    files.validation.includes("localImageSchema") &&
    files.validation.includes("localPreviewClipSchema") &&
    files.validation.includes("allowedGallery") &&
    files.validation.includes("resolvedMediaAccessibility"),
  "El parser editorial debe validar rutas locales y eliminar etiquetas de Galería que no pertenezcan al snapshot actual."
);

assert(
  files.sectionValidation.includes("gameMediaAccessibilitySectionSchema") &&
    files.sectionValidation.includes("mediaAccessibilityJsonSchema") &&
    files.sectionValidation.includes("mediaAccessibilityLabelSchema") &&
    files.sectionValidation.includes(".max(240)") &&
    files.sectionValidation.includes(".max(8)") &&
    files.sectionValidation.includes("Un recurso de Galería no puede repetirse"),
  "El formulario debe limitar longitud, cantidad y duplicados de metadata accesible."
);

assert(
  files.service.includes("saveGameMediaAccessibilitySection") &&
    files.service.includes("compactMediaAccessibility") &&
    files.service.includes("galleryKeys") &&
    files.service.includes('"media-accessibility"') &&
    files.service.includes("FOR UPDATE") &&
    files.service.includes("editorial_revisions") &&
    files.service.includes("admin_audit_log") &&
    !/\bDELETE\s+FROM\b/i.test(files.service),
  "Guardar accesibilidad debe reutilizar concurrencia, revisiones y auditoría sin operaciones destructivas."
);

assert(
  files.route.includes("authorizeAdminFormRequest") &&
    files.route.includes("hasExactAdminFormFields") &&
    files.route.includes("gameMediaAccessibilitySectionSchema.safeParse") &&
    files.route.includes("saveGameMediaAccessibilitySection") &&
    files.route.includes("requestedGameEditorContinuation") &&
    files.route.includes('"multimedia"') &&
    files.route.includes('result.outcome === "conflict"'),
  "La ruta de accesibilidad debe exigir sesión/origen, campos exactos, validación y revisión optimista."
);

assert(
  files.workspaceProvider.includes("/media-workspace") &&
    files.workspaceProvider.includes("useGameMultimediaWorkspace") &&
    files.editor.includes("useGameMultimediaWorkspace") &&
    !files.editor.includes("/media-workspace") &&
    files.editor.includes("/media-accessibility") &&
    files.editor.includes('name="expectedRevision"') &&
    files.editor.includes('name="accessibilityJson"') &&
    files.editor.includes("if (stale)") &&
    files.editor.includes("maxLength={240}") &&
    files.editor.includes("GameEditorFormActions") &&
    files.multimediaEditor.includes("GameMultimediaWorkspaceProvider") &&
    files.multimediaEditor.includes("GameMediaAccessibilityEditor"),
  "Multimedia debe integrar Accesibilidad sobre el único workspace compartido y la misma revisión optimista."
);

assert(
  files.workspace.includes("accessibility: game.mediaAccessibility ?? null"),
  "El workspace multimedia debe devolver la metadata accesible del borrador."
);

assert(
  files.accessibility.includes("getGameGalleryAccessibilityLabel") &&
    files.accessibility.includes("getGameGalleryAccessibleFallback") &&
    files.accessibility.includes("hasCompleteContextualMediaAccessibility") &&
    files.accessibility.includes('resolveGameDestinationMediaMode(game, "card")'),
  "La resolución pública y el readiness deben compartir una sola lógica de accesibilidad contextual."
);

assert(
  files.cover.includes("game.mediaAccessibility?.cover ?? game.imageAlt"),
  "La Portada pública debe preferir el texto contextual y conservar el fallback histórico."
);
assert(
  files.cardPresentation.includes("game.mediaAccessibility?.card ?? game.imageAlt") &&
    files.card.includes("resolveGameCardPresentation") &&
    files.card.includes("presentation.card.alt"),
  "La Card pública debe resolver el texto contextual en la presentación canónica y el renderer debe consumirlo sin lógica paralela."
);
assert(
  files.publicPage.includes("getGameGalleryAccessibleFallback") &&
    files.publicPage.includes("const accessibleLabel") &&
    files.publicPage.includes("alt={accessibleLabel}") &&
    files.publicPage.includes("label={accessibleLabel}") &&
    files.publicPage.includes("game.mediaAccessibility?.hero ?? game.imageAlt") &&
    files.publicPage.includes("getPublicGameBySlug") &&
    !files.publicPage.includes("draft_payload"),
  "La ficha pública debe usar sólo el snapshot publicado para Hero social y etiquetas de Galería."
);

assert(
  files.adminPreview.includes("resolvePublicGameGalleryItems(game)") &&
    files.adminPreview.includes("getGameGalleryAccessibleFallback") &&
    files.adminPreview.includes("galleryImageViewport(game, item)") &&
    files.adminPreview.includes("resolveGameImageCropAspectRatio(viewport)") &&
    files.adminPreview.includes("<GameGalleryVideo") &&
    files.adminPreview.includes("alt={accessibleLabel}") &&
    files.adminPreview.includes("label={accessibleLabel}") &&
    files.adminPreview.includes("galleryVideoAspectRatio(item.viewport)") &&
    files.galleryMedia.includes("export function galleryVideoAspectRatio"),
  "La Vista previa editorial debe compartir orden, crops, aspect-ratio, accesibilidad y renderer de Galería con la ficha pública."
);

assert(
  files.publicationChanges.includes("mediaAccessibility: game.mediaAccessibility") &&
    files.publicationChanges.includes("textos accesibles contextuales"),
  "La revisión previa a publicar debe detectar cambios de accesibilidad multimedia."
);
assert(
  files.readiness.includes("hasCompleteContextualMediaAccessibility") &&
    files.readiness.includes('id: "media-accessibility"') &&
    files.readiness.includes('priority: "recommended"'),
  "El checklist debe recomendar accesibilidad contextual sin bloquear publicaciones históricas."
);

assert(
  files.framedVideo.includes('aria-hidden="true"') &&
    files.galleryVideo.includes("aria-label={label}"),
  "Los videos decorativos deben permanecer ocultos y los videos interactivos de Galería deben conservar etiqueta accesible."
);

if (failures.length > 0) {
  console.error("\nAccesibilidad multimedia contextual: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Accesibilidad multimedia contextual: OK (snapshot versionado, edición segura, fallbacks históricos, Galería por recurso y capas decorativas separadas)."
  );
}
