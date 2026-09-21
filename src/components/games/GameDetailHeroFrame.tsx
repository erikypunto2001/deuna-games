import type { ReactNode } from "react";

import GameDetailContainerMedia from "@/components/games/GameDetailContainerMedia";
import GameCoverMedia from "@/components/ui/GameCoverMedia";
import {
  resolveGameDestinationImage,
  resolveGameDestinationMediaMode,
  resolveGameDetailImageViewport,
} from "@/lib/media/game-video-media";
import type { Game } from "@/types/game";

import styles from "./GameDetailHeroFrame.module.css";

type Props = {
  game: Game;
  children: ReactNode;
  ariaLabelledby?: string;
  className?: string;
};

export default function GameDetailHeroFrame({
  game,
  children,
  ariaLabelledby,
  className,
}: Props) {
  const detailImage = resolveGameDestinationImage(game, "detail");
  const detailImageViewport = resolveGameDetailImageViewport(game);
  const detailMode = resolveGameDestinationMediaMode(game, "detail");

  return (
    <section
      className={`${styles.hero} ${className ?? ""}`}
      aria-labelledby={ariaLabelledby}
      data-game-detail-media-scope
    >
      <div className={styles.media} aria-hidden="true">
        <GameDetailContainerMedia
          mode={detailMode}
          imageSrc={detailImage}
          imageViewport={detailImageViewport}
          video={game.videoMedia?.detail}
        />
        <div className={styles.shade} />
      </div>

      <div className={styles.inner}>
        <div className={styles.cover}>
          <GameCoverMedia
            game={game}
            sizes="(max-width: 700px) 52vw, 260px"
          />
        </div>
        {children}
      </div>
    </section>
  );
}
