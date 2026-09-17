import type {
  Game,
  GameDestinationMediaMode,
} from "@/types/game";

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

/**
 * Canoniza un payload nuevo sin borrar recursos históricos. Los WebM que
 * pertenecían a un antiguo Imagen + hover siguen referenciados en videoMedia
 * y en el historial; sólo cambia el modo activo que puede publicarse desde
 * ahora.
 */
export function normalizeGameActiveMediaModes(game: Game): Game {
  if (!game.mediaModes) return game;

  const mediaModes = {
    ...game.mediaModes,
    ...(game.mediaModes.hero
      ? { hero: normalizeGameMediaMode("hero", game.mediaModes.hero) }
      : {}),
    ...(game.mediaModes.card
      ? { card: normalizeGameMediaMode("card", game.mediaModes.card) }
      : {}),
    ...(game.mediaModes.detail
      ? { detail: normalizeGameMediaMode("detail", game.mediaModes.detail) }
      : {}),
    ...(game.mediaModes.background
      ? {
          background: normalizeGameMediaMode(
            "background",
            game.mediaModes.background
          ),
        }
      : {}),
  };

  return {
    ...game,
    mediaModes,
  };
}
