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
  mediaWorkspace,
  admin,
  viewport,
  publicBackground,
  publicBackgroundCss,
  publicBackgroundMedia,
  publicBackgroundMediaCss,
  adminPreview,
  adminPreviewCss,
  visualFixture,
  visualWorkflow,
  sitewideBrowser,
  packageJson,
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
  source("src/lib/admin/game-media-workspace.ts"),
  source("src/components/admin/GameBackgroundMediaEditor.tsx"),
  source("src/components/admin/GameBackgroundViewportEditor.tsx"),
  source("src/components/games/GameDetailBackground.tsx"),
  source("src/components/games/GameDetailBackground.module.css"),
  source("src/components/games/GameDetailBackgroundMedia.tsx"),
  source("src/components/games/GameDetailBackgroundMedia.module.css"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.module.css"),
  source("tools/game-background-visual-fixture.ts"),
  source(".github/workflows/ci.yml"),
  source("tools/sitewide-browser-smoke.mjs"),
  source("package.json"),
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
    mediaWorkspace,
    "resolveGameBackgroundMediaMode",
    "backgroundImage: game.backgroundImage ?? null",
    "backgroundMode: resolveGameBackgroundMediaMode(game)",
    "backgroundVideo: game.videoMedia?.background ?? null"
  ) &&
    has(
      mediaLibraryRoute,
      "type MediaDraftUpdate = Parameters<typeof saveGameMediaDraft>[3];",
      "protectedReferencesForGame",
      "getHistoricalGameMediaReferences"
    ) &&
    !mediaLibraryRoute.includes("export async function GET") &&
    !mediaLibraryRoute.includes('"image-delete"') &&
    !mediaLibraryRoute.includes('"video-delete"') &&
    !mediaLibraryRoute.includes("withoutImageResource") &&
    !mediaLibraryRoute.includes("withoutVideoResource"),
  "media-workspace debe exponer Fondo para selección; media-library debe quedar sólo como mutación protegida y sin desasignaciones implícitas."
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
    "GameDetailBackgroundMediaLayer",
    "Un recorte, distintas pantallas",
    "requireConfirmed={false}",
    'action: kind === "image" ? "layout-image" : "layout-video"'
  ) &&
    !viewport.includes("GameMedia") &&
    !viewport.includes("<video") &&
    !viewport.includes("previewShade"),
  "El editor de Fondo debe reutilizar la capa pública real y limitarse a aportar el viewport editable."
);

assert(
  has(
    publicBackgroundMedia,
    "GameMedia",
    "normalizeGameMediaMode",
    "resolveGameBackgroundMediaMode",
    "REDUCED_MOTION_MEDIA",
    "motionAllowed",
    'effectiveMode === "video"',
    "imageSrc",
    "videoSrc",
    "mediaStyle(",
    '"--game-background-position"',
    '"--game-background-zoom"',
    "autoPlay",
    "documentVisible",
    "failedVideo",
    'data-game-background-media="true"',
    'position === "fixed" ? styles.fixed : styles.contained'
  ) &&
    !publicBackgroundMedia.includes("FINE_POINTER_MEDIA") &&
    !publicBackgroundMedia.includes("hoverActive") &&
    !publicBackgroundMedia.includes("onPointerEnter") &&
    !publicBackgroundMedia.includes("onPointerLeave") &&
    has(
      publicBackgroundMediaCss,
      ".fixed {",
      "position: fixed",
      ".contained {",
      "position: absolute",
      "object-position: var(--game-background-position, 50% 50%)",
      "transform-origin: var(--game-background-position, 50% 50%)",
      "transform: scale(var(--game-background-zoom, 1))",
      ".colorWash {",
      ".readabilityShade {",
      "@media (max-width: 760px)"
    ),
  "La capa canónica de Fondo debe concentrar Imagen/Video, crop, fallback, reduced-motion, visibilidad, error, color wash y sombreado."
);

assert(
  has(
    publicBackground,
    'import GameDetailBackgroundMedia from "@/components/games/GameDetailBackgroundMedia"',
    "resolveGameBackgroundMediaMode",
    "<GameDetailBackgroundMedia",
    'position="fixed"',
    'sizes="100vw"'
  ) &&
    !publicBackground.includes("GameMedia") &&
    !publicBackground.includes("<video") &&
    !publicBackground.includes("REDUCED_MOTION_MEDIA") &&
    !publicBackgroundCss.includes(".imageLayer") &&
    !publicBackgroundCss.includes(".videoLayer") &&
    !publicBackgroundCss.includes(".readabilityShade"),
  "El layout público debe delegar toda la capa multimedia del Fondo al renderer canónico y conservar sólo el shell de contenido."
);

assert(
  has(
    adminPreview,
    'import GameDetailBackgroundMedia from "@/components/games/GameDetailBackgroundMedia"',
    "resolveGameBackgroundMediaMode(game)",
    'data-game-background-preview="true"',
    'data-game-background-preview-viewport="desktop"',
    'data-game-background-preview-viewport="mobile"',
    "<GameDetailBackgroundMedia",
    'position="contained"'
  ) &&
    has(
      adminPreviewCss,
      ".backgroundPreviewGrid {",
      ".backgroundPreviewFrame {",
      "position: relative",
      ".backgroundPreviewDesktop {",
      "aspect-ratio: 16 / 9",
      ".backgroundPreviewMobile {",
      "aspect-ratio: 9 / 16"
    ) &&
    !adminPreview.includes("<video") &&
    !adminPreview.includes("GameMedia"),
  "Vista previa debe mostrar el Fondo del borrador en marcos desktop/mobile usando el renderer público real, sin imitar su media."
);

assert(
  has(
    visualFixture,
    'const FIXTURE_FLAG = "DEUNA_GAME_BACKGROUND_VISUAL_FIXTURE"',
    'const FIXTURE_SLUG = "elden-ring"',
    "process.env.CI",
    "process.env.GITHUB_ACTIONS",
    'published_payload ->> \'slug\' = $1',
    "backgroundImage: image",
    "background: {",
    "confirmed: true",
    'background: "image"',
    "editorial_revisions",
    "editorial_publications",
    "game-background-fixture.json"
  ) &&
    has(
      visualWorkflow,
      "Create game background visual fixture",
      'DEUNA_GAME_BACKGROUND_VISUAL_FIXTURE: "1"',
      "npm run visual:game-background-fixture"
    ) &&
    has(
      packageJson,
      '"visual:game-background-fixture"',
      "./tools/game-background-visual-fixture.ts"
    ) &&
    has(
      sitewideBrowser,
      'data-game-background-positioning="fixed"',
      'data-game-background-preview="true"',
      'data-game-background-preview-viewport="desktop"',
      'data-game-background-preview-viewport="mobile"',
      'data-game-background-positioning="contained"',
      "publicGameBackgroundReady",
      "adminGameBackgroundPreviewReady"
    ),
  "CI visual debe publicar un Fondo Imagen sólo en PostgreSQL efímera y verificar el renderer real en web pública y Vista previa."
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
  "Game background media: OK (Fondo Imagen/Video integrado; capa pública compartida por producción, editor y Vista previa; biblioteca no destructiva y recorte adaptable)."
);
