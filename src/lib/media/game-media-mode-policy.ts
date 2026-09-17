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
  return GAME_MEDIA_MODES_BY_TARGET[target].includes(mode as never);
}

/**
 * Compatibilidad de lectura para snapshots antiguos.
 *
 * Desde septiembre de 2026 sólo Hero conserva Imagen + hover. Los demás
 * destinos interpretan ese modo histórico como Imagen: preserva el estado
 * estable que existía antes de la interacción y evita volver a activar hover
 * al leer borradores o publicaciones viejas.
 */
export function normalizeGameMediaMode(
  target: GameMediaModeTarget,
  mode: GameDestinationMediaMode
): GameDestinationMediaMode {
  return isGameMediaModeAllowed(target, mode) ? mode : "image";
}
