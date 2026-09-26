import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "./check-card-preview-runtime.mjs";
import "./check-universal-game-card-3d.mjs";


const root = process.cwd();
const failures = [];
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const has = (text, ...needles) => needles.every((needle) => text.includes(needle));


const [
  policy,
  safeWebm,
  providers,
  modePolicy,
  libraryEditor,
  trimEditor,
  mediaViewportEditor,
  workspace,
  utilityRail,
  libraryTypes,
  mediaWorkspace,
  libraryRoute,
  imageLayoutRoute,
  viewportEditor,
  coverRenderer,
  cardPresentation,
  cardResolver,
  cardWrapper,
  cardBase,
  cardPresentationCss,
  hoverPreview,
  framedVideo,
  framedLayout,
  videoMedia,
  requirements,
  publicationReadiness,
  publicationChanges,
  validation,
  validationCore,
  importRoute,
  uploadRoute,
  layoutRoute,
  integrity,
  hygiene,
  serving,
  legacyCover,
  gameTypes,
] = await Promise.all([
  source("src/lib/media/preview-video-policy.ts"),
  source("src/lib/media/safe-webm.ts"),
  source("src/lib/media/preview-providers.ts"),
  source("src/lib/media/game-media-mode-policy.ts"),
  source("src/components/admin/GameVideoLibraryEditor.tsx"),
  source("src/components/admin/VideoTrimEditor.tsx"),
  source("src/components/admin/MediaViewportEditor.tsx"),
  source("src/components/admin/GameMediaAssignmentsWorkspace.tsx"),
  source("src/components/admin/GameMultimediaUtilityRail.tsx"),
  source("src/components/admin/game-multimedia-library-types.ts"),
  source("src/lib/admin/game-media-workspace.ts"),
  source("src/app/api/admin/content/games/[slug]/media-library/route.ts"),
  source("src/app/api/admin/content/games/[slug]/image-layout/route.ts"),
  source("src/components/admin/GameVideoViewportEditor.tsx"),
  source("src/components/ui/GameCoverMedia.tsx"),
  source("src/lib/media/game-card-presentation.ts"),
  source("src/lib/media/game-card-preview.ts"),
  source("src/components/ui/UniversalGameCard.tsx"),
  source("src/components/ui/UniversalGameCardBase.tsx"),
  source("src/components/ui/UniversalGameCardPresentation.module.css"),
  source("src/components/ui/HoverPreviewMedia.tsx"),
  source("src/components/ui/FramedVideo.tsx"),
  source("src/lib/media/framed-media-layout.ts"),
  source("src/lib/media/game-video-media.ts"),
  source("src/lib/media/game-media-requirements.ts"),
  source("src/lib/admin/game-publication-readiness.ts"),
  source("src/lib/admin/game-publication-changes.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/admin/content-validation-core.ts"),
  source("src/app/api/admin/content/games/[slug]/preview-import/route.ts"),
  source("src/app/api/admin/content/games/[slug]/preview-upload/route.ts"),
  source("src/app/api/admin/content/games/[slug]/preview-layout/route.ts"),
  source("src/lib/admin/game-media-integrity.ts"),
  source("src/lib/admin/game-media-hygiene.ts"),
  source("src/lib/media/editorial-media-serving.ts"),
  source("src/lib/media/legacy-game-cover-video.ts"),
  source("src/types/game.ts"),
]);


assert(
  has(
    policy,
    "MAX_PREVIEW_DURATION_SECONDS = 30",
    "MAX_PREVIEW_SOURCE_BYTES",
    "DEFAULT_PREVIEW_QUALITY",
    "DEFAULT_PREVIEW_FPS",
    "MAX_PREVIEW_FPS",
    '"720p"',
    '"1080p"',
    '"3:2"',
    "MAX_PREVIEW_VIEWPORT_ZOOM"
  ),
  "La política de video debe conservar límites, calidades, FPS y viewport 3:2."
);


assert(
  has(safeWebm, "MAX_EDITORIAL_PREVIEW_BYTES", "inspectSafeEditorialWebm", "digest"),
  "Los masters WebM editoriales deben seguir pasando por validación segura y hash."
);


assert(
  has(
    providers,
    "PREVIEW_PROVIDER_IDS",
    "parsePreviewProviderUrl",
    '"youtube"',
    '"facebook"',
    '"instagram"',
    '"tiktok"',
    '"vimeo"'
  ),
  "La importación externa debe conservar proveedores explícitos y validación por URL."
);


const standardModes = modePolicy.match(
  /STANDARD_GAME_MEDIA_MODES\s*=\s*\[([\s\S]*?)\]/
)?.[1] ?? "";
assert(
  has(standardModes, '"image"', '"video"') &&
    !standardModes.includes('"hover-video"') &&
    modePolicy.includes("card: STANDARD_GAME_MEDIA_MODES"),
  "La Card activa debe admitir sólo Imagen/Video; Imagen+hover queda reservado al Hero."
);


assert(
  has(
    libraryEditor,
    "const operationLock = useRef(false)",
    "if (operationLock.current) return",
    "operationLock.current = true",
    "operationLock.current = false",
    "Espera a que termine la operación multimedia actual."
  ) &&
    !libraryEditor.includes("sourceBusy || busy) return"),
  "La Biblioteca de video debe usar una única autoridad síncrona para impedir solapamientos entre preparación de fuente y creación del master."
);


assert(
  has(
    libraryEditor,
    '"X-Deuna-Preview-Target": "library"',
    'target: "library"',
    "VideoTrimEditor",
    '"X-Deuna-Preview-Fps"',
    "DEFAULT_PREVIEW_FPS",
    "fps={fps}",
    "onFpsChange={setFps}"
  ) &&
    !libraryEditor.includes('"X-Deuna-Viewport-X"') &&
    !libraryEditor.includes("viewportX: String(DEFAULT_PREVIEW_VIEWPORT.x)") &&
    has(
      trimEditor,
      "PREVIEW_FPS_OPTIONS",
      'name="preview-fps"',
      "onFpsChange(option)"
    ),
  "La biblioteca debe crear un master reusable sin asignarlo a destinos ni enviar crops de Hero/Card durante la creación."
);


assert(
  has(
    trimEditor,
    "requestAnimationFrame",
    "scheduleDrag",
    "parsePreviewTrimWindow",
    "Marcar IN aquí",
    "Marcar OUT aquí",
    "Salida del master",
    "fotograma completo"
  ) &&
    !trimEditor.includes("scheduleViewportDraft") &&
    !trimEditor.includes("resolvePreviewViewportCrop"),
  "El trim del master debe limitarse al tramo temporal y salida técnica."
);


assert(
  has(
    mediaViewportEditor,
    'type MediaKind = "image" | "video"',
    "resolvePreviewViewportCrop",
    "viewportFrame",
    "viewportMoveHandle",
    "scheduleViewportDraft",
    "resultCanvasRef",
    "requiredAspect",
    "Resultado final"
  ),
  "Imagen y video deben compartir un único motor de encuadre espacial."
);


assert(
  has(
    workspace,
    "HERO_GAME_MEDIA_MODES",
    "STANDARD_GAME_MEDIA_MODES",
    "const HERO_MODES",
    "const CARD_MODES",
    'const options = target === "hero" ? HERO_MODES : CARD_MODES',
    "const COVER_SOURCES",
    "Misma imagen que Card",
    "Imagen diferente",
    'name="resource"',
    'value="cover-source"',
    "const posterSource = assignments.coverArtworkSource",
    "const cardImageReady",
    "const cardDetailReady = cardImageReady &&",
    'target="card-image"',
    'target="card-video"',
    'target="cover-image"',
    "posterSource === \"custom\"",
    "Comparte el master, no el recorte",
    "Card conserva siempre una imagen base 3:2",
    "Video principal + imagen de respaldo obligatoria.",
    "assignments.resolvedCardVideo?.src",
    "assignments.resolvedCardVideo?.viewport"
  ) &&
    !workspace.includes("function cardVideoClip(") &&
    !workspace.includes("function cardVideoViewport(") &&
    !workspace.includes("assignments.legacyPreviewClip") &&
    !workspace.includes("Imagen es el estado inicial. El video entra al hover o foco") &&
    !workspace.includes('target="cover-video"') &&
    !workspace.includes('target="cover-mode"') &&
    !workspace.includes("coverVideo"),
  "El Admin debe limitar Card a Imagen/Video, exponer shared/custom explícito, mantener crops 4:5/3:2 independientes y no reintroducir video de Portada."
);


assert(
  has(
    utilityRail,
    '{ kind: "image", src: assignments?.coverImage }',
    "<strong>Portada · 4:5</strong><small>Imagen</small>",
    "<strong>Hero · 3:1</strong>",
    "<strong>Card · 3:2</strong>",
    "assignments?.resolvedCardVideo?.src",
    "Sólo imagen. Selecciona un recurso y confirma su único recorte 4:5."
  ) &&
    !utilityRail.includes("assignments?.coverMode") &&
    !utilityRail.includes("assignments?.coverVideo") &&
    !utilityRail.includes("Hero · 16:9"),
  "El rail debe reflejar Portada image-only, Hero 3:1 y Card 3:2."
);


assert(
  has(
    libraryTypes,
    "GameCoverArtworkSource",
    "coverArtworkSource: GameCoverArtworkSource",
    'mode: "image"',
    'aspect: "4:5"',
    'aspect: "3:1"',
    'aspect: "3:2"',
    "heroVideo: GameHeroVideo | null",
    "resolvedCardVideo: ResolvedGameVideo | null"
  ) &&
    !libraryTypes.includes("legacyPreviewClip") &&
    !libraryTypes.includes("GameCoverVideo") &&
    !libraryTypes.includes("coverMode:") &&
    !libraryTypes.includes("coverVideo:"),
  "El estado compartido del workspace debe transportar intención Card/Portada sin modo/video de Portada."
);


assert(
  has(
    mediaWorkspace,
    "resolveGameCoverArtworkSource",
    "resolveGameCoverImage",
    "resolveGameCardBaseImage",
    "coverArtworkSource: resolveGameCoverArtworkSource(game)",
    "coverImage: resolveGameCoverImage(game) ?? null",
    "cardImage: resolveGameCardBaseImage(game) ?? null",
    'heroMode: resolveGameDestinationMediaMode(game, "hero")',
    "resolveGameCardVideo",
    "resolvedCardVideo: resolveGameCardVideo(game) ?? null"
  ) &&
    !mediaWorkspace.includes("legacyPreviewClip") &&
    !mediaWorkspace.includes('resolveGameDestinationMediaMode(game, "cover")') &&
    !mediaWorkspace.includes("coverMode:") &&
    !mediaWorkspace.includes("coverVideo:"),
  "El snapshot Admin debe resolver la intención efectiva y excluir modo/video de Portada."
);


assert(
  has(
    libraryRoute,
    '"cover-source"',
    'const coverSourceSchema = z.enum(["card", "custom"])',
    "function pendingImageViewport(source: string)",
    "coverArtworkSource: \"custom\"",
    "const sharesCover = resolveGameCoverArtworkSource(current) === \"card\"",
    "card: pendingImageViewport(imageResource.src)",
    "cover: pendingImageViewport(imageResource.src)",
    '"card-mode"',
    '"card-image"',
    '"card-video"',
    "STANDARD_GAME_MEDIA_MODES",
    "standardMediaModeSchema",
    'source: "independent"',
    'requiredVideoViewport("card")',
    'playback: "always"',
    "previewClip: videoResource.src"
  ) &&
    !libraryRoute.includes("export async function GET") &&
    !libraryRoute.includes("NextResponse") &&
    !libraryRoute.includes('"cover-mode"') &&
    !libraryRoute.includes('"cover-video"') &&
    !libraryRoute.includes('requiredVideoViewport("cover")'),
  "La API debe ser autoridad de shared/custom, rechazar hover de Card, invalidar crops al cambiar masters y mantener Card/video independiente."
);


assert(
  has(
    libraryRoute,
    "resolveGameCoverArtworkSource(current) === source.data",
    "const sameCoverImage =",
    "sameCoverImage && current.imageMedia?.cover",
    "current.heroImage === imageResource.src",
    "resolveGameCardBaseImage(current) === imageResource.src",
    "current.videoMedia?.hero?.clip === videoResource.src",
    'current.videoMedia?.card?.source === "independent"',
    "current.videoMedia.card.clip === videoResource.src",
    'current.videoMedia.card.playback === "always"'
  ),
  "Portada/Hero/Card deben preservar crops y evitar revisiones al reasignar el mismo recurso, sin impedir normalizar playback legacy."
);


assert(
  has(
    imageLayoutRoute,
    "function confirmedViewport",
    "source: string",
    "source = targetImage",
    "const savedViewport = confirmedViewport(viewport, source)",
    'const fixedImageTargets = ["cover", "hero", "card"] as const'
  ),
  "Confirmar un crop debe ligar server-side la metadata al recurso activo."
);


assert(
  has(
    viewportEditor,
    "MediaViewportEditor",
    'kind="video"',
    'type Target = "hero" | "card" | "detail"',
    "preview-layout",
    "REQUIRED_DESTINATION_ASPECTS[target]",
    "Confirmar recorte"
  ) &&
    !viewportEditor.includes('target === "cover"'),
  "El editor de viewport de video no puede admitir Portada."
);


assert(
  has(
    coverRenderer,
    "GameMedia",
    "resolveGameCoverImage",
    "const coverImage = resolveGameCoverImage(game)",
    "src={coverImage}",
    "viewport={game.imageMedia?.cover}",
    'aspectRatio: "4 / 5"'
  ) &&
    !coverRenderer.includes("src={game.coverImage}") &&
    !coverRenderer.includes("FramedVideo") &&
    !coverRenderer.includes("resolveGameCoverVideo"),
  "El renderer específico de Portada debe resolver shared/custom, conservar su recorte 4:5 y seguir siendo image-only."
);


assert(
  has(
    cardPresentation,
    "resolveGameCoverArtworkSource",
    "if (game.coverArtworkSource) return game.coverArtworkSource",
    "game.cardImage !== game.coverImage",
    "resolveGameCardBaseImage",
    "resolveGameCoverImage",
    "resolveGameCardPresentation",
    "viewport: game.imageMedia?.cover",
    "viewport: game.imageMedia?.card"
  ),
  "La presentación pública debe priorizar intención explícita y usar inferencia sólo para snapshots legacy."
);


assert(
  has(
    videoMedia,
    'export type GameVideoTarget = "hero" | "card" | "detail"',
    'export type GameMediaDestinationTarget = "cover" | GameVideoTarget',
    'if (target === "cover") return "image"',
    'card: "image"',
    "normalizeGameMediaMode(target, explicit)",
    "resolveGameCardVideo",
    'card?.source === "hero"',
    'card?.source === "independent"',
    'target === "card" && game.previewClip?.trim()',
    "legacyCardViewport",
    "withGameVideoLayout",
    "withoutGameVideoTarget"
  ) &&
    !videoMedia.includes("resolveGameCoverVideo") &&
    !videoMedia.includes("media?.cover"),
  "El dominio debe forzar Portada=image, Card activa Imagen/Video y conservar Card/Hero/Detalle como únicos destinos de video."
);


assert(
  has(
    gameTypes,
    'export type GameCoverArtworkSource = "card" | "custom"',
    "source?: string",
    "export type GameMediaModes",
    "export type GameVideoMedia",
    "Portada es siempre imagen",
    "Portada queda fuera del contrato activo",
    "coverImage?: string"
  ) &&
    !gameTypes.includes("GameCoverVideo") &&
    !gameTypes.includes("cover?: GameDestinationMediaMode") &&
    !gameTypes.includes("cover?: GameCoverVideo"),
  "El contrato Game debe persistir intención/provenance y excluir video activo de Portada."
);


assert(
  has(
    requirements,
    "resolveGameCoverImage",
    "resolveGameCardBaseImage",
    "viewport.source !== expectedSource",
    "const coverImage = resolveGameCoverImage(game)",
    "const cardImageReady",
    "resolveGameCardVideo(game)",
    "cardImageReady && cardVideoReady"
  ) &&
    !requirements.includes("videoMedia?.cover") &&
    !requirements.includes('resolveGameDestinationMediaMode(game, "cover")'),
  "Readiness debe validar la fuente del crop y exigir la imagen 3:2 de Card incluso cuando hay video."
);


assert(
  publicationReadiness.includes("La Portada requiere una imagen y su recorte 4:5 confirmado.") &&
    !publicationReadiness.includes("La Portada debe completar los recursos exigidos por su modo activo.") &&
    !publicationReadiness.includes("La imagen inicial 3:2 y el video que entra al hover"),
  "Readiness de publicación debe describir Portada image-only y Card sólo Imagen/Video."
);


assert(
  !gameTypes.includes("GamePreviewMode") &&
    !gameTypes.includes("GameYouTubePreview") &&
    !gameTypes.includes("GameDirectPreview") &&
    !gameTypes.includes("GameDirectPreviewPlatform") &&
    !gameTypes.includes("previewMode?:") &&
    !gameTypes.includes("youtubePreview?:") &&
    !gameTypes.includes("directPreview?:") &&
    gameTypes.includes("previewClip?: string") &&
    !validationCore.includes("youtubePreviewSchema") &&
    !validationCore.includes("previewMode:") &&
    !validationCore.includes("youtubePreview:") &&
    validation.includes("delete clean.previewMode") &&
    validation.includes("delete clean.youtubePreview") &&
    validation.includes("delete clean.directPreview") &&
    !publicationChanges.includes("previewMode") &&
    !publicationChanges.includes("youtubePreview") &&
    !publicationChanges.includes("directPreview"),
  "El contrato activo y el diff de publicación no deben exponer previews externos legacy; la capa de compatibilidad debe consumir esas claves antes del parser core."
);


assert(
  has(
    validation,
    "const cardVideoSchema = z.union",
    'source: z.literal("hero")',
    'source: z.literal("independent")',
    'cover: destinationVideoSchema.optional()',
    "coverArtworkSourceSchema",
    "resolvedCoverArtworkSource",
    'resolvedCoverArtworkSource === "card"',
    "resolvedCoverImage",
    "coverArtworkSource: resolvedCoverArtworkSource",
    "coverImage: resolvedCoverImage",
    "activeVideoMedia",
    "videoMedia.hero",
    "videoMedia.card",
    "legacyCardPreview",
    "game.previewClip",
    "const normalizedGame: Game"
  ),
  "La validación debe aceptar historial legado, normalizar shared/custom, sincronizar Portada compartida con Card y eliminar video activo de Portada."
);


for (const route of [uploadRoute, importRoute]) {
  assert(
    has(
      route,
      'target !== "library"',
      "storeEditorialPreviewVideoFromPath",
      '"hero"'
    ) &&
      !route.includes("saveGameMediaDraft") &&
      !route.includes("withSavedGameVideoClip") &&
      !route.includes('normalized === "card"') &&
      !route.includes('normalized === "hero"'),
    "Carga/importación debe limitarse a generar el master reusable en Biblioteca; la asignación a Hero/Card pertenece sólo a media-library."
  );
}


assert(
  has(
    layoutRoute,
    'value === "hero"',
    'value === "card"',
    'value === "detail"',
    "withGameVideoLayout",
    "hasExactAdminFormFields",
    "REQUIRED_DESTINATION_ASPECTS[target]",
    "GAME_DETAIL_VIEWPORT_ASPECT"
  ) &&
    !layoutRoute.includes('value === "cover"') &&
    !layoutRoute.includes("storeEditorialPreviewVideo") &&
    !layoutRoute.includes("FFmpeg"),
  "Guardar layout de video debe ser metadata-only y rechazar Portada."
);


assert(
  has(
    legacyCover,
    "legacyGameCoverVideoReference",
    "videoMedia",
    "cover",
    "clip.trim()"
  ) &&
    has(
      serving,
      'owner.type === "game"',
      "legacyGameCoverVideoReference(payload)",
      "legacyCoverVideo ? [legacyCoverVideo] : []",
      "published_payload",
      "public_visible",
      "isCurrentlyPublished",
      "safePublicationReferences(owner, item.published_payload)",
      "refreshed.references.has(publicPath)"
    ) &&
    !serving.includes("editorial_publications") &&
    !serving.includes("editorial_revisions") &&
    !serving.includes("historicalPublicationRows") &&
    !serving.includes("getHistoricalGameMediaReferences"),
  "Los WebM legacy de Portada sólo pueden servirse desde la publicación vigente; ningún historial debe protegerlos ni exponerlos."
);


assert(
  has(
    integrity,
    "game.cardImage",
    'game.videoMedia?.card?.source === "independent"',
    "game.videoMedia.card.clip",
    "game.videoMedia?.background?.clip"
  ) && !integrity.includes("game.videoMedia?.cover"),
  "Integridad activa debe excluir video de Portada y cubrir el resto de referencias."
);


assert(
  hygiene.includes('pushUnique(labels, "Portada")') &&
    !hygiene.includes("coverMode") &&
    !hygiene.includes("coverClip") &&
    !hygiene.includes("videoMedia?.cover"),
  "Higiene debe clasificar Portada activa sin ramas de video/hover."
);


assert(
  has(
    cardResolver,
    'resolveGameDestinationMediaMode(game, "card") === "image"',
    "resolveGameCardVideo",
    'kind: "webm"',
    "viewport: resolved.viewport"
  ),
  "El resolver de preview debe omitir video en modo Imagen y devolver sólo WebM interno cuando Card está en Video."
);


assert(
  has(cardWrapper, "UniversalGameCardBase", "GameFavoriteButton", "variant={variant}"),
  "UniversalGameCard debe delegar el renderer multimedia canónico al base."
);


assert(
  has(
    cardBase,
    "resolveGameCardPresentation",
    "const DIRECT_DETAIL_MEDIA = \"(hover: none), (pointer: coarse)\"",
    "const directDetailVisible = useMediaQuery(DIRECT_DETAIL_MEDIA)",
    "const detailPresented = detailVisible || directDetailVisible",
    'data-detail-visible={detailPresented ? "true" : "false"}',
    "aria-hidden={detailPresented ? \"true\" : undefined}",
    "aria-hidden={!detailPresented ? \"true\" : undefined}",
    "const interactionVideoActive =",
    "!staticDetail &&",
    "!directDetailVisible &&",
    "detailVisible &&",
    "previewActive;",
    "const automaticVideoActive =",
    "automaticVideoInViewport &&",
    "(staticDetail || directDetailVisible) &&",
    'data-card-direct-detail={directDetailVisible ? "true" : "false"}',
    'data-card-video-active={videoActive ? "true" : "false"}',
    "PREVIEW_DELAY_MS"
  ),
  "La Card pública debe alinear la cara visible con touch y activar Video tanto en interacción como en detalle directo sólo bajo el estado y visibilidad correspondientes."
);


assert(
  has(
    cardPresentationCss,
    "aspect-ratio: 4 / 5",
    "aspect-ratio: 3 / 2",
    '@media (hover: none), (pointer: coarse)',
    "@media (prefers-reduced-motion: reduce)"
  ),
  "La Card debe conservar shell 4:5, media 3:2, fallback touch y reduced-motion."
);


assert(
  has(hoverPreview, "FramedVideo", 'preload="none"', "active && previewClip") &&
    has(framedVideo, "resolveFramedMediaLayout", "ResizeObserver") &&
    has(framedLayout, "resolvePreviewViewportCrop", "frameWidth / crop.width", "frameHeight / crop.height"),
  "El video de Card debe cargar diferido y aplicar recorte lógico sin duplicar masters."
);


const activeCoverBoundarySources = [
  workspace,
  utilityRail,
  libraryTypes,
  mediaWorkspace,
  libraryRoute,
  viewportEditor,
  cardPresentation,
  coverRenderer,
  importRoute,
  uploadRoute,
  layoutRoute,
  videoMedia,
  requirements,
  publicationReadiness,
  integrity,
  hygiene,
  gameTypes,
];
for (const forbidden of [
  "GameCoverVideo",
  "resolveGameCoverVideo",
  "videoMedia?.cover",
  "videoMedia.cover",
  '"cover-video"',
  '"cover-mode"',
]) {
  assert(
    activeCoverBoundarySources.every((text) => !text.includes(forbidden)),
    `Portada image-only no debe reintroducir ${forbidden} en el dominio activo.`
  );
}


const activePreviewSources = [
  libraryEditor,
  workspace,
  libraryRoute,
  viewportEditor,
  cardResolver,
  cardWrapper,
  cardBase,
  importRoute,
  uploadRoute,
  layoutRoute,
];
for (const legacyIdentifier of ["youtubePreview", "directPreview", "previewMode"]) {
  assert(
    activePreviewSources.every((text) => !text.includes(legacyIdentifier)),
    `El subsistema activo de Card no debe volver a usar ${legacyIdentifier}.`
  );
}


if (failures.length) {
  console.error("\nCard/Portada multimedia: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}


console.log(
  "Card/Portada multimedia: OK (shared/custom explícito; Portada 4:5; Card 3:2 Imagen/Video; crops ligados a fuente; touch accesible; fallback de video preservado)."
);