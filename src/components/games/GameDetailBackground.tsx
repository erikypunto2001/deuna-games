"use client";

import type { ReactNode } from "react";

import GameDetailBackgroundMedia from "@/components/games/GameDetailBackgroundMedia";
import {
  resolveGameBackgroundMediaMode,
} from "@/lib/media/game-media-requirements";
import type { Game } from "@/types/game";

import styles from "./GameDetailBackground.module.css";

type Props = {
  game: Game | null | undefined;
  children: ReactNode;
};

export default function GameDetailBackground({ game, children }: Props) {
  if (!game || !resolveGameBackgroundMediaMode(game)) {
    return <>{children}</>;
  }

  return (
    <div className={styles.root}>
      <GameDetailBackgroundMedia
        game={game}
        position="fixed"
        sizes="100vw"
      />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
