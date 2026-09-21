import {
  resolveGameCardBaseImage,
} from "@/lib/media/game-card-presentation";
import type {
  Game,
  GameGalleryItem,
} from "@/types/game";

function galleryKey(item: Pick<GameGalleryItem, "kind" | "src">) {
  return `${item.kind}:${item.src}`;
}

export function getGameGalleryAccessibilityLabel(
  game: Game,
  item: Pick<GameGalleryItem, "kind" | "src">
) {
  const key = galleryKey(item);
  return game.mediaAccessibility?.gallery?.find(
    (entry) => galleryKey(entry) === key
  )?.label;
}

export function getGameGalleryAccessibleFallback(
  game: Game,
  item: Pick<GameGalleryItem, "kind" | "src">,
  index: number
) {
  return getGameGalleryAccessibilityLabel(game, item) ??
    `${game.title} — ${item.kind === "image" ? "imagen" : "video"} ${index + 1}`;
}

export function hasCompleteContextualMediaAccessibility(game: Game) {
  const gallery = game.galleryMedia?.length
    ? game.galleryMedia
    : (game.screenshots ?? []).map((src) => ({
        kind: "image" as const,
        src,
      }));
  const labels = game.mediaAccessibility;
  const coverReady = !game.coverImage || Boolean(labels?.cover?.trim());
  const cardImage = resolveGameCardBaseImage(game);
  const cardReady = !cardImage || Boolean(labels?.card?.trim());
  const galleryReady = gallery.every(
    (item) => Boolean(getGameGalleryAccessibilityLabel(game, item)?.trim())
  );

  return coverReady && cardReady && galleryReady;
}
