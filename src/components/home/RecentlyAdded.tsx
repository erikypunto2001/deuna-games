import Link from "next/link";

import { ChevronRight } from "lucide-react";

import CardCarousel from "@/components/ui/CardCarousel";
import touchStyles from "@/components/ui/TouchTarget.module.css";
import UniversalGameCard from "@/components/ui/UniversalGameCard";
import type { HomeCopy } from "@/data/home-config";
import type {
  HomeCardRevealMode,
} from "@/lib/home/card-row-reveal";
import type { Game } from "@/types/game";

import styles from "./RecentlyAdded.module.css";

export default function RecentlyAdded({
  games,
  copy,
  revealMode = "interaction",
}: {
  games: Game[];
  copy: HomeCopy["recent"];
  revealMode?: HomeCardRevealMode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2>
          {copy.title} <span>{copy.highlight}</span>
        </h2>

        <Link
          href="/juegos?orden=recientes"
          className={touchStyles.hitArea}
        >
          {copy.linkLabel}
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </div>

      <CardCarousel
        ariaLabel={`${copy.title} ${copy.highlight}`}
        itemsDesktop={5}
      >
        {games.map((game) => (
          <UniversalGameCard
            key={game.slug}
            game={game}
            variant="recent"
            revealMode={revealMode}
          />
        ))}
      </CardCarousel>
    </section>
  );
}
