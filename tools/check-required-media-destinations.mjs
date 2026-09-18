import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const has = (text, ...needles) => needles.every((needle) => text.includes(needle));

const [
  requirements,
  types,
  imageViewportPolicy,
  previewPolicy,
  modePolicy,
  utilityRail,
  gameVideoMedia,
  assignmentsWorkspace,
  galleryManager,
  detailEditor,
  mediaViewportEditor,
  imageEditor,
  videoViewportEditor,
  imageLayoutRoute,
  videoLayoutRoute,
  mediaLibraryRoute,
  backgroundRoute,
  contentService,
  contentValidation,
  gameMedia,
  gameMediaCss,
  backgroundEditor,
  backgroundViewportEditor,
  detailRuntime,
  backgroundRuntime,
  publicationReadiness,
  publicationWorkspace,
  publishRoute,
  restoreRoute,
] = await Promise.all([
  source("src/lib/media/game-media-requirements.ts"),
  source("src/types/game.ts"),
  source("src/lib/media/image-viewport.ts"),
  source("src/lib/media/preview-video-policy.ts"),
  source("src/lib/media/game-media-mode-policy.ts"),
  source("src/components/admin/GameMultimediaUtilityRail.tsx"),
  source("src/lib/media/game-video-media.ts"),
  source("src/components/admin/GameMediaAssignmentsWorkspace.tsx"),
  source("src/components/admin/GameGalleryMediaManager.tsx"),
  source("src/components/admin/GameDetailMediaEditor.tsx"),
  source("src/components/admin/MediaViewportEditor.tsx"),
  source("src/components/admin/ImageViewportEditor.tsx"),
  source("src/components/admin/GameVideoViewportEditor.tsx"),
  source("src/app/api/admin/content/games/[slug]/image-layout/route.ts"),
  source("src/app/api/admin/content/games/[slug]/preview-layout/route.ts"),
  source("src/app/api/admin/content/games/[slug]/media-library/route.ts"),
  source("src/app/api/admin/content/games/[slug]/background-media/route.ts"),
  source("src/lib/admin/content-service.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/components/ui/GameMedia.tsx"),
  source("src/components/ui/GameMedia.module.css"),
  source("src/components/admin/GameBackgroundMediaEditor.tsx"),
  source("src/components/admin/GameBackgroundViewportEditor.tsx"),
  source("src/components/games/GameDetailContainerMedia.tsx"),
  source("src/components/games/GameDetailBackground.tsx"),
  source("src/lib/admin/game-publication-readiness.ts"),
  source("src/components/admin/GamePublicationWorkspace.tsx"),
  source("src/app/api/admin/content/games/[slug]/publish/route.ts"),
  source("src/app/api/admin/content/publications/[publicationId]/restore/route.ts"),
]);

assert(
  has(
    requirements,
    'cover: "4:5"',
    'hero: "3:1"',
    'card: "3:2"',
    "LEGACY_DESTINATION_IMAGE_ASPECTS",
    'hero: "16:9"',
    "const effectiveAspect = viewport.aspect ?? legacyAspect",
    "viewport.source !== expectedSource",
    "resolveGameCardBaseImage",
    "resolveGameCoverImage",
    "const cardImageReady",
    "cardImageReady && cardVideoReady",
    'GAME_DETAIL_VIEWPORT_ASPECT = "source"',
    "detail.cropReady",
    "background.cropReady",
    "galleryCropReady",
    "normalizeGameMediaMode("
  ),
  "El contrato central debe exigir Portada 4:5, Hero 3:1 y Card 3:2, ligar crops al recurso activo, normalizar Fondo legacy y detectar metadata obsoleta."
);

assert(
  has(
    types,
    "export type GameCoverArtworkSource = \"card\" | \"custom\"",
    "export type GameImageViewportAspect",
    '| "3:1"',
    "aspect?: GameImageViewportAspect",
    "aspectRatio?: number",
    "source?: string",
    "export type GameVideoViewportAspect",
    "detail?: GameImageViewport",
    "galleryMedia?: GameGalleryItem[]",
    "confirmed?: true"
  ),
  "El modelo debe persistir 3:1, intención Card/Portada y procedencia opcional del crop sin romper snapshots históricos."
);

assert(
  has(
    imageViewportPolicy,
    '"3:1"',
    '"3:1": 3',
    'DEFAULT_GALLERY_IMAGE_ASPECT = "16:9"',
    '"free"',
    "resolveGameImageCropAspectRatio"
  ),
  "La política de imagen debe conocer 3:1 sin romper el fallback histórico de Galería ni el modo Libre."
);

assert(
  has(
    previewPolicy,
    '"3:1"',
    '3:1 · Hero panorámico',
    'Libre · arrastra bordes y esquinas',
    "customAspectRatio?: number"
  ),
  "El motor de encuadre de video debe conocer Hero 3:1 y conservar Libre para los flujos compatibles."
);

const mediaDraftContract = contentService.match(
  /export type GameMediaDraftInput = Pick<[\s\S]*?>;/
)?.[0] ?? "";

assert(
  has(
    mediaDraftContract,
    '"coverArtworkSource"',
    '"coverImage"',
    '"heroImage"',
    '"cardImage"',
    '"detailImage"',
    '"backgroundImage"',
    '"screenshots"',
    '"galleryMedia"',
    '"imageMedia"',
    '"mediaModes"',
    '"videoMedia"',
    '"previewClip"'
  ) &&
    !mediaDraftContract.includes('"previewMode"') &&
    !mediaDraftContract.includes('"youtubePreview"') &&
    !mediaLibraryRoute.includes("Partial<") &&
    !backgroundRoute.includes("Partial<"),
  "El servicio editorial debe ser la única fuente del contrato de escritura multimedia y no reintroducir campos legacy ni ensanchados locales."
);

assert(
  has(
    contentValidation,
    "imageViewportAspectSchema",
    "fixedImageAspectSchema",
    '"3:1"',
    "aspect: fixedImageAspectSchema.optional()",
    "galleryMediaSchema",
    "aspectRatio: z.number().min(0.1).max(10).optional()",
    "resolvedCoverArtworkSource",
    "coverArtworkSource: resolvedCoverArtworkSource"
  ),
  "La validación editorial debe aceptar 3:1, conservar Galería mixta/Libre y normalizar la intención Card/Portada."
);

const heroModes = modePolicy.match(
  /HERO_GAME_MEDIA_MODES\s*=\s*\[([\s\S]*?)\]/
)?.[1] ?? "";
const standardModes = modePolicy.match(
  /STANDARD_GAME_MEDIA_MODES\s*=\s*\[([\s\S]*?)\]/
)?.[1] ?? "";

assert(
  has(heroModes, '"image"', '"video"', '"hover-video"') &&
    has(standardModes, '"image"', '"video"') &&
    !standardModes.includes('"hover-video"') &&
    has(
      modePolicy,
      "card: STANDARD_GAME_MEDIA_MODES",
      "detail: STANDARD_GAME_MEDIA_MODES",
      "background: STANDARD_GAME_MEDIA_MODES",
      'return isGameMediaModeAllowed(target, mode) ? mode : "image"'
    ),
  "La política compartida debe reservar Imagen + hover exclusivamente para Hero y degradar snapshots legacy de Card/Contenedor/Fondo a Imagen."
);

assert(
  has(
    utilityRail,
    "GAME_MEDIA_MODES_BY_TARGET",
    "function modeOptionsLabel(target: GameMediaModeTarget)",
    'return GAME_MEDIA_MODES_BY_TARGET[target].map(mediaModeLabel).join(" / ");',
    'modeOptionsLabel("hero")',
    'modeOptionsLabel("card")',
    'modeOptionsLabel("detail")',
    'modeOptionsLabel("background")'
  ) &&
    !utilityRail.includes("Video e Imagen + hover agregan") &&
    !utilityRail.includes("Puede usar Imagen, Video o Imagen + hover"),
  "La ayuda del rail multimedia debe derivar los modos permitidos del contrato compartido y no reintroducir hover en Card/Contenedor/Fondo."
);

assert(
  has(
    gameVideoMedia,
    'hero: "hover-video"',
    'card: "image"',
    'detail: "image"',
    "normalizeGameMediaMode(target, explicit)",
    "video.playback === \"hover\" ? \"hover-video\" : \"video\""
  ),
  "El resolver público debe mantener hover en Hero, usar Imagen como default de Card y normalizar modos legacy antes de renderizar."
);

const cardSummaryPreview = assignmentsWorkspace.match(
  /\{cardMode === "video"[\s\S]*?<div className=\{styles\.currentMeta\}>/
)?.[0] ?? "";

assert(
  has(
    assignmentsWorkspace,
    "HERO_GAME_MEDIA_MODES",
    "STANDARD_GAME_MEDIA_MODES",
    'const options = target === "hero" ? HERO_MODES : CARD_MODES',
    "isImageCropConfirmed",
    "isVideoCropConfirmed",
    "LEGACY_DESTINATION_IMAGE_ASPECTS",
    "REQUIRED_DESTINATION_ASPECTS.cover",
    "REQUIRED_DESTINATION_ASPECTS.hero",
    "REQUIRED_DESTINATION_ASPECTS.card",
    "Misma imagen que Card",
    "Imagen diferente",
    "const cardImageReady",
    "const cardDetailReady = cardImageReady &&",
    'target="card-image"',
    'target="cover-image"',
    "frameAspect={4 / 5}",
    "frameAspect={3 / 2}",
    "frameAspect={3}",
    "Video principal + imagen de respaldo obligatoria.",
    "Imagen de respaldo obligatoria",
    'data-card-media-role={cardMode === "video" ? "fallback" : "primary"}',
    "HERO LISTO · 3:1",
    "HERO INCOMPLETO · 3:1",
    "GameDetailMediaEditor",
    "GameBackgroundMediaEditor"
  ) &&
    has(
      cardSummaryPreview,
      '? cardVideoResource',
      ': <Clapperboard size={28} aria-hidden="true" />',
      ': cardImageResource',
      ': <ImageIcon size={28} aria-hidden="true" />'
    ) &&
    !cardSummaryPreview.includes('cardMode === "video" && cardVideoResource') &&
    !assignmentsWorkspace.includes("Imagen es el estado inicial. El video entra al hover o foco") &&
    !assignmentsWorkspace.includes("Hero · 16:9") &&
    !assignmentsWorkspace.includes("Recorte 16:9 del Hero") &&
    !assignmentsWorkspace.includes('target="cover-video"') &&
    !assignmentsWorkspace.includes('target="cover-mode"'),
  "Asignaciones debe conservar Imagen + hover sólo en Hero, limitar Card a Imagen/Video y mantener la imagen 3:2 como fallback obligatorio del modo Video."
);

assert(
  has(
    galleryManager,
    'missing.push("Hero 3:1")',
    "Galería del juego",
    "ImageViewportEditor",
    "GameGalleryVideoViewportEditor",
    "Recorte pendiente de confirmar"
  ) &&
    !galleryManager.includes('missing.push("Hero 16:9")'),
  "Galería debe reflejar Hero 3:1 en su gate y conservar edición independiente de imágenes/videos."
);

assert(
  has(
    detailEditor,
    "STANDARD_GAME_MEDIA_MODES",
    "Contenedor de la ficha",
    "Recorte adaptable ·",
    "RECORTE ADAPTABLE CONFIRMADO",
    'target="detail"',
    "ImageViewportEditor",
    "GameVideoViewportEditor"
  ) &&
    !detailEditor.includes("Imagen + hover") &&
    !detailEditor.includes("hoverMode") &&
    !detailEditor.includes('mode === "hover-video"'),
  "Contenedor debe ofrecer únicamente Imagen/Video y conservar su recorte adaptable independiente."
);

assert(
  has(
    mediaViewportEditor,
    'type MediaKind = "image" | "video"',
    "requiredAspect?",
    "selectableAspects?",
    "const RESIZE_HANDLES",
    'const freeResizeEnabled = !aspectLocked && viewportDraft.aspect === "free"',
    "startResize",
    "finishResize",
    "Relación del encuadre · obligatoria",
    "Resultado final",
    "GameMedia"
  ),
  "El editor espacial común debe conservar relaciones bloqueadas y edición Libre con resultado final exacto."
);

assert(
  has(
    imageEditor,
    "MediaViewportEditor",
    "VISTA REAL DEL DESTINO",
    "destinationPreview",
    '"3:1"',
    "GALLERY_ASPECT_OPTIONS",
    "viewportAspect",
    "viewportAspectRatio",
    "Confirmar recorte adaptable"
  ) &&
    !imageEditor.includes("storeEditorialWebp"),
  "El editor de imagen debe mostrar la vista real grande del destino y persistir la relación confirmada."
);

assert(
  has(
    imageLayoutRoute,
    'const fixedImageTargets = ["cover", "hero", "card"] as const',
    'const legacyImageTargets = [...fixedImageTargets, "gallery"] as const',
    "expectsFixedAspect",
    "REQUIRED_DESTINATION_ASPECTS[target.data]",
    "viewport.aspect !== REQUIRED_DESTINATION_ASPECTS[target.data]",
    "function confirmedViewport",
    "source = targetImage",
    "const savedViewport = confirmedViewport(viewport, source)",
    "saveGameMediaDraft"
  ) &&
    !imageLayoutRoute.includes("storeEditorialWebp") &&
    !imageLayoutRoute.includes("spawn("),
  "La API de imagen debe guardar sólo metadata, derivar el recurso activo server-side y ligar el crop confirmado a ese recurso."
);

assert(
  has(
    videoViewportEditor,
    "GAME_DETAIL_VIEWPORT_ASPECT",
    "REQUIRED_DESTINATION_ASPECTS[target]",
    "MediaViewportEditor",
    'kind="video"'
  ) &&
    has(
      videoLayoutRoute,
      "GAME_DETAIL_VIEWPORT_ASPECT",
      "REQUIRED_DESTINATION_ASPECTS[target]",
      "submittedAspect !== requiredAspect",
      "withGameVideoLayout"
    ),
  "Video debe heredar Hero 3:1 del contrato central y rechazar relaciones incorrectas."
);

assert(
  has(
    mediaLibraryRoute,
    '"cover-source"',
    '"cover-image"',
    '"card-image"',
    '"card-video"',
    '"detail-mode"',
    '"detail-image"',
    '"detail-video"',
    "HERO_GAME_MEDIA_MODES",
    "STANDARD_GAME_MEDIA_MODES",
    "heroMediaModeSchema",
    "standardMediaModeSchema",
    'const playback: "hover" | "always" =',
    'target === "hero" && mode === "hover-video" ? "hover" : "always"',
    'playback: "always"',
    "pendingImageViewport",
    "coverArtworkSource: \"custom\"",
    "const sharesCover = resolveGameCoverArtworkSource(current) === \"card\"",
    "card: pendingImageViewport(imageResource.src)",
    "cover: pendingImageViewport(imageResource.src)"
  ) &&
    !mediaLibraryRoute.includes('"gallery-image"') &&
    !mediaLibraryRoute.includes('"gallery-remove"') &&
    has(
      galleryManager,
      'action={`/api/admin/content/games/${encodeURIComponent(slug)}/gallery-media`}',
      '"gallery-add"',
      '"gallery-remove"',
      '"gallery-move"'
    ),
  "Biblioteca debe gestionar sólo destinos fijos; Galería conserva su única superficie en gallery-media."
);

assert(
  has(
    backgroundRoute,
    "STANDARD_GAME_MEDIA_MODES",
    "const mediaModeSchema = z.enum(STANDARD_GAME_MEDIA_MODES)",
    'playback: "always"',
    "normalizeGameMediaMode("
  ) &&
    !backgroundRoute.includes('z.enum(["image", "video", "hover-video"])'),
  "La API de Fondo debe aceptar sólo Imagen/Video y normalizar cualquier modo legacy antes de volver a guardarlo."
);

assert(
  has(
    backgroundEditor,
    "STANDARD_GAME_MEDIA_MODES",
    "Recorte adaptable ·",
    "RECORTE ADAPTABLE CONFIRMADO",
    "RECORTE ADAPTABLE NO CONFIRMADO",
    "Usar fondo global"
  ) &&
    !backgroundEditor.includes("Imagen + hover") &&
    !backgroundEditor.includes("hoverMode") &&
    !backgroundEditor.includes('mode === "hover-video"') &&
    has(
      backgroundViewportEditor,
      "Confirmando el recorte adaptable",
      "Confirmar recorte adaptable",
      'requiredAspect="source"'
    ),
  "Fondo debe ofrecer sólo Imagen/Video, seguir siendo adaptable y conservar el fallback al Fondo global."
);

assert(
  has(
    detailRuntime,
    'mode === "video"',
    "prefers-reduced-motion: reduce",
    "documentVisible",
    "failedVideo"
  ) &&
    !detailRuntime.includes("hoverActive") &&
    !detailRuntime.includes("FINE_POINTER_MEDIA") &&
    !detailRuntime.includes("pointerenter") &&
    !detailRuntime.includes("focusin"),
  "El runtime del Contenedor no debe conservar listeners ni estados de hover multimedia."
);

assert(
  has(
    backgroundRuntime,
    'mode === "video"',
    "prefers-reduced-motion: reduce",
    "documentVisible",
    "failedVideo"
  ) &&
    !backgroundRuntime.includes("hoverActive") &&
    !backgroundRuntime.includes("FINE_POINTER_MEDIA") &&
    !backgroundRuntime.includes("onPointerEnter") &&
    !backgroundRuntime.includes("onPointerLeave"),
  "El runtime del Fondo no debe conservar activación por hover."
);

assert(
  has(
    gameMedia,
    "resolveGameImageCropAspectRatio",
    "hasEditorialAspect",
    "data-game-image-crop"
  ) &&
    gameMediaCss.includes(':global(figure:has(> [data-game-image-crop]))'),
  "El renderer público debe respetar la relación persistida de las imágenes editoriales."
);

for (const id of [
  "cover-crop",
  "hero-crop",
  "card-crop",
  "detail-container-media",
  "gallery-minimum",
]) {
  assert(
    publicationReadiness.includes(`id: "${id}"`),
    `Publicación debe exigir ${id}.`
  );
}

assert(
  has(
    publicationReadiness,
    "REQUIRED_DESTINATION_ASPECTS",
    'label: `Portada · recorte ${REQUIRED_DESTINATION_ASPECTS.cover}`',
    'label: `Hero · recorte ${REQUIRED_DESTINATION_ASPECTS.hero}`',
    'label: `Card · recorte ${REQUIRED_DESTINATION_ASPECTS.card}`'
  ) &&
    !publicationReadiness.includes('label: "Hero · recorte 16:9"') &&
    !publicationReadiness.includes("Imagen + hover"),
  "Publicación debe derivar relaciones del contrato central y no reintroducir hover en Card/Contenedor/Fondo."
);

assert(
  publicationReadiness.includes("complete: media.detail.cropReady") &&
    publicationReadiness.includes("complete: media.gallery.cropReady") &&
    publicationWorkspace.includes("!readiness.essentialsReady") &&
    has(
      publishRoute,
      "evaluateGamePublicationReadiness",
      "readiness.essentialsReady",
      "preparacion-incompleta"
    ) &&
    has(
      restoreRoute,
      "evaluateGamePublicationReadiness",
      "readiness.essentialsReady",
      "restauracion-incompleta"
    ),
  "Publicación y restauración deben seguir bloqueando destinos multimedia esenciales incompletos."
);

if (failures.length) {
  console.error("Destinos multimedia: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Destinos multimedia: OK (Portada 4:5 · Hero 3:1 con hover opcional · Card/Contenedor/Fondo sólo Imagen/Video · crops ligados a fuente · Galería mixta/Libre)."
);
