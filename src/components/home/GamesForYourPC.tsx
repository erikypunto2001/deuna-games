import Link from "next/link";

import {
  CalendarDays,
  ChevronRight,
  Cpu,
  Monitor,
  Sparkles,
  Star,
} from "lucide-react";

import CardCarousel from "@/components/ui/CardCarousel";
import touchStyles from "@/components/ui/TouchTarget.module.css";
import UniversalGameCard from "@/components/ui/UniversalGameCard";
import type { HomeCopy } from "@/data/home-config";
import type {
  HomeCardRevealMode,
} from "@/lib/home/card-row-reveal";
import type { Game } from "@/types/game";

import styles from "./GamesForYourPC.module.css";

const catalogOptions = [
  {
    href: "/juegos?equipo=lowSpec",
    icon: Cpu,
    requiresRatings: false,
  },
  {
    href: "/requisitos",
    icon: Monitor,
    requiresRatings: false,
  },
  {
    href: "/juegos?orden=rating",
    icon: Star,
    requiresRatings: true,
  },
  {
    href: "/juegos?orden=recientes",
    icon: CalendarDays,
    requiresRatings: false,
  },
] as const;

export default function GamesForYourPC({
  games,
  copy,
  ratingsAvailable,
  personalized = false,
  reasons = {},
  revealMode = "interaction",
}: {
  games: Game[];
  copy: HomeCopy["lowSpec"];
  ratingsAvailable: boolean;
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
      <div className={styles.mainHeader}>
        <div>
          <span className={styles.eyebrow}>
            {copy.eyebrow}
          </span>

          <h2>
            {copy.title}{" "}
            <strong>{copy.highlight}</strong>
          </h2>

          <p>{copy.text}</p>

          {personalized && (
            <div className={styles.personalizedNote}>
              <Sparkles size={14} aria-hidden="true" />
              <span>
                Ordenado con la PC que guardaste en Mi DeUna
                {explanation[0] ? ` · ${explanation.join(" · ")}` : ""}
              </span>
            </div>
          )}
        </div>

        <Link href="/requisitos" className={touchStyles.hitArea}>
          {copy.cta}
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </div>

      <div className={styles.hardwareGrid}>
        {catalogOptions.map((option, index) => {
          const Icon = option.icon;
          const unavailable =
            option.requiresRatings && !ratingsAvailable;
          const content = (
            <>
              <div className={styles.hardwareIcon}>
                <Icon size={25} aria-hidden="true" />
              </div>

              <div>
                <h3>{copy.optionTitles[index]}</h3>
                <p>{copy.optionSubtitles[index]}</p>
              </div>

              {!unavailable && (
                <ChevronRight
                  size={19}
                  className={styles.hardwareArrow}
                  aria-hidden="true"
                />
              )}
            </>
          );

          if (unavailable) {
            return (
              <div
                className={`${styles.hardwareCard} ${styles.hardwareCardUnavailable}`}
                key={`${index}:${option.href}`}
              >
                {content}
              </div>
            );
          }

          return (
            <Link
              href={option.href}
              className={styles.hardwareCard}
              key={`${index}:${option.href}`}
            >
              {content}
            </Link>
          );
        })}
      </div>

      <div className={styles.divider} />

      <div className={styles.gamesHeader}>
        <h3>
          {personalized ? "Mejor resultado" : copy.listTitle}{" "}
          <span>{personalized ? "en tu PC" : copy.listHighlight}</span>
        </h3>

        <Link
          href={personalized ? "/cuenta?vista=pc" : "/juegos/bajos-recursos"}
          className={touchStyles.hitArea}
        >
          {personalized ? "Ver Mi PC" : copy.listLinkLabel}
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </div>

      <CardCarousel
        ariaLabel={personalized ? "Juegos mejor estimados para tu PC" : `${copy.listTitle} ${copy.listHighlight}`}
        itemsDesktop={5}
      >
        {games.map((game) => (
          <UniversalGameCard
            key={game.slug}
            game={game}
            variant="lowSpec"
            revealMode={revealMode}
          />
        ))}
      </CardCarousel>
    </section>
  );
}
