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
  types,
  validation,
  modePolicy,
  requirements,
  integrity,
  readiness,
  api,
  mediaLibraryRoute,
  admin,
  viewport,
  publicBackground,
  publicBackgroundCss,
  publicLayout,
  multimediaEditor,
  assignmentsWorkspace,
  galleryManager,
  utilityRail,
] = await Promise.all([
  source("src/types/game.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/media/game-media-mode-policy.ts"),
  source("src/lib/media/game-media-requirements.ts"),
  source("src/lib/admin/game-media-integrity.ts"),
  source("src/lib/admin/game-publication-readiness.ts"),
  source("src/app/api/admin/content/games/[slug]/background-media/route.ts"),
  source("src/app/api/admin/content/games/[slug]/media-library/route.ts"),
  source("src/components/admin/GameBackgroundMediaEditor.tsx"),
  source("src/components/admin/GameBackgroundViewportEditor.tsx"),
  source("src/components/games/GameDetailBackground.tsx"),
  source("src/components/games/GameDetailBackground.module.css"),
  source("src/app/juegos/[slug]/layout.tsx"),
  source("src/components/admin/GameMultimediaEditor.tsx"),
  source("src/components/admin/GameMediaAssignmentsWorkspace.tsx"),
  source("src/components/admin/GameGalleryMediaManager.tsx"),
  source("src/components/admin/GameMultimediaUtilityRail.tsx"),
]);

assert(
  has(
    types,
    "backgroundImage?: string",
    "background?: GameImageViewport",
    "background?: GameDestinationMediaMode",
    "export type GameBackgroundVideo",
    "background?: GameBackgroundVideo"
  ),
  "Game debe modelar imagen, modo, video y recorte adaptable de Fondo sin crear un tipo de archivo paralelo."
);

assert(
  has(
    validation,
    "background: fixedImageViewportSchema.optional()",
    "gallery: galleryImageMediaSchema.optional()",
    "background: mediaModeSchema.optional()",
    "background: destinationVideoSchema.optional()",
    "const backgroundImage",
    "inferredOptionalMode",
    "backgroundMode"
  ),
  "La validación de compatibilidad debe seguir pudiendo leer snapshots históricos del Fondo sin reescribirlos."
);

assert(
  has(
    modePolicy,
    "STANDARD_GAME_MEDIA_MODES",
    "background: STANDARD_GAME_MEDIA_MODES",
    'return isGameMediaModeAllowed(target, mode) ? mode : "image"'
  ),
  "La política activa del Fondo debe limitarse a Imagen/Video y degradar hover histórico a Imagen."
);

assert(
  has(
    requirements,
    'GAME_BACKGROUND_VIEWPORT_ASPECT = "source"',
    "resolveGameBackgroundMediaMode",
    'normalizeGameMediaMode("background"',
    "backgroundMode !== null",
    "game.backgroundImage",
    "game.imageMedia?.background",
    "game.videoMedia?.background?.clip",
    "background.cropReady"
  ),
  "Fondo debe ser opcional en global, obligatorio de completar cuando se activa y normalizar modos legacy."
);

assert(
  has(
    integrity,
    "game.backgroundImage",
    "game.videoMedia?.background?.clip"
  ),
  "La integridad física debe incluir los bytes referenciados por Fondo."
);

assert(
  has(
    readiness,
    'id: "background-media"',
    "media.background.active",
    "complete: media.background.cropReady",
    'priority: "essential"',
    "el recurso exigido por Imagen o Video"
  ) && !readiness.includes("Imagen, Video o Imagen + hover"),
  "Publicación debe bloquear únicamente un Fondo activo incompleto y describir sólo Imagen/Video."
);

assert(
  has(
    api,
    '"mode"',
    '"global"',
    '"select-image"',
    '"select-video"',
    '"layout-image"',
    '"layout-video"',
    "STANDARD_GAME_MEDIA_MODES",
    "const mediaModeSchema = z.enum(STANDARD_GAME_MEDIA_MODES)",
    "normalizeGameMediaMode(",
    'playback: "always"',
    "listEditorialMediaLibrary",
    "mergeEditorialMediaResources",
    "backgroundImage: match.src",
    "DEFAULT_GAME_IMAGE_VIEWPORT",
    "aspect: GAME_BACKGROUND_VIEWPORT_ASPECT",
    "confirmed: true",
    "clearBackgroundUpdate",
    "Recorte adaptable de imagen inválido",
    "Recorte adaptable de video inválido"
  ) &&
    !api.includes('z.enum(["image", "video", "hover-video"])') &&
    !api.includes("storeEditorialWebp") &&
    !api.includes("storeEditorialPreviewVideo") &&
    !api.includes("spawn("),
  "La API de Fondo debe aceptar sólo Imagen/Video, guardar referencias/metadata y nunca copiar o recodificar al asignar destinos."
);

assert(
  has(
    mediaLibraryRoute,
    "resolveGameBackgroundMediaMode",
    "backgroundImage: item.payload.backgroundImage ?? null",
    "backgroundMode: resolveGameBackgroundMediaMode(item.payload)",
    "backgroundVideo: item.payload.videoMedia?.background ?? null",
    "type MediaDraftUpdate = Parameters<typeof saveGameMediaDraft>[3];",
    "protectedReferencesForGame",
    "getHistoricalGameMediaReferences"
  ) &&
    !mediaLibraryRoute.includes('"image-delete"') &&
    !mediaLibraryRoute.includes('"video-delete"') &&
    !mediaLibraryRoute.includes("withoutImageResource") &&
    !mediaLibraryRoute.includes("withoutVideoResource"),
  "La Biblioteca compartida debe exponer Fondo para selección sin asumir responsabilidades de Galería ni convertir el borrado de un master en una desasignación implícita."
);

assert(
  has(
    admin,
    "Fondo del juego",
    "Opcional · recorte adaptable",
    "STANDARD_GAME_MEDIA_MODES",
    "Usar fondo global",
    "Falta seleccionar imagen",
    "Falta seleccionar video",
    "Recorte adaptable ·",
    'complete ? "confirmado" : "no confirmado"',
    "RECORTE ADAPTABLE CONFIRMADO",
    "RECORTE ADAPTABLE NO CONFIRMADO",
    "GameBackgroundViewportEditor",
    "assignmentStyles.assignmentCard",
    "assignmentStyles.modeSwitch",
    "assignmentStyles.currentResource",
    "assignmentStyles.assignmentActions",
    "revision: number",
    "resources: LibraryResource[]",
    "assignment: BackgroundAssignment"
  ) &&
    !admin.includes("Imagen + hover") &&
    !admin.includes("Video hover seleccionado") &&
    !admin.includes("hoverMode") &&
    !admin.includes('mode === "hover-video"') &&
    !admin.includes("Falta ajustar el foco de la imagen") &&
    !admin.includes("Foco adaptable de imagen confirmado") &&
    !admin.includes("useEffect(") &&
    !admin.includes('fetch(endpoint, {\n          credentials: "same-origin"'),
  "Fondo debe verse como un destino Imagen/Video, usar terminología de recorte y reutilizar revisión/recursos del workspace sin una segunda lectura de biblioteca."
);

assert(
  has(
    viewport,
    "MediaViewportEditor",
    'requiredAspect="source"',
    "PREVISUALIZACIÓN ADAPTABLE",
    "Escritorio",
    "Móvil",
    "GameMedia",
    "Un recorte, distintas pantallas",
    "Confirmar recorte adaptable",
    'action: kind === "image" ? "layout-image" : "layout-video"'
  ),
  "Fondo debe reutilizar el mismo motor espacial y añadir sólo previews adaptables de salida."
);

assert(
  has(
    publicBackground,
    "resolveGameBackgroundMediaMode",
    "REDUCED_MOTION_MEDIA",
    "motionAllowed",
    'mode === "video"',
    "game.backgroundImage",
    "game?.videoMedia?.background",
    "mediaStyle(",
    '"--game-background-position"',
    '"--game-background-zoom"',
    "autoPlay",
    "documentVisible",
    "failedVideo"
  ) &&
    !publicBackground.includes("FINE_POINTER_MEDIA") &&
    !publicBackground.includes("hoverActive") &&
    !publicBackground.includes("onPointerEnter") &&
    !publicBackground.includes("onPointerLeave") &&
    has(
      publicBackgroundCss,
      "object-position: var(--game-background-position, 50% 50%)",
      "transform-origin: var(--game-background-position, 50% 50%)",
      "transform: scale(var(--game-background-zoom, 1))"
    ),
  "El runtime público debe usar Imagen/Video por referencia, sin activación por hover, respetando reduced-motion, visibilidad, error y X/Y/zoom adaptables."
);

assert(
  has(
    publicLayout,
    "GameDetailBackground",
    "getPublicGameBySlug",
    "children"
  ),
  "El override de Fondo debe limitarse al layout de la ficha /juegos/[slug]."
);

assert(
  has(
    multimediaEditor,
    "GameMediaAssignmentsWorkspace",
    "GameGalleryMediaManager",
    "GameMediaAccessibilityEditor",
    "GameMultimediaUtilityRail"
  ) &&
    !multimediaEditor.includes("GameMultimediaWorkspaceContextual") &&
    !multimediaEditor.includes("GameBackgroundMediaEditor"),
  "Multimedia debe delegar destinos, Galería, accesibilidad y Biblioteca a los componentes canónicos de la arquitectura dividida."
);

assert(
  has(
    assignmentsWorkspace,
    'import GameBackgroundMediaEditor from "@/components/admin/GameBackgroundMediaEditor"',
    'import GameDetailMediaEditor from "@/components/admin/GameDetailMediaEditor"',
    "assignments.backgroundMode",
    "assignments.backgroundImage",
    "assignments.imageMedia?.background",
    "assignments.backgroundVideo",
    "<GameBackgroundMediaEditor",
    "<GameDetailMediaEditor"
  ) &&
    has(
      galleryManager,
      "requirements.background.active",
      "requirements.background.cropReady",
      'missing.push("Fondo adaptable")'
    ) &&
    has(
      utilityRail,
      "requirements.background.active",
      "requirements.background.cropReady",
      "assignments?.backgroundMode",
      "<strong>Fondo</strong>",
      '"Global · opcional"'
    ),
  "Asignaciones debe integrar Fondo antes de Galería y los gates/resúmenes deben tratarlo como opcional salvo cuando está activo."
);

if (failures.length) {
  console.error("\nGame background media: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Game background media: OK (Fondo Imagen/Video integrado, biblioteca no destructiva, override opcional, bytes compartidos y recorte adaptable)."
);
