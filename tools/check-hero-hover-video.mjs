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
  gameTypes,
  contentValidation,
  modePolicy,
  gameVideoMedia,
  libraryRoute,
  assignmentsWorkspace,
  mediaViewportEditor,
  heroSection,
  clientSignals,
] = await Promise.all([
  source("src/types/game.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/media/game-media-mode-policy.ts"),
  source("src/lib/media/game-video-media.ts"),
  source("src/app/api/admin/content/games/[slug]/media-library/route.ts"),
  source("src/components/admin/GameMediaAssignmentsWorkspace.tsx"),
  source("src/components/admin/MediaViewportEditor.tsx"),
  source("src/components/home/HeroSection.tsx"),
  source("src/lib/browser/client-signals.ts"),
]);

assert(
  has(
    gameTypes,
    'export type GameVideoPlayback = "always" | "hover"',
    "export type GameHeroVideoPlayback = GameVideoPlayback",
    "playback?: GameVideoPlayback",
    'export type GameDestinationMediaMode =',
    '| "hover-video"'
  ),
  "El contrato compatible debe seguir pudiendo representar reproducción always/hover y el modo editorial Imagen+hover del Hero."
);

assert(
  has(
    contentValidation,
    'playback: z.enum(["always", "hover"]).optional()',
    '"image",',
    '"video",',
    '"hover-video",',
    "hero: normalizeGameMediaMode(",
    '"hover-video"'
  ),
  "La validación de compatibilidad debe aceptar modos/playback históricos y mantener Imagen+hover como default histórico del Hero."
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
    !standardModes.includes('"hover-video"'),
  "Imagen+hover debe pertenecer sólo al conjunto activo de modos del Hero."
);

assert(
  has(
    gameVideoMedia,
    "resolveGameHeroVideoPlayback",
    'resolveGameDestinationMediaMode(game, "hero") === "hover-video"',
    '? "hover"',
    ': "always"',
    'hero: "hover-video"'
  ),
  "El runtime debe derivar playback del modo explícito del Hero y mantener Imagen+hover como default editorial del Hero."
);

assert(
  has(
    libraryRoute,
    '"hero-mode"',
    '"hero-image"',
    '"hero-video"',
    "HERO_GAME_MEDIA_MODES",
    "heroMediaModeSchema",
    "mediaModeUpdate",
    'target.data === "hero-video"',
    'target === "hero" && mode === "hover-video" ? "hover" : "always"',
    "saveGameMediaDraft"
  ) &&
    !libraryRoute.includes("hero-hover-video") &&
    !libraryRoute.includes("storeEditorialPreviewVideo") &&
    !libraryRoute.includes("spawn("),
  "Cambiar Hero entre Imagen/Video/Imagen+hover debe guardar sólo metadata/asignaciones y hover sólo puede producir playback=hover en Hero."
);

assert(
  has(
    assignmentsWorkspace,
    "HERO_GAME_MEDIA_MODES",
    "STANDARD_GAME_MEDIA_MODES",
    "const HERO_MODES",
    "const CARD_MODES",
    '"hover-video": "Imagen + hover"',
    'const options = target === "hero" ? HERO_MODES : CARD_MODES',
    'target="hero"',
    "const heroMode = assignments.heroMode",
    'target="hero-image"',
    'target="hero-video"',
    "heroImageReady",
    "heroVideoReady",
    "needsImage(heroMode)",
    "needsVideo(heroMode)",
    "GameVideoViewportEditor",
    "HERO LISTO · 3:1",
    "HERO INCOMPLETO · 3:1"
  ),
  "El Admin debe ofrecer los tres modos sólo al Hero y estados independientes de selección/recorte 3:1 para imagen y video."
);

assert(
  has(
    mediaViewportEditor,
    'width: `min(100%, ${resultPreviewSize.width}px)`',
    'aspectRatio: `${sourceCrop.width} / ${sourceCrop.height}`',
    "data-preview-aspect={currentAspectSummary}",
    "const aspectLocked = requiredAspect !== undefined",
    "resolvePreviewViewportCrop"
  ) &&
    !mediaViewportEditor.includes("height: resultPreviewSize.height"),
  "El resultado final de imagen debe conservar la relación calculada —incluidos 4:5/3:1/3:2 y Galería elegible— al adaptarse a paneles estrechos; el ancho responsive no puede deformar la altura del recorte."
);

assert(
  has(
    heroSection,
    'const FINE_HOVER_MEDIA = "(hover: hover) and (pointer: fine)"',
    'resolveGameDestinationMediaMode(activeGame, "hero")',
    'const hoverPlayback = heroMode === "hover-video"',
    "!reducedMotion &&",
    'heroMode !== "image" &&',
    "(!hoverPlayback || hoverPreviewActive)",
    "if (hoverPlayback && canUseFineHover()) setHoverPreviewActive(true)",
    "if (hoverPlayback) setHoverPreviewActive(false)",
    "onMouseEnter={startHoverPreview}",
    "onMouseLeave={stopHoverPreview}",
    "{isMain && <HeroVideoLayer",
    "enabled={videoShouldRender}"
  ),
  "El Hero público debe reproducir Video continuo o Imagen+hover según el modo: el video queda limitado a la tarjeta principal, hover sólo se activa con puntero compatible y reduced-motion siempre lo deshabilita."
);

assert(
  has(
    heroSection,
    "const documentVisible = useDocumentVisible()",
    'const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")',
    "documentVisible={documentVisible}"
  ) &&
    has(
      clientSignals,
      "useSyncExternalStore",
      "function subscribeDocumentVisibility",
      'document.addEventListener("visibilitychange", notifyVisibility)',
      'document.removeEventListener("visibilitychange", notifyVisibility)',
      "function getDocumentVisibleSnapshot()",
      'return typeof document === "undefined" || !document.hidden',
      "function getDocumentVisibleServerSnapshot()",
      "return true",
      "export function useDocumentVisible()"
    ),
  "La visibilidad del Hero debe compartir una señal única, partir visible en SSR/hidratación y sincronizar document.hidden sin listeners duplicados."
);

if (failures.length) {
  console.error("\nHero hover video: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Hero hover video: OK (Imagen | Video | Imagen+hover exclusivo del Hero, selección/recortes por capa, hidratación determinista y reproducción pública accesible)."
);
