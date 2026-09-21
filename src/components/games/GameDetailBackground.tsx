import type { ReactNode } from "react";

import GameDetailBackgroundMedia from "@/components/games/GameDetailBackgroundMedia";
import type { Game } from "@/types/game";

import styles from "./GameDetailBackground.module.css";

type Props = {
  game: Game | null | undefined;
  children: ReactNode;
};

export default function GameDetailBackground({ game, children }: Props) {
  if (!game) return <>{children}</>;

  return (
    <div className={styles.root}>
      <div className={styles.backdrop} aria-hidden="true">
        <GameDetailBackgroundMedia game={game} />
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
