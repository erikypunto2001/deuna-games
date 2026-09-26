"use client";

import { memo } from "react";

import type {
  HomeCardRevealMode,
} from "@/lib/home/card-row-reveal";
import type { Game } from "@/types/game";

import GameFavoriteButton from "./GameFavoriteButton";
import UniversalGameCardBase, {
  type UniversalGameCardVariant,
} from "./UniversalGameCardBase";
import styles from "./FavoriteUniversalGameCard.module.css";

export type { UniversalGameCardVariant } from "./UniversalGameCardBase";

function UniversalGameCard({
  game,
  variant = "standard",
  revealMode = "interaction",
}: {
  game: Game;
  variant?: UniversalGameCardVariant;
  revealMode?: HomeCardRevealMode;
}) {
  return (
    <UniversalGameCardBase
      game={game}
      variant={variant}
      revealMode={revealMode}
      overlayAction={(
        <GameFavoriteButton
          gameSlug={game.slug}
          gameTitle={game.title}
          className={styles.favorite}
        />
      )}
    />
  );
}

export default memo(UniversalGameCard);
