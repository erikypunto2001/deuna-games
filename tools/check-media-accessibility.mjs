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
      galleryRenderer: "src/components/games/GameDetailGalleryGrid.tsx",
      galleryRendererCss: "src/components/games/GameDetailGalleryGrid.module.css",
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
    files.service.includes("resolveGameCoverImage(game)") &&
    files.service.includes("resolveGameCardBaseImage(game)") &&
    files.service.includes('resolveGameDestinationImage(game, "detail")') &&
    !files.service.includes("game.cardImage ?? game.coverImage") &&
    files.service.includes('"media-accessibility"') &&
    files.service.includes("FOR UPDATE") &&
    files.service.includes("revision = $4") &&
    !files.service.includes("editorial_revisions") &&
    files.service.includes("admin_audit_log") &&
    !/\bDELETE\s+FROM\b/i.test(files.service),
  "Guardar accesibilidad debe reutilizar resolvers canónicos, concurrencia optimista y auditoría, avanzando el snapshot actual sin recrear historial restaurable de juegos."
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
    files.accessibility.includes(
      'import {\n  resolveGameCardBaseImage,\n} from "@/lib/media/game-card-presentation";'
    ) &&
    files.accessibility.includes("resolveGameCardBaseImage(game)") &&
    !files.accessibility.includes('resolveGameDestinationMediaMode(game, "card")'),
  "La resolución pública y el readiness deben compartir la imagen base canónica de Card sin ignorarla en modo Video."
);

assert(
  files.editor.includes("const hasCard = Boolean(assignments.cardImage);") &&
    !files.editor.includes('assignments.cardMode !== "video"') &&
    files.editor.includes("En modo Video sigue siendo el respaldo obligatorio") &&
    files.cardPresentation.includes("resolveGameCardBaseImage(game)") &&
    files.cardPresentation.includes("game.mediaAccessibility?.card ?? game.imageAlt"),
  "Admin, readiness y renderer público deben mantener accesibilidad contextual para la imagen 3:2 de Card también cuando Video es el medio principal."
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
  files.publicPage.includes("game.mediaAccessibility?.hero ?? game.imageAlt") &&
    files.publicPage.includes("getPublicGameBySlug") &&
    files.publicPage.includes("resolvePublicGameGalleryItems(game)") &&
    files.publicPage.includes('import GameDetailGalleryGrid from "@/components/games/GameDetailGalleryGrid"') &&
    files.publicPage.includes("<GameDetailGalleryGrid game={game} gallery={gallery} />") &&
    !files.publicPage.includes("draft_payload"),
  "La ficha pública debe usar sólo el snapshot publicado para Hero social y delegar la Galería al renderer canónico."
);

assert(
  files.adminPreview.includes("resolvePublicGameGalleryItems(game)") &&
    files.adminPreview.includes('import GameDetailGalleryGrid from "@/components/games/GameDetailGalleryGrid"') &&
    files.adminPreview.includes('data-game-detail-gallery-preview="true"') &&
    files.adminPreview.includes("<GameDetailGalleryGrid game={game} gallery={gallery} />") &&
    !files.adminPreview.includes("<GameGalleryVideo") &&
    !files.adminPreview.includes("gallery.map(") &&
    !files.publicPage.includes("<GameGalleryVideo") &&
    !files.publicPage.includes("gallery.map(") &&
    files.galleryRenderer.includes("getGameGalleryAccessibleFallback") &&
    files.galleryRenderer.includes("galleryImageViewport(game, item)") &&
    files.galleryRenderer.includes("resolveGameImageCropAspectRatio(viewport)") &&
    files.galleryRenderer.includes("<GameGalleryVideo") &&
    files.galleryRenderer.includes("alt={accessibleLabel}") &&
    files.galleryRenderer.includes("label={accessibleLabel}") &&
    files.galleryRenderer.includes("galleryVideoAspectRatio(item.viewport)") &&
    files.galleryMedia.includes("export function galleryVideoAspectRatio") &&
    /\.grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s.test(files.galleryRendererCss) &&
    /@media \(max-width:\s*900px\)[\s\S]*?\.grid\s*\{[^}]*repeat\(2,/s.test(files.galleryRendererCss) &&
    /@media \(max-width:\s*700px\)[\s\S]*?\.grid\s*\{[^}]*grid-template-columns:\s*1fr;/s.test(files.galleryRendererCss) &&
    /\.item:first-child\s*\{[^}]*grid-column:\s*span 2;[^}]*grid-row:\s*span 2;/s.test(files.galleryRendererCss),
  "Vista previa y ficha pública deben montar la misma Galería real: orden, crops, accesibilidad, renderer y layout responsive 3→2→1."
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
    "Accesibilidad multimedia contextual: OK (snapshot actual revisionado, edición segura sin historial restaurable, fallbacks legacy, Card accesible también en Video, Galería por recurso y capas decorativas separadas)."
  );
}
