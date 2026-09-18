"use client";

import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Gamepad2,
  Info,
  Pin,
  Plus,
  Search,
  Sparkles,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  HomeCurationCollectionId,
  HomeCurationMode,
  ResolvedHomeConfig,
} from "@/data/home-config";
import {
  HOME_HERO_MAX_SLIDES,
} from "@/lib/home/hero-contract";
import {
  homeRankingDescription,
  rankHomeGames,
  resolveHomeCollectionGames,
} from "@/lib/home/ranking";
import type { Game } from "@/types/game";

import styles from "./HomeCurationEditor.module.css";


const collections: Array<{
  id: HomeCurationCollectionId;
  label: string;
  shortLabel: string;
  description: string;
  limit: number;
  algorithm: string;
}> = [
  {
    id: "hero",
    label: "Hero principal",
    shortLabel: "Hero",
    description:
      "Los títulos con mayor impacto visual y editorial de la portada.",
    limit: HOME_HERO_MAX_SLIDES,
    algorithm: homeRankingDescription("hero"),
  },
  {
    id: "popular",
    label: "Juegos populares",
    shortLabel: "Populares",
    description:
      "Orden dinámico de los juegos con mayor señal de fama dentro del catálogo.",
    limit: 7,
    algorithm: homeRankingDescription("popular"),
  },
  {
    id: "lowSpec",
    label: "Bajos recursos",
    shortLabel: "Bajos recursos",
    description:
      "Juegos con requisitos mínimos moderados y buena calidad editorial.",
    limit: 7,
    algorithm: homeRankingDescription("lowSpec"),
  },
  {
    id: "recommended",
    label: "Juegos recomendados",
    shortLabel: "Recomendados",
    description:
      "Selección de descubrimiento equilibrando calidad, interés y actualidad.",
    limit: 7,
    algorithm: homeRankingDescription("recommended"),
  },
];

const modeCopy: Record<
  HomeCurationMode,
  {
    label: string;
    description: string;
    icon: typeof UserRound;
  }
> = {
  manual: {
    label: "Manual",
    description:
      "La portada respeta exactamente tu selección y tu orden. El algoritmo no agrega juegos.",
    icon: UserRound,
  },
  automatic: {
    label: "Automático",
    description:
      "El ranking decide toda la sección y se reordena cuando cambian sus señales.",
    icon: Bot,
  },
  hybrid: {
    label: "Híbrido",
    description:
      "Tus juegos fijados van primero y el algoritmo completa los lugares restantes.",
    icon: WandSparkles,
  },
};

type SelectionState = Record<
  HomeCurationCollectionId,
  string[]
>;

type ModeState = Record<
  HomeCurationCollectionId,
  HomeCurationMode
>;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function selectionFromConfig(
  config: ResolvedHomeConfig
): SelectionState {
  return {
    hero: [...config.heroSlugs],
    popular: [...config.popularSlugs],
    lowSpec: [...config.lowSpecSlugs],
    recommended: [...config.recommendedSlugs],
  };
}

function modesFromConfig(
  config: ResolvedHomeConfig
): ModeState {
  return {
    hero: config.curation.hero.mode,
    popular: config.curation.popular.mode,
    lowSpec: config.curation.lowSpec.mode,
    recommended: config.curation.recommended.mode,
  };
}

function buildCurationPayload(
  modes: ModeState,
  selections: SelectionState
) {
  return JSON.stringify({
    hero: {
      mode: modes.hero,
      slugs: selections.hero,
    },
    popular: {
      mode: modes.popular,
      slugs: selections.popular,
    },
    lowSpec: {
      mode: modes.lowSpec,
      slugs: selections.lowSpec,
    },
    recommended: {
      mode: modes.recommended,
      slugs: selections.recommended,
    },
  });
}

function GameArtwork({ game }: { game: Game }) {
  if (game.coverImage) {
    return (
      <Image
        src={game.coverImage}
        alt=""
        width={48}
        height={64}
        className={styles.cover}
      />
    );
  }

  return (
    <span className={styles.coverFallback} aria-hidden="true">
      <Gamepad2 size={20} />
    </span>
  );
}

export default function HomeCurationEditor({
  config,
  games,
  publishedSlugs,
  revision,
  rankingReferenceTime,
  excludeHero = false,
}: {
  config: ResolvedHomeConfig;
  games: Game[];
  publishedSlugs: string[];
  revision: number;
  rankingReferenceTime: number;
  excludeHero?: boolean;
}) {
  const baselineModes = useMemo(
    () => modesFromConfig(config),
    [config]
  );
  const baselineSelections = useMemo(
    () => selectionFromConfig(config),
    [config]
  );
  const baselinePayload = useMemo(
    () => buildCurationPayload(baselineModes, baselineSelections),
    [baselineModes, baselineSelections]
  );
  const [active, setActive] =
    useState<HomeCurationCollectionId>(excludeHero ? "popular" : "hero");
  const [modes, setModes] = useState<ModeState>(() =>
    structuredClone(baselineModes)
  );
  const [selections, setSelections] =
    useState<SelectionState>(() => structuredClone(baselineSelections));
  const [query, setQuery] = useState("");
  const rankingNow = rankingReferenceTime;

  const meta = collections.find(
    (collection) => collection.id === active
  )!;
  const visibleCollections = excludeHero
    ? collections.filter((collection) => collection.id !== "hero")
    : collections;
  const activeSelection = selections[active];
  const activeMode = modes[active];

  const gameBySlug = useMemo(
    () => new Map(games.map((game) => [game.slug, game])),
    [games]
  );

  const publishedSet = useMemo(
    () => new Set(publishedSlugs),
    [publishedSlugs]
  );

  const publicCatalog = useMemo(
    () => games.filter((game) => publishedSet.has(game.slug)),
    [games, publishedSet]
  );

  const ranking = useMemo(
    () => rankHomeGames(publicCatalog, active, rankingNow),
    [active, publicCatalog, rankingNow]
  );
  const rankingBySlug = useMemo(
    () =>
      new Map(
        ranking.map((entry) => [entry.game.slug, entry])
      ),
    [ranking]
  );

  const preview = useMemo(
    () =>
      resolveHomeCollectionGames(
        publicCatalog,
        active,
        activeMode,
        activeSelection,
        meta.limit,
        rankingNow
      ),
    [
      active,
      activeMode,
      activeSelection,
      meta.limit,
      publicCatalog,
      rankingNow,
    ]
  );

  const candidates = useMemo(() => {
    const needle = normalize(query.trim());
    const selected = new Set(activeSelection);

    return [...games]
      .filter((game) => {
        if (!needle) return true;
        return normalize(
          `${game.title} ${game.slug} ${game.category} ${(game.genres ?? []).join(" ")}`
        ).includes(needle);
      })
      .sort((a, b) => {
        const aSelected = selected.has(a.slug) ? 0 : 1;
        const bSelected = selected.has(b.slug) ? 0 : 1;
        return (
          aSelected - bSelected ||
          a.title.localeCompare(b.title, "es")
        );
      })
      .slice(0, 10);
  }, [activeSelection, games, query]);

  const serialized = useMemo(
    () => buildCurationPayload(modes, selections),
    [modes, selections]
  );
  const dirty = serialized !== baselinePayload;
  function setMode(mode: HomeCurationMode) {
    setModes((current) => ({
      ...current,
      [active]: mode,
    }));
  }

  function addGame(slug: string) {
    setSelections((current) => {
      if (
        current[active].includes(slug) ||
        current[active].length >= meta.limit
      ) {
        return current;
      }

      return {
        ...current,
        [active]: [...current[active], slug],
      };
    });
  }

  function removeGame(slug: string) {
    setSelections((current) => ({
      ...current,
      [active]: current[active].filter(
        (item) => item !== slug
      ),
    }));
  }

  function moveGame(index: number, direction: -1 | 1) {
    setSelections((current) => {
      const target = index + direction;
      if (
        target < 0 ||
        target >= current[active].length
      ) {
        return current;
      }

      const next = [...current[active]];
      [next[index], next[target]] = [
        next[target],
        next[index],
      ];

      return {
        ...current,
        [active]: next,
      };
    });
  }

  return (
    <form
      method="post"
      action="/api/admin/content/home"
      className={styles.root}
      data-home-editor-dirty={dirty ? "true" : "false"}
    >
      <input
        type="hidden"
        name="expectedRevision"
        value={revision}
      />
      <input
        type="hidden"
        name="curationJson"
        value={serialized}
      />

      <section className={styles.overview}>
        <div>
          <span>CURADURÍA INTELIGENTE</span>
          <h2>Control editorial + ranking automático</h2>
          <p>
            Cada bloque puede trabajar en Manual, Automático o Híbrido. El ranking es determinista y explicable: usa sólo datos editoriales publicados y no identifica visitantes.
          </p>
        </div>
        <div className={styles.overviewFacts}>
          <div>
            <strong>{games.length}</strong>
            <span>juegos editoriales</span>
          </div>
          <div>
            <strong>{publishedSet.size}</strong>
            <span>publicados</span>
          </div>
          <div>
            <strong>3</strong>
            <span>modos por bloque</span>
          </div>
        </div>
      </section>

      <nav
        className={styles.collectionTabs}
        aria-label="Bloques de juegos de la portada"
       
      >
        {visibleCollections.map((collection) => {
          const selected = collection.id === active;
          const mode = modes[collection.id];

          return (
            <button
              key={collection.id}
              type="button"
              data-active={selected}
              aria-pressed={selected}
              onClick={() => {
                setActive(collection.id);
                setQuery("");
              }}
            >
              <span>{collection.shortLabel}</span>
              <small>{modeCopy[mode].label}</small>
            </button>
          );
        })}
      </nav>

      <section className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div>
            <span>{meta.label}</span>
            <h2>{meta.description}</h2>
          </div>
          <div className={styles.limitBadge}>
            Hasta {meta.limit} visibles
          </div>
        </header>

        <div
          className={styles.modeGrid}
          aria-label={`Modo de ${meta.label}`}
        >
          {(Object.keys(modeCopy) as HomeCurationMode[]).map(
            (mode) => {
              const item = modeCopy[mode];
              const Icon = item.icon;
              const selected = activeMode === mode;

              return (
                <button
                  key={mode}
                  type="button"
                  className={styles.modeCard}
                  data-active={selected}
                  aria-pressed={selected}
                  onClick={() => setMode(mode)}
                >
                  <span className={styles.modeIcon}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className={styles.modeCopy}>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {selected && (
                    <Check
                      className={styles.modeCheck}
                      size={18}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            }
          )}
        </div>

        <div className={styles.algorithmNote}>
          <Sparkles size={18} aria-hidden="true" />
          <div>
            <strong>Cómo puntúa este bloque</strong>
            <span>{meta.algorithm}</span>
          </div>
        </div>

        <div className={styles.columns}>
          <section className={styles.selectionPanel}>
            <div className={styles.panelHeading}>
              <div>
                <span>
                  {activeMode === "hybrid"
                    ? "JUEGOS FIJADOS"
                    : activeMode === "automatic"
                      ? "PREFERENCIAS CONSERVADAS"
                      : "SELECCIÓN MANUAL"}
                </span>
                <h3>
                  {activeMode === "automatic"
                    ? "El algoritmo tiene el control"
                    : `${activeSelection.length} configurados`}
                </h3>
              </div>
              <span className={styles.counter}>
                {activeSelection.length} / {meta.limit}
              </span>
            </div>

            {activeMode === "automatic" && (
              <div className={styles.passiveNotice}>
                <Info size={17} aria-hidden="true" />
                <p>
                  La lista manual queda guardada por si vuelves a Manual o Híbrido, pero no altera el ranking mientras este bloque esté en Automático.
                </p>
              </div>
            )}

            <div className={styles.selectedList}>
              {activeSelection.length === 0 ? (
                <div className={styles.emptySelection}>
                  <Pin size={20} aria-hidden="true" />
                  <strong>
                    {activeMode === "automatic"
                      ? "Sin preferencias guardadas"
                      : "Todavía no hay juegos fijados"}
                  </strong>
                  <span>
                    Busca un título abajo y agrégalo a esta colección.
                  </span>
                </div>
              ) : (
                activeSelection.map((slug, index) => {
                  const game = gameBySlug.get(slug);
                  const isPublished = publishedSet.has(slug);

                  return (
                    <div
                      key={slug}
                      className={styles.selectedRow}
                      data-unpublished={!isPublished}
                    >
                      <span className={styles.position}>
                        {index + 1}
                      </span>
                      {game ? (
                        <GameArtwork game={game} />
                      ) : (
                        <span
                          className={styles.coverFallback}
                          aria-hidden="true"
                        >
                          <Gamepad2 size={20} />
                        </span>
                      )}
                      <div className={styles.gameIdentity}>
                        <strong>{game?.title ?? slug}</strong>
                        <span>
                          {game
                            ? `${game.category} · ${game.rating?.toFixed(1) ?? "s/r"}★ · ${game.reviews ?? "sin reseñas"}`
                            : "El juego ya no está disponible en el catálogo editorial"}
                        </span>
                        {!isPublished && (
                          <small>No publicado: no aparecerá en la vista pública</small>
                        )}
                      </div>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveGame(index, -1)}
                          aria-label={`Subir ${game?.title ?? slug}`}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={index === activeSelection.length - 1}
                          onClick={() => moveGame(index, 1)}
                          aria-label={`Bajar ${game?.title ?? slug}`}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => removeGame(slug)}
                          aria-label={`Quitar ${game?.title ?? slug}`}
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className={styles.library}>
              <div className={styles.libraryHeading}>
                <div>
                  <strong>Agregar desde el catálogo</strong>
                  <span>
                    Busca por título, slug o clasificación.
                  </span>
                </div>
              </div>

              <label className={styles.searchBox}>
                <Search size={17} aria-hidden="true" />
                <span className={styles.srOnly}>
                  Buscar juego para agregar
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Buscar juego..."
                />
              </label>

              <div className={styles.candidateList}>
                {candidates.map((game) => {
                  const selected =
                    activeSelection.includes(game.slug);
                  const atLimit =
                    activeSelection.length >= meta.limit;
                  const isPublished = publishedSet.has(game.slug);

                  return (
                    <div
                      key={game.slug}
                      className={styles.candidateRow}
                    >
                      <GameArtwork game={game} />
                      <div className={styles.gameIdentity}>
                        <strong>{game.title}</strong>
                        <span>
                          {game.category} · {game.rating?.toFixed(1) ?? "s/r"}★ · {game.reviews ?? "sin reseñas"}
                        </span>
                        {!isPublished && (
                          <small>Disponible sólo en borrador</small>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={selected || atLimit}
                        onClick={() => addGame(game.slug)}
                      >
                        {selected ? (
                          <Check size={16} aria-hidden="true" />
                        ) : (
                          <Plus size={16} aria-hidden="true" />
                        )}
                        {selected
                          ? "Agregado"
                          : atLimit
                            ? "Límite"
                            : "Agregar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className={styles.previewPanel}>
            <div className={styles.panelHeading}>
              <div>
                <span>VISTA PREVIA DEL RESULTADO</span>
                <h3>Esto mostraría la portada</h3>
              </div>
              <span className={styles.counter}>
                {preview.length} / {meta.limit}
              </span>
            </div>

            <p className={styles.previewLead}>
              Se calcula con los juegos publicados. Los cambios de esta pantalla siguen siendo borrador hasta que uses Publicación.
            </p>

            <ol className={styles.previewList}>
              {preview.map((game, index) => {
                const rankingEntry = rankingBySlug.get(game.slug);
                const manuallyPinned =
                  activeMode !== "automatic" &&
                  activeSelection.includes(game.slug);

                return (
                  <li key={game.slug}>
                    <span className={styles.previewPosition}>
                      {index + 1}
                    </span>
                    <GameArtwork game={game} />
                    <div className={styles.previewCopy}>
                      <strong>{game.title}</strong>
                      <span>
                        {manuallyPinned
                          ? activeMode === "hybrid"
                            ? "Fijado manualmente"
                            : "Orden manual"
                          : `Score ${rankingEntry?.score.toFixed(1) ?? "—"}`}
                      </span>
                      {!manuallyPinned &&
                        rankingEntry &&
                        rankingEntry.reasons.length > 0 && (
                          <small>
                            {rankingEntry.reasons.join(" · ")}
                          </small>
                        )}
                    </div>
                    {manuallyPinned ? (
                      <Pin
                        size={17}
                        aria-label="Fijado manualmente"
                      />
                    ) : (
                      <Sparkles
                        size={17}
                        aria-label="Elegido por algoritmo"
                      />
                    )}
                  </li>
                );
              })}
            </ol>

            {preview.length === 0 && (
              <div className={styles.emptyPreview}>
                <Info size={20} aria-hidden="true" />
                <strong>No hay candidatos públicos</strong>
                <span>
                  Revisa la selección manual o publica juegos que cumplan las condiciones de este bloque.
                </span>
              </div>
            )}

            {activeMode !== "manual" && (
              <details className={styles.rankingDetails}>
                <summary>
                  Ver ranking completo del algoritmo
                </summary>
                <div className={styles.rankingTable}>
                  {ranking.slice(0, 12).map((entry, index) => (
                    <div key={entry.game.slug}>
                      <span>#{index + 1}</span>
                      <strong>{entry.game.title}</strong>
                      <b>{entry.score.toFixed(1)}</b>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </aside>
        </div>
      </section>

      <footer className={styles.actions}>
        <div>
          <strong>Guardar sólo actualiza el borrador</strong>
          <span>
            {dirty
              ? "Hay cambios sin guardar. Nada cambia en la web pública hasta revisar y publicar la Portada."
              : "La curaduría coincide con la revisión guardada. Nada cambia en la web pública hasta publicar."}
          </span>
        </div>
        <button type="submit" disabled={!dirty}>
          <Check size={18} aria-hidden="true" />
          {dirty ? "Guardar curaduría" : "Curaduría guardada"}
        </button>
      </footer>
    </form>
  );
}
