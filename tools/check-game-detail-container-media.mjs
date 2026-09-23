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
  videoMedia,
  integrity,
  readiness,
  libraryRoute,
  mediaWorkspace,
  imageLayoutRoute,
  videoLayoutRoute,
  assignmentsWorkspace,
  utilityRail,
  galleryManager,
  detailEditor,
  imageEditor,
  videoEditor,
  publicPage,
  adminPreview,
  publicPageCss,
  adminPreviewCss,
  heroFrame,
  heroFrameCss,
  publicRuntime,
  publicRuntimeCss,
  visualFixture,
  visualBrowser,
] = await Promise.all([
  source("src/types/game.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/media/game-media-mode-policy.ts"),
  source("src/lib/media/game-media-requirements.ts"),
  source("src/lib/media/game-video-media.ts"),
  source("src/lib/admin/game-media-integrity.ts"),
  source("src/lib/admin/game-publication-readiness.ts"),
  source("src/app/api/admin/content/games/[slug]/media-library/route.ts"),
  source("src/lib/admin/game-media-workspace.ts"),
  source("src/app/api/admin/content/games/[slug]/image-layout/route.ts"),
  source("src/app/api/admin/content/games/[slug]/preview-layout/route.ts"),
  source("src/components/admin/GameMediaAssignmentsWorkspace.tsx"),
  source("src/components/admin/GameMultimediaUtilityRail.tsx"),
  source("src/components/admin/GameGalleryMediaManager.tsx"),
  source("src/components/admin/GameDetailMediaEditor.tsx"),
  source("src/components/admin/ImageViewportEditor.tsx"),
  source("src/components/admin/GameVideoViewportEditor.tsx"),
  source("src/app/juegos/[slug]/page.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx"),
  source("src/app/juegos/[slug]/page.module.css"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.module.css"),
  source("src/components/games/GameDetailHeroFrame.tsx"),
  source("src/components/games/GameDetailHeroFrame.module.css"),
  source("src/components/games/GameDetailContainerMedia.tsx"),
  source("src/components/games/GameDetailContainerMedia.module.css"),
  source("tools/card-video-visual-fixture.ts"),
  source("tools/card-video-browser-smoke.mjs"),
]);

assert(
  has(
    types,
    "detailImage?: string",
    "detail?: GameImageViewport",
    "detail?: GameDestinationMediaMode",
    "export type GameDetailVideo = GameDestinationVideo",
    "detail?: GameDetailVideo"
  ),
  "Game debe modelar Contenedor como destino propio de imagen/modo/video/recorte."
);

assert(
  has(
    validation,
    "detail: fixedImageViewportSchema.optional()",
    "detail: mediaModeSchema.optional()",
    "detail: destinationVideoSchema.optional()",
    "const resolvedCoverImage = resolvedCoverArtworkSource === \"card\"",
    "const resolvedDetailImage = detailImage ?? game.heroImage ?? resolvedCoverImage",
    "const legacyDetailMigration = detailImage === undefined && Boolean(resolvedDetailImage)",
    "inheritedDetailViewport",
    "detail: {",
    "confirmed: true as const",
    "detail: normalizeGameMediaMode("
  ) &&
    !validation.includes("storeEditorialWebp") &&
    !validation.includes("storeEditorialPreviewVideo"),
  "La compatibilidad histórica debe capturar Hero/Portada normalizada por referencia y metadata, sin copiar ni recodificar bytes."
);

assert(
  has(
    modePolicy,
    "STANDARD_GAME_MEDIA_MODES",
    "detail: STANDARD_GAME_MEDIA_MODES",
    'target === "card"',
    'mode === "hover-video"',
    'return "video";',
    'return "image";'
  ),
  "La política activa del Contenedor debe seguir limitada a Imagen/Video y degradar hover histórico a Imagen aunque Card tenga una migración legacy específica."
);

assert(
  has(
    requirements,
    'GAME_DETAIL_VIEWPORT_ASPECT = "source"',
    'resolveGameDestinationMediaMode(game, "detail")',
    'resolveGameDestinationImage(game, "detail")',
    "game.imageMedia?.detail",
    "game.videoMedia?.detail?.clip",
    "detail.cropReady"
  ),
  "Contenedor debe ser adaptable y participar del gate según Imagen/Video."
);

assert(
  has(
    videoMedia,
    'GameVideoTarget = "hero" | "card" | "detail"',
    'GameMediaDestinationTarget = "cover" | GameVideoTarget',
    'detail: "image"',
    'return game.detailImage ?? game.heroImage ?? game.coverImage',
    "resolveGameDetailVideo",
    "normalizeGameMediaMode(target, explicit)",
    'target === "detail"',
    "detail: {",
    "detail: undefined"
  ),
  "Los helpers compartidos deben mantener Contenedor como destino de video independiente, normalizar legacy y usar Imagen como default."
);

assert(
  has(
    integrity,
    "game.detailImage",
    "game.videoMedia?.detail?.clip"
  ),
  "La integridad física debe proteger los bytes referenciados por Contenedor."
);

assert(
  has(
    readiness,
    'id: "detail-container-media"',
    "Contenedor de la ficha · adaptable",
    "complete: media.detail.cropReady",
    'priority: "essential"',
    "recurso de Imagen o Video"
  ),
  "Publicación debe exigir un Contenedor Imagen/Video completo después de la migración compatible."
);

assert(
  has(
    mediaWorkspace,
    "detailImage: game.detailImage ?? null",
    'detailMode: resolveGameDestinationMediaMode(game, "detail")',
    "detailVideo: game.videoMedia?.detail ?? null"
  ) &&
    has(
      libraryRoute,
      '"detail-mode"',
      '"detail-image"',
      '"detail-video"',
      "STANDARD_GAME_MEDIA_MODES",
      "standardMediaModeSchema",
      'target.data === "detail-image"',
      'target.data === "detail-video"',
      'requiredVideoViewport("detail")',
      'playback: "always"',
      "protectedReferencesForGame",
      "getPublishedGameImageReferences",
      "getPublishedGameVideoReferences"
    ) &&
    !libraryRoute.includes("getHistoricalGameMediaReferences") &&
    !libraryRoute.includes("export async function GET") &&
    !libraryRoute.includes('"image-delete"') &&
    !libraryRoute.includes('"video-delete"') &&
    !libraryRoute.includes("withoutImageResource") &&
    !libraryRoute.includes("withoutVideoResource") &&
    !libraryRoute.includes("storeEditorialWebp") &&
    !libraryRoute.includes("storeEditorialPreviewVideo") &&
    !libraryRoute.includes("spawn("),
  "media-workspace debe exponer Contenedor; media-library debe limitarse a Imagen/Video por referencia sin trabajo físico ni desasignación implícita."
);

assert(
  has(
    libraryRoute,
    "current.detailImage === imageResource.src",
    "current.videoMedia?.detail?.clip === videoResource.src",
    'current.videoMedia.detail.playback === "always"'
  ),
  "Contenedor debe tratar la misma imagen/video como no-op y preservar su viewport confirmado."
);

assert(
  has(
    imageLayoutRoute,
    'target === "detail"',
    "return game.detailImage",
    "const savedViewport = confirmedViewport(viewport, source)",
    "[target.data]: savedViewport",
    "saveGameMediaDraft"
  ) &&
    has(
      videoLayoutRoute,
      'target === "detail"',
      "GAME_DETAIL_VIEWPORT_ASPECT",
      'source !== "independent"',
      "withGameVideoLayout",
      "saveGameMediaDraft"
    ),
  "Imagen y video de Contenedor deben persistir X/Y/zoom ligados al master seleccionado mediante los endpoints compartidos."
);

assert(
  has(
    assignmentsWorkspace,
    'import GameDetailMediaEditor from "@/components/admin/GameDetailMediaEditor"',
    "assignments.detailMode",
    "assignments.detailImage",
    "assignments.imageMedia?.detail",
    "assignments.detailVideo",
    "<GameDetailMediaEditor"
  ) &&
    has(
      utilityRail,
      "requirements.detail.cropReady",
      "assignments?.detailMode",
      "assignments?.detailImage",
      "assignments?.detailVideo?.clip",
      "<strong>Contenedor</strong>"
    ) &&
    has(
      galleryManager,
      "if (!requirements.detail.cropReady)",
      'missing.push("Contenedor adaptable")'
    ),
  "Asignaciones debe integrar Contenedor y tanto el resumen como el gate de continuidad deben usar su estado real."
);

assert(
  has(
    detailEditor,
    "STANDARD_GAME_MEDIA_MODES",
    "Contenedor de la ficha",
    "Obligatorio · recorte adaptable",
    "Recurso independiente del Hero",
    "Recorte adaptable ·",
    "RECORTE ADAPTABLE CONFIRMADO",
    "RECORTE ADAPTABLE NO CONFIRMADO",
    "ImageViewportEditor",
    "GameVideoViewportEditor",
    'target="detail"'
  ) &&
    !detailEditor.includes("Imagen + hover") &&
    !detailEditor.includes("hoverMode") &&
    !detailEditor.includes('mode === "hover-video"') &&
    !detailEditor.includes("fetch(endpoint"),
  "La tarjeta debe ofrecer sólo Imagen/Video y reutilizar revisión/recursos y editores comunes sin segunda lectura de biblioteca."
);

assert(
  has(
    imageEditor,
    'type Target = "cover" | "hero" | "card" | "detail" | "gallery"',
    "GAME_DETAIL_VIEWPORT_ASPECT",
    'target === "detail"',
    '"Confirmar recorte adaptable"'
  ) &&
    has(
      videoEditor,
      'type Target = "hero" | "card" | "detail"',
      "GAME_DETAIL_VIEWPORT_ASPECT",
      'target === "detail"',
      '"Confirmar recorte adaptable"'
    ),
  "Los adaptadores comunes deben aceptar detail=source sin habilitar video de Portada ni recorte Libre fuera de Galería."
);

assert(
  has(
    videoMedia,
    "export function resolveGameDetailImageViewport(game: Game)",
    "if (game.imageMedia?.detail) return game.imageMedia.detail",
    "if (game.detailImage) return undefined",
    "if (game.heroImage) return game.imageMedia?.hero",
    "return game.imageMedia?.cover"
  ),
  "El fallback de viewport del Contenedor debe vivir en un único resolver compartido y conservar detail → hero → cover sin mezclar crops de recursos explícitos."
);

assert(
  has(
    heroFrame,
    'import GameDetailContainerMedia from "@/components/games/GameDetailContainerMedia"',
    'import GameCoverMedia from "@/components/ui/GameCoverMedia"',
    'resolveGameDestinationImage(game, "detail")',
    "resolveGameDetailImageViewport(game)",
    'resolveGameDestinationMediaMode(game, "detail")',
    "data-game-detail-media-scope",
    "<GameDetailContainerMedia",
    "video={game.videoMedia?.detail}",
    "<GameCoverMedia"
  ) &&
    has(
      heroFrameCss,
      ".hero {",
      "min-height: 478px",
      ".inner {",
      "grid-template-columns: 238px minmax(0, 1fr)",
      ".cover {",
      "aspect-ratio: 3 / 4",
      "@media (max-width: 1180px)",
      "grid-template-columns: 215px minmax(0, 1fr)",
      "@media (max-width: 700px)",
      "width: min(52vw, 210px)",
      "@media (prefers-reduced-motion: reduce)"
    ),
  "El Hero de la ficha debe resolver multimedia y geometría pública en un único frame compartido."
);

assert(
  has(
    publicPage,
    'import GameDetailHeroFrame from "@/components/games/GameDetailHeroFrame"',
    '<GameDetailHeroFrame game={game} ariaLabelledby="game-title">'
  ) &&
    !publicPage.includes("GameDetailContainerMedia") &&
    !publicPage.includes("resolveGameDestinationImage") &&
    !publicPage.includes("resolveGameDetailImageViewport") &&
    !publicPageCss.includes(".hero {") &&
    !publicPageCss.includes(".heroInner"),
  "La ficha pública debe delegar Contenedor, Portada y geometría del Hero al frame canónico."
);

assert(
  has(
    adminPreview,
    'import GameDetailHeroFrame from "@/components/games/GameDetailHeroFrame"',
    "<GameDetailHeroFrame",
    'ariaLabelledby="preview-game-title"',
    "className={styles.heroPreview}",
    'id="preview-game-title"'
  ) &&
    !adminPreview.includes("GameDetailContainerMedia") &&
    !adminPreview.includes("resolveGameDestinationImage") &&
    !adminPreview.includes("resolveGameDetailImageViewport") &&
    !adminPreviewCss.includes(".hero {") &&
    !adminPreviewCss.includes(".heroInner") &&
    has(adminPreviewCss, ".heroPreview {", "margin-top: 22px"),
  "La Vista previa editorial debe montar el Hero público real y conservar sólo su separación editorial externa."
);

assert(
  has(
    publicRuntime,
    "GameMedia",
    "FramedVideo",
    "REDUCED_MOTION_MEDIA",
    "documentVisible",
    "failedVideo",
    'mode === "video"',
    'preload="metadata"',
    "onError={() => setFailedVideo(video.clip)}"
  ) &&
    !publicRuntime.includes("FINE_POINTER_MEDIA") &&
    !publicRuntime.includes("INTERACTION_SCOPE") &&
    !publicRuntime.includes("hoverActive") &&
    !publicRuntime.includes("pointerenter") &&
    !publicRuntime.includes("pointerleave") &&
    !publicRuntime.includes("focusin") &&
    !publicRuntime.includes("focusout") &&
    has(
      publicRuntimeCss,
      ".imageLayer",
      ".videoLayer",
      "@media (prefers-reduced-motion: reduce)"
    ),
  "Runtime debe mantener imagen fallback y montar video sólo en modo Video, respetando reduced-motion, visibilidad y error sin listeners de hover."
);

assert(
  has(
    visualFixture,
    "detail: {",
    'aspect: "source" as const',
    '...(mode === "video" ? { detail: "video" as const } : {})'
  ) &&
    has(
      visualBrowser,
      "detailPlayingVideoExpression",
      "detail-container-video-active-desktop.png",
      "[data-game-detail-media-scope]",
      "Reduced-motion no desmontó el video del Contenedor",
      "La pestaña oculta mantuvo el video del Contenedor",
      "Card + Contenedor video browser smoke: OK"
    ),
  "El Contenedor Video debe conservar un fixture publicado y una prueba browser real de reproducción, reduced-motion, fallback y visibility."
);

if (failures.length) {
  console.error("\nGame detail container media: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Game detail container media: OK (destino independiente, migración sin copias, biblioteca no destructiva, recorte adaptable, Imagen/Video y runtime con presupuesto de movimiento)."
);
