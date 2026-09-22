import type { GameDestinationMediaMode } from "@/types/game";

export type GameMediaModeTarget = "hero" | "card" | "detail" | "background";

export const HERO_GAME_MEDIA_MODES = [
  "image",
  "video",
  "hover-video",
] as const satisfies readonly GameDestinationMediaMode[];

export const STANDARD_GAME_MEDIA_MODES = [
  "image",
  "video",
] as const satisfies readonly GameDestinationMediaMode[];

export const GAME_MEDIA_MODES_BY_TARGET = {
  hero: HERO_GAME_MEDIA_MODES,
  card: STANDARD_GAME_MEDIA_MODES,
  detail: STANDARD_GAME_MEDIA_MODES,
  background: STANDARD_GAME_MEDIA_MODES,
} as const satisfies Record<
  GameMediaModeTarget,
  readonly GameDestinationMediaMode[]
>;

export function isGameMediaModeAllowed(
  target: GameMediaModeTarget,
  mode: GameDestinationMediaMode
) {
  const allowed: readonly GameDestinationMediaMode[] =
    GAME_MEDIA_MODES_BY_TARGET[target];
  return allowed.includes(mode);
}

/**
 * Compatibilidad de lectura para snapshots antiguos.
 *
 * Desde septiembre de 2026 sólo Hero conserva Imagen + hover como opción
 * editable. Card migra ese modo histórico a Video para no perder un WebM que
 * ya estaba publicado; el runtime moderno sigue activándolo por interacción en
 * Cards normales y como video visible en filas de detalle estático. Contenedor
 * y Fondo conservan la degradación a Imagen porque ya no tienen interacción
 * multimedia por hover.
 */
export function normalizeGameMediaMode(
  target: GameMediaModeTarget,
  mode: GameDestinationMediaMode
): GameDestinationMediaMode {
  if (isGameMediaModeAllowed(target, mode)) {
    return mode;
  }

  if (
    target === "card" &&
    mode === "hover-video"
  ) {
    return "video";
  }

  return "image";
}
