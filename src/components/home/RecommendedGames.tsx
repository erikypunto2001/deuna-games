import Link from "next/link";

import {
  ChevronRight,
  Sparkles,
} from "lucide-react";

import CardCarousel from "@/components/ui/CardCarousel";
import touchStyles from "@/components/ui/TouchTarget.module.css";
import UniversalGameCard from "@/components/ui/UniversalGameCard";
import type { HomeCopy } from "@/data/home-config";
import type {
  HomeCardRevealMode,
} from "@/lib/home/card-row-reveal";
import type { Game } from "@/types/game";

import styles from "./RecommendedGames.module.css";

export default function RecommendedGames({
  games,
  copy,
  personalized = false,
  reasons = {},
  revealMode = "interaction",
}: {
  games: Game[];
  copy: HomeCopy["recommended"];
  personalized?: boolean;
  reasons?: Record<string, string[]>;
  revealMode?: HomeCardRevealMode;
}) {
  const explanation = games
    .flatMap((game) => reasons[game.slug] ?? [])
    .filter((reason, index, values) =>
      values.indexOf(reason) === index
    )
    .slice(0, 2);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            {copy.eyebrow}
          </span>

          <h2>
            {copy.title} <strong>{copy.highlight}</strong>
          </h2>

          <p>{copy.text}</p>

          {personalized && (
            <div className={styles.personalizedNote}>
              <Sparkles size={14} aria-hidden="true" />
              <span>
                Personalizado con tus elecciones en Mi DeUna
                {explanation[0] ? ` · ${explanation.join(" · ")}` : ""}
              </span>
            </div>
          )}
        </div>

        <Link href="/juegos" className={touchStyles.hitArea}>
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
            variant="standard"
            revealMode={revealMode}
          />
        ))}
      </CardCarousel>
    </section>
  );
}