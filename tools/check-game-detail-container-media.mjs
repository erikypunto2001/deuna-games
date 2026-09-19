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
  publicRuntime,
  publicRuntimeCss,
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
  source("src/components/games/GameDetailContainerMedia.tsx"),
  source("src/components/games/GameDetailContainerMedia.module.css"),
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
    'return isGameMediaModeAllowed(target, mode) ? mode : "image"'
  ),
  "La política activa del Contenedor debe limitarse a Imagen/Video y degradar hover histórico a Imagen."
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
      "getHistoricalGameMediaReferences"
    ) &&
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
    publicPage,
    'import GameDetailContainerMedia from "@/components/games/GameDetailContainerMedia"',
    'resolveGameDestinationImage(game, "detail")',
    'resolveGameDestinationMediaMode(game, "detail")',
    "game.imageMedia?.detail",
    "data-game-detail-media-scope",
    "<GameDetailContainerMedia",
    "video={game.videoMedia?.detail}"
  ) &&
    !publicPage.includes('src={game.heroImage ?? game.coverImage}\n              alt=""\n              sizes="100vw"\n              priority'),
  "La ficha pública debe dejar de renderizar Hero directamente como fondo interno y consumir el destino detail."
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

if (failures.length) {
  console.error("\nGame detail container media: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Game detail container media: OK (destino independiente, migración sin copias, biblioteca no destructiva, recorte adaptable, Imagen/Video y runtime con presupuesto de movimiento)."
);
