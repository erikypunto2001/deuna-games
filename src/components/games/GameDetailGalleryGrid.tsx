import GameGalleryVideo from "@/components/games/GameGalleryVideo";
import GameMedia from "@/components/ui/GameMedia";
import {
  getGameGalleryAccessibleFallback,
} from "@/lib/media/game-media-accessibility";
import {
  galleryImageViewport,
  galleryVideoAspectRatio,
} from "@/lib/media/game-gallery-media";
import {
  resolveGameImageCropAspectRatio,
} from "@/lib/media/image-viewport";
import type {
  Game,
  GameGalleryItem,
} from "@/types/game";

import styles from "./GameDetailGalleryGrid.module.css";

type Props = {
  game: Game;
  gallery: readonly GameGalleryItem[];
};

export default function GameDetailGalleryGrid({
  game,
  gallery,
}: Props) {
  return (
    <div className={styles.grid}>
      {gallery.map((item, index) => {
        const accessibleLabel = getGameGalleryAccessibleFallback(
          game,
          item,
          index
        );

        if (item.kind === "image") {
          const viewport = galleryImageViewport(game, item);
          return (
            <figure
              key={`image:${item.src}`}
              className={styles.item}
              style={{
                aspectRatio: resolveGameImageCropAspectRatio(viewport),
              }}
            >
              <GameMedia
                src={item.src}
                alt={accessibleLabel}
                sizes="(max-width: 700px) 100vw, 33vw"
                viewport={viewport}
              />
            </figure>
          );
        }

        return (
          <figure
            key={`video:${item.src}`}
            className={styles.item}
            style={{
              aspectRatio: galleryVideoAspectRatio(item.viewport),
            }}
          >
            <GameGalleryVideo
              src={item.src}
              viewport={item.viewport}
              label={accessibleLabel}
            />
          </figure>
        );
      })}
    </div>
  );
}
