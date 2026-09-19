import type {
  Game,
  GameGalleryImageItem,
  GameGalleryItem,
  GameGalleryVideoItem,
  GameImageViewport,
  GameVideoViewport,
} from "@/types/game";

export const MAX_GAME_GALLERY_ITEMS = 8;

export const DEFAULT_GAME_GALLERY_VIDEO_VIEWPORT: GameVideoViewport = {
  x: 0.5,
  y: 0.5,
  zoom: 1,
  aspect: "16:9",
};

export function galleryVideoAspectRatio(viewport: GameVideoViewport) {
  if (viewport.aspect === "3:2") return 3 / 2;
  if (viewport.aspect === "1:1") return 1;
  if (viewport.aspect === "4:5") return 4 / 5;
  if (viewport.aspect === "9:16") return 9 / 16;
  return 16 / 9;
}

function itemKey(item: GameGalleryItem) {
  return `${item.kind}:${item.src}`;
}

function dedupe(items: readonly GameGalleryItem[]) {
  const seen = new Set<string>();
  const resolved: GameGalleryItem[] = [];

  for (const item of items) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(item);
    if (resolved.length >= MAX_GAME_GALLERY_ITEMS) break;
  }

  return resolved;
}

export function legacyGameGalleryItems(game: Pick<Game, "screenshots">) {
  return (game.screenshots ?? []).slice(0, MAX_GAME_GALLERY_ITEMS).map(
    (src): GameGalleryImageItem => ({ kind: "image", src })
  );
}

export function resolveGameGalleryItems(
  game: Pick<Game, "galleryMedia" | "screenshots">
): GameGalleryItem[] {
  if (game.galleryMedia !== undefined) {
    return dedupe(game.galleryMedia);
  }

  return legacyGameGalleryItems(game);
}

export function resolvePublicGameGalleryItems(
  game: Pick<Game, "galleryMedia" | "screenshots" | "heroImage">
): GameGalleryItem[] {
  if (game.galleryMedia !== undefined) {
    return dedupe(game.galleryMedia);
  }

  const legacy = legacyGameGalleryItems(game);
  if (legacy.length > 0) return legacy;

  return game.heroImage
    ? [{ kind: "image", src: game.heroImage }]
    : [];
}

export function galleryImageViewport(
  game: Pick<Game, "imageMedia" | "heroImage" | "galleryMedia" | "screenshots">,
  item: GameGalleryImageItem
): GameImageViewport | undefined {
  const galleryViewport = game.imageMedia?.gallery?.[item.src];
  if (galleryViewport) return galleryViewport;

  const hasConfiguredGallery =
    game.galleryMedia !== undefined || (game.screenshots?.length ?? 0) > 0;
  if (!hasConfiguredGallery && item.src === game.heroImage) {
    return game.imageMedia?.hero;
  }

  return undefined;
}

export function isGameGalleryItemConfirmed(
  game: Pick<Game, "imageMedia">,
  item: GameGalleryItem
) {
  if (item.kind === "image") {
    return game.imageMedia?.gallery?.[item.src]?.confirmed === true;
  }
  return item.viewport.confirmed === true;
}

export function galleryImageSources(items: readonly GameGalleryItem[]) {
  return items
    .filter((item): item is GameGalleryImageItem => item.kind === "image")
    .map((item) => item.src);
}

export function galleryVideoSources(items: readonly GameGalleryItem[]) {
  return items
    .filter((item): item is GameGalleryVideoItem => item.kind === "video")
    .map((item) => item.src);
}

export function withGalleryItem(
  game: Pick<Game, "galleryMedia" | "screenshots">,
  item: GameGalleryItem
) {
  const current = resolveGameGalleryItems(game);
  if (current.some((candidate) => itemKey(candidate) === itemKey(item))) {
    return current;
  }
  return [...current, item].slice(0, MAX_GAME_GALLERY_ITEMS);
}

export function withoutGalleryItem(
  game: Pick<Game, "galleryMedia" | "screenshots">,
  kind: GameGalleryItem["kind"],
  src: string
) {
  return resolveGameGalleryItems(game).filter(
    (item) => !(item.kind === kind && item.src === src)
  );
}

export function moveGalleryItem(
  game: Pick<Game, "galleryMedia" | "screenshots">,
  kind: GameGalleryItem["kind"],
  src: string,
  direction: "up" | "down"
) {
  const items = resolveGameGalleryItems(game);
  const index = items.findIndex(
    (item) => item.kind === kind && item.src === src
  );
  if (index < 0) return items;

  const destination = direction === "up" ? index - 1 : index + 1;
  if (destination < 0 || destination >= items.length) return items;

  const reordered = [...items];
  [reordered[index], reordered[destination]] = [
    reordered[destination],
    reordered[index],
  ];
  return reordered;
}

export function withGalleryVideoViewport(
  game: Pick<Game, "galleryMedia" | "screenshots">,
  src: string,
  viewport: GameVideoViewport
) {
  return resolveGameGalleryItems(game).map((item) =>
    item.kind === "video" && item.src === src
      ? { ...item, viewport }
      : item
  );
}
