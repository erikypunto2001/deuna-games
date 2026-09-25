"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Laptop,
  Monitor,
  Plus,
  Save,
  Search,
  Smartphone,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type React from "react";

import AdminMediaThumbnail from "@/components/admin/AdminMediaThumbnail";
import HomeHeroLivePreview from "@/components/admin/HomeHeroLivePreview";
import type { PublicPageBackgroundProps } from "@/components/site/PublicPageBackground";
import type {
  HomeCurationMode,
  HomeHeroArrowIcon,
  HomeHeroArrowShape,
  HomeHeroDevice,
  HomeHeroNavigationStyle,
  HomeHeroPresentation,
  ResolvedHomeConfig,
} from "@/data/home-config";
import { HOME_HERO_MAX_SLIDES } from "@/lib/home/hero-contract";
import {
  resolveHeroDeviceDesign,
  updateHeroDeviceDesign,
} from "@/lib/home/hero-device-design";
import { homeHeroVisiblePositions } from "@/lib/home/hero-layout";
import {
  applyHeroLayout,
  applyPreset,
  carouselLayouts,
  type PresetName,
} from "@/lib/home/hero-presets";
import { resolveHomeCollectionGames } from "@/lib/home/ranking";
import type { Game } from "@/types/game";

import styles from "./HomeHeroEditor.module.css";

type State = {
  slugs: string[];
  presentation: HomeHeroPresentation;
  mode: HomeCurationMode;
};

const HERO_FRAME_MIN_WIDTH = 260;
const HERO_FRAME_MAX_WIDTH = 1800;
const HERO_FRAME_MIN_HEIGHT = 220;
const HERO_FRAME_MAX_HEIGHT = 1200;

const devices: Array<{
  id: HomeHeroDevice;
  label: string;
  icon: typeof Monitor;
}> = [
  { id: "desktop", label: "Escritorio", icon: Monitor },
  { id: "tablet", label: "Tableta", icon: Laptop },
  { id: "mobile", label: "Móvil", icon: Smartphone },
];

const selectionModes: Array<{
  id: HomeCurationMode;
  title: string;
  description: string;
}> = [
  {
    id: "manual",
    title: "Manual",
    description: "Muestras exactamente los juegos que eliges y en ese orden.",
  },
  {
    id: "hybrid",
    title: "Mixto",
    description: "Tus juegos van primero y el sitio completa espacios libres.",
  },
  {
    id: "automatic",
    title: "Automático",
    description: "El sitio elige hasta cinco juegos según el ranking publicado.",
  },
];

const visualPresets: Array<{
  id: Exclude<PresetName, "Custom">;
  label: string;
}> = [
  { id: "Classic", label: "Clásico" },
  { id: "Cinema", label: "Cine" },
  { id: "Minimal", label: "Minimal" },
  { id: "Spotlight", label: "Foco" },
  { id: "Cards", label: "Tarjetas" },
];

const motionStyles: Array<{
  id: HomeHeroPresentation["motionStyle"];
  title: string;
  description: string;
}> = [
  {
    id: "momentum",
    title: "Momentum",
    description: "Desplazamiento directo, rápido y con peso.",
  },
  {
    id: "morph",
    title: "Morph",
    description: "La tarjeta se expande suavemente al llegar al centro.",
  },
  {
    id: "parallax",
    title: "Parallax Sweep",
    description: "Imagen y marco se mueven a distinta velocidad.",
  },
];

const navigationStyles: Array<{
  id: HomeHeroNavigationStyle;
  label: string;
}> = [
  { id: "segmented-pro", label: "Segmentada Pro" },
  { id: "integrated", label: "Progreso integrado" },
  { id: "pills", label: "Píldoras" },
  { id: "dots", label: "Puntos" },
  { id: "timeline", label: "Timeline" },
  { id: "minimal", label: "Minimal" },
  { id: "glass", label: "Glass" },
  { id: "rail", label: "Rail" },
];

const arrowIcons: Array<{
  id: HomeHeroArrowIcon;
  label: string;
}> = [
  { id: "chevron", label: "Chevron" },
  { id: "arrow", label: "Flecha" },
  { id: "double-chevron", label: "Doble chevron" },
  { id: "long-arrow", label: "Flecha larga" },
  { id: "triangle", label: "Triángulo" },
];

const arrowShapes: Array<{
  id: HomeHeroArrowShape;
  label: string;
}> = [
  { id: "circle", label: "Círculo" },
  { id: "rounded", label: "Cuadrado redondeado" },
  { id: "square", label: "Cuadrado" },
  { id: "none", label: "Sin contenedor" },
];

const clone = <T,>(value: T): T => structuredClone(value);
const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function Artwork({ game, aspect }: { game: Game; aspect: number }) {
  const src = game.heroImage ?? game.coverImage;
  return src ? (
    <AdminMediaThumbnail
      kind="image"
      src={src}
      mode="destination"
      viewport={game.heroImage ? game.imageMedia?.hero : game.imageMedia?.cover}
      frameAspect={aspect}
      sizes="900px"
      label={`Hero de ${game.title}`}
    />
  ) : (
    <span className={styles.noArtwork}>Sin imagen</span>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  change: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = () => {
    const number =
      draft === null || !draft.trim() ? value : Number(draft);
    if (Number.isFinite(number)) {
      change(
        Math.min(
          max,
          Math.max(min, Math.round(number / step) * step)
        )
      );
    }
    setDraft(null);
  };

  return (
    <label className={styles.range}>
      <span>{label}</span>
      <div>
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => change(Number(event.target.value))}
        />
        <b>
          <input
            type="number"
            aria-label={`${label}: valor numérico`}
            min={min}
            max={max}
            step={step}
            value={draft ?? value}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setDraft(null);
            }}
          />
          {unit}
        </b>
      </div>
    </label>
  );
}

function Switch({
  label,
  value,
  change,
}: {
  label: string;
  value: boolean;
  change: (value: boolean) => void;
}) {
  return (
    <label className={styles.switch}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => change(event.target.checked)}
      />
      <i />
    </label>
  );
}

export default function HomeHeroEditor({
  config,
  games,
  publicGames,
  revision,
  rankingReferenceTime,
  background,
}: {
  config: ResolvedHomeConfig;
  games: Game[];
  publicGames: Game[];
  revision: number;
  rankingReferenceTime: number;
  background?: Omit<
    PublicPageBackgroundProps,
    "children" | "previewPathname"
  >;
}) {
  const [editingRevision] = useState(revision);
  const [baseline] = useState<State>(() =>
    clone({
      slugs: config.heroSlugs,
      presentation: config.heroPresentation,
      mode: config.curation.hero.mode,
    })
  );
  const [state, setState] = useState<State>(() => clone(baseline));
  const [device, setDevice] = useState<HomeHeroDevice>("desktop");
  const [panel, setPanel] = useState("size");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(false);
  const [workspace, setWorkspace] = useState<
    "content" | "design" | "motion"
  >("content");
  const [editScope, setEditScope] = useState<"device" | "all">(
    "device"
  );

  const router = useRouter();
  const rankingNow = rankingReferenceTime;
  const dirty = JSON.stringify(state) !== JSON.stringify(baseline);
  const bySlug = useMemo(
    () => new Map(games.map((game) => [game.slug, game])),
    [games]
  );
  const published = useMemo(
    () => new Set(publicGames.map((game) => game.slug)),
    [publicGames]
  );
  const result = useMemo(
    () =>
      resolveHomeCollectionGames(
        publicGames,
        "hero",
        state.mode,
        state.slugs,
        HOME_HERO_MAX_SLIDES,
        rankingNow
      ),
    [publicGames, rankingNow, state.mode, state.slugs]
  );
  const candidates = useMemo(
    () =>
      games
        .filter(
          (game) =>
            !state.slugs.includes(game.slug) &&
            (!query ||
              norm(`${game.title} ${game.category}`).includes(norm(query)))
        )
        .slice(0, 8),
    [games, query, state.slugs]
  );

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);

    const protectLinks = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest?.("a");
      if (
        !link ||
        link.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        link.getAttribute("href")?.startsWith("#")
      ) {
        return;
      }
      if (
        !window.confirm(
          "Tienes cambios sin guardar en el hero. ¿Quieres salir?"
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", protectLinks, true);

    return () => {
      window.removeEventListener("beforeunload", protect);
      document.removeEventListener("click", protectLinks, true);
    };
  }, [dirty]);

  const shown = resolveHeroDeviceDesign(state.presentation, device);
  const responsive = shown.responsive[device];
  const navigationPlacement = shown.navigation.responsive[device];
  const arrowPlacement = shown.navigation.arrowResponsive[device];
  const visiblePositions = homeHeroVisiblePositions(
    responsive,
    shown.direction,
    result.length
  );
  const deviceLabel =
    devices.find((entry) => entry.id === device)?.label ?? device;
  const activeMode =
    selectionModes.find((entry) => entry.id === state.mode) ??
    selectionModes[0];

  const commit = (
    update: (state: State) => State,
    scope: HomeHeroDevice | "all" =
      editScope === "all" ? "all" : device
  ) => {
    setState((current) => {
      const editingPresentation = resolveHeroDeviceDesign(
        current.presentation,
        device
      );
      const next = update({
        ...clone(current),
        presentation: clone(editingPresentation),
      });
      if (
        scope === "all" ||
        JSON.stringify(next.presentation) !==
          JSON.stringify(editingPresentation)
      ) {
        next.presentation = updateHeroDeviceDesign(
          current.presentation,
          scope,
          (presentation) =>
            update({
              ...clone(current),
              presentation,
            }).presentation,
          device
        );
      } else {
        next.presentation = current.presentation;
      }
      return next;
    });
  };

  const applyLayout = (
    layout: (typeof carouselLayouts)[number]["id"]
  ) =>
    commit((current) => {
      current.presentation = applyHeroLayout(
        layout,
        current.presentation
      );
      return current;
    });

  const setPresentation = <Key extends keyof HomeHeroPresentation>(
    key: Key,
    value: HomeHeroPresentation[Key]
  ) =>
    commit((current) => {
      current.presentation[key] = value;
      if (
        key === "autoplay" &&
        value === true &&
        !current.presentation.autoplayMs
      ) {
        current.presentation.autoplayMs = 6500;
      }
      return current;
    });

  const setResponsive = (
    key:
      | "cardWidth"
      | "cardHeight"
      | "gap"
      | "spaceBefore"
      | "spaceAfter",
    value: number
  ) =>
    commit((current) => {
      const settings = current.presentation.responsive[device];
      settings[key] = value;
      if (key === "spaceBefore" || key === "spaceAfter") {
        settings.spacingReference = "visual";
      }
      current.presentation.preset = "custom";
      return current;
    });

  const setCardWidthMode = (value: "fixed" | "fill") =>
    commit((current) => {
      current.presentation.responsive[device].cardWidthMode = value;
      current.presentation.preset = "custom";
      return current;
    });

  const setNavigationStyle = (value: HomeHeroNavigationStyle) =>
    commit((current) => {
      current.presentation.navigation.style = value;
      return current;
    });

  const setNavigationToggle = (
    key: "showIndicators" | "showPause" | "showProgress",
    value: boolean
  ) =>
    commit((current) => {
      current.presentation.navigation[key] = value;
      return current;
    });

  const setNavigationPlacement = (
    key: "x" | "y" | "scale",
    value: number
  ) =>
    commit((current) => {
      current.presentation.navigation.responsive[device][key] = value;
      return current;
    });

  const setNavigationPosition = (x: number, y: number) =>
    commit((current) => {
      const placement = current.presentation.navigation.responsive[device];
      placement.x = x;
      placement.y = y;
      return current;
    });

  const setArrowAppearance = <Key extends "arrowIcon" | "arrowShape">(
    key: Key,
    value: HomeHeroPresentation["navigation"][Key]
  ) =>
    commit((current) => {
      current.presentation.navigation[key] = value;
      return current;
    });

  const setArrowPlacement = (
    key: "inset" | "y" | "scale",
    value: number
  ) =>
    commit((current) => {
      current.presentation.navigation.arrowResponsive[device][key] = value;
      return current;
    });

  const payload = JSON.stringify({
    mode: state.mode,
    slugs: state.slugs,
    presentation: state.presentation,
    copy: config.copy.hero,
  });

  const accordion = (
    id: string,
    title: string,
    index: string,
    content: React.ReactNode
  ) => (
    <div className={styles.accordion} data-section={id}>
      <button
        type="button"
        data-open={panel === id}
        aria-expanded={panel === id}
        onClick={() => setPanel(panel === id ? "" : id)}
      >
        <span>
          <b>{index}</b>
          {title}
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {panel === id && <section>{content}</section>}
    </div>
  );

  return (
    <div
      className={styles.app}
      data-preview={preview}
      data-workspace={workspace}
    >
      <header
        className={styles.topbar}

      >
        <div className={styles.title}>
          <i>H</i>
          <div>
            <h2>Editor de Hero</h2>
            <span data-dirty={dirty}>
              {dirty
                ? "Cambios sin guardar"
                : `Borrador guardado · revisión ${editingRevision}`}
            </span>
          </div>
        </div>



        <div className={styles.actions}>
          <button
            type="button"
            data-active={preview}
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            <Eye size={16} />
            {preview ? "Volver a editar" : "Probar funcionamiento"}
          </button>
          <form method="post" action="/api/admin/content/home/hero">
            <input
              type="hidden"
              name="expectedRevision"
              value={editingRevision}
            />
            <input type="hidden" name="heroJson" value={payload} />
            <button className={styles.save} disabled={!dirty}>
              <Save size={16} /> Guardar borrador
            </button>
          </form>
          <Link
            className={styles.publish}
            href="/admin/portada?seccion=publicacion"
          >
            Revisar y publicar Inicio
          </Link>
        </div>
      </header>

      {revision !== editingRevision && (
        <p className={styles.workspaceNote} role="alert">
          Inicio tiene una revisión más reciente. Tus cambios siguen aquí;
          el servidor impedirá sobrescribir esa revisión. Recarga para revisar
          el nuevo borrador.
        </p>
      )}

      <nav
        className={styles.workspaceTabs}
        aria-label="Tareas del editor"

      >
        {(
          [
            ["content", "1. Juegos"],
            ["design", "2. Diseño"],
            ["motion", "3. Movimiento"],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={workspace === id}
            onClick={() => {
              setWorkspace(id);
              setPanel(id === "motion" ? "behavior" : "size");
              setPreview(false);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <p className={styles.workspaceNote}>
        El editor muestra sólo decisiones editoriales. Los detalles técnicos del
        motor se resuelven con el layout, el estilo y el movimiento elegidos.
      </p>

      <div
        className={styles.grid}

      >
        <div className={styles.main}>
          <section
            className={styles.previewWorkspace}
            aria-label="Vista previa del hero"
          >
            <div className={styles.canvasBar}>
              <div>
                {devices.map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    data-active={device === id}
                    aria-pressed={device === id}
                    onClick={() => setDevice(id)}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>
              <label className={styles.editScope}>
                Editar
                <select
                  aria-label="Alcance de los cambios del hero"
                  value={editScope}
                  onChange={(event) =>
                    setEditScope(
                      event.target.value as "device" | "all"
                    )
                  }
                >
                  <option value="device">
                    Solo {deviceLabel.toLowerCase()}
                  </option>
                  <option value="all">Todos los dispositivos</option>
                </select>
              </label>
              <span>
                {responsive.cardWidthMode === "fill"
                  ? "Hasta las flechas"
                  : `${responsive.cardWidth}px`}{" "}
                × {responsive.cardHeight}px ·{" "}
                {visiblePositions.length} posiciones visibles
              </span>
            </div>

            <HomeHeroLivePreview
              games={result}
              presentation={state.presentation}
              device={device}
              playing={preview}
              background={background}
              showSpacingGuide={
                workspace === "design" &&
                panel === "size" &&
                !preview
              }
              onNavigationPositionChange={(x, y) => {
                if (!preview) {
                  setWorkspace("design");
                  setPanel("navigation");
                  setNavigationPosition(x, y);
                }
              }}
              onSelectPosition={() => {
                if (!preview) {
                  setWorkspace("design");
                  setPanel("size");
                }
              }}
            />
          </section>

          <section
            className={`${styles.block} ${styles.contentBlock}`}
          >
            <Heading
              over="CONTENIDO"
              title="Juegos del Hero"
              note={`Máximo ${HOME_HERO_MAX_SLIDES} juegos`}
            />

            <label className={styles.select}>
              <span>Selección de juegos</span>
              <select
                aria-label="Modo de selección del Hero"
                value={state.mode}
                onChange={(event) =>
                  commit((current) => {
                    current.mode = event.target.value as HomeCurationMode;
                    return current;
                  })
                }
              >
                {selectionModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.title}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.help}>{activeMode.description}</p>

            <h3>Juegos que aparecerán · {result.length}</h3>
            <div className={styles.resultList}>
              {result.map((game, index) => (
                <article key={game.slug}>
                  <div className={styles.gameThumbnail}>
                    <Artwork game={game} aspect={3 / 2} />
                  </div>
                  <div>
                    <strong>
                      {index + 1}. {game.title}
                    </strong>
                    <small>
                      {state.mode === "automatic" ||
                      !state.slugs.includes(game.slug)
                        ? "Elegido automáticamente"
                        : "Elegido por ti"}
                      {" · "}
                      {game.heroImage
                        ? "Imagen hero"
                        : game.coverImage
                          ? "Usa la portada"
                          : "Sin imagen"}
                    </small>

                    {state.mode !== "automatic" &&
                      state.slugs.includes(game.slug) && (
                        <span className={styles.rowActions}>
                          <button
                            type="button"
                            aria-label={`Subir ${game.title}`}
                            disabled={state.slugs.indexOf(game.slug) === 0}
                            onClick={() =>
                              commit((current) => {
                                const currentIndex =
                                  current.slugs.indexOf(game.slug);
                                [
                                  current.slugs[currentIndex - 1],
                                  current.slugs[currentIndex],
                                ] = [
                                  current.slugs[currentIndex],
                                  current.slugs[currentIndex - 1],
                                ];
                                return current;
                              })
                            }
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Bajar ${game.title}`}
                            disabled={
                              state.slugs.indexOf(game.slug) ===
                              state.slugs.length - 1
                            }
                            onClick={() =>
                              commit((current) => {
                                const currentIndex =
                                  current.slugs.indexOf(game.slug);
                                [
                                  current.slugs[currentIndex + 1],
                                  current.slugs[currentIndex],
                                ] = [
                                  current.slugs[currentIndex],
                                  current.slugs[currentIndex + 1],
                                ];
                                return current;
                              })
                            }
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className={styles.removeSelection}
                            aria-label={`${state.mode === "hybrid" ? "Dejar de fijar" : "Quitar"} ${game.title}`}
                            onClick={() =>
                              commit((current) => {
                                current.slugs = current.slugs.filter(
                                  (slug) => slug !== game.slug
                                );
                                return current;
                              })
                            }
                          >
                            <Trash2 size={14} />
                            {state.mode === "hybrid"
                              ? "Desfijar"
                              : "Quitar"}
                          </button>
                        </span>
                      )}

                    <div className={styles.imageActions}>
                      <a
                        href={`/admin/juegos/${encodeURIComponent(game.slug)}?seccion=multimedia#hero-media`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Editar imagen y encuadre ↗
                      </a>
                    </div>
                  </div>
                </article>
              ))}
              {!result.length && (
                <p className={styles.empty}>
                  No hay juegos públicos para esta selección.
                </p>
              )}
            </div>

            <button type="button" onClick={() => router.refresh()}>
              Actualizar catálogo e imágenes
            </button>

            {state.mode === "automatic" && (
              <p className={styles.help}>
                El modo automático conserva tu selección manual, pero el ranking
                decide qué juegos se muestran.
              </p>
            )}

            {state.mode !== "automatic" && (
              <div className={styles.library}>
                {state.slugs.some((slug) => !published.has(slug)) && (
                  <div className={styles.selectedList}>
                    <h3>Seleccionados todavía sin publicar</h3>
                    {state.slugs.map((slug, index) => {
                      if (published.has(slug)) return null;
                      const game = bySlug.get(slug);
                      if (!game) {
                        return (
                          <article key={slug}>
                            <strong>Juego no disponible: {slug}</strong>
                            <button
                              type="button"
                              onClick={() =>
                                commit((current) => {
                                  current.slugs = current.slugs.filter(
                                    (item) => item !== slug
                                  );
                                  return current;
                                })
                              }
                            >
                              Quitar
                            </button>
                          </article>
                        );
                      }
                      return (
                        <article key={slug}>
                          <b>{index + 1}</b>
                          <div>
                            <strong>{game.title}</strong>
                            <small>
                              Sin publicar: no aparecerá en Inicio
                            </small>
                          </div>
                          <span className={styles.rowActions}>
                            <button
                              type="button"
                              title="Subir"
                              disabled={index === 0}
                              onClick={() =>
                                commit((current) => {
                                  [
                                    current.slugs[index - 1],
                                    current.slugs[index],
                                  ] = [
                                    current.slugs[index],
                                    current.slugs[index - 1],
                                  ];
                                  return current;
                                })
                              }
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              title="Bajar"
                              disabled={index === state.slugs.length - 1}
                              onClick={() =>
                                commit((current) => {
                                  [
                                    current.slugs[index + 1],
                                    current.slugs[index],
                                  ] = [
                                    current.slugs[index],
                                    current.slugs[index + 1],
                                  ];
                                  return current;
                                })
                              }
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              title="Quitar"
                              onClick={() =>
                                commit((current) => {
                                  current.slugs.splice(index, 1);
                                  return current;
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                        </article>
                      );
                    })}
                  </div>
                )}

                <aside>
                  <h3>Añadir juegos</h3>
                  {state.slugs.length >= HOME_HERO_MAX_SLIDES && (
                    <p className={styles.help}>
                      Llegaste al máximo de cinco juegos. Quita uno para añadir
                      otro.
                    </p>
                  )}
                  <label>
                    <Search size={15} />
                    <input
                      type="search"
                      aria-label="Buscar juegos para el hero"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Buscar juego…"
                    />
                  </label>
                  {!candidates.length && (
                    <p className={styles.empty}>
                      No hay juegos disponibles para esta búsqueda.
                    </p>
                  )}
                  {candidates.map((game) => (
                    <button
                      type="button"
                      key={game.slug}
                      disabled={
                        state.slugs.length >= HOME_HERO_MAX_SLIDES
                      }
                      onClick={() =>
                        commit((current) => {
                          current.slugs.push(game.slug);
                          return current;
                        })
                      }
                    >
                      <span>
                        {game.title}
                        <small>
                          {published.has(game.slug)
                            ? game.category
                            : "Sin publicar"}
                        </small>
                      </span>
                      <Plus size={15} />
                    </button>
                  ))}
                </aside>
              </div>
            )}
          </section>

          <section
            className={`${styles.block} ${styles.designBlock}`}
          >
            <Heading
              over="DISEÑO"
              title="Elige la composición"
              note={
                editScope === "all"
                  ? "Se aplica a todos los dispositivos"
                  : `Se aplica solo a ${deviceLabel.toLowerCase()}`
              }
            />
            <div className={styles.layoutChoices}>
              {carouselLayouts.map((layout) => (
                <button
                  type="button"
                  key={layout.id}
                  onClick={() => applyLayout(layout.id)}
                >
                  <span
                    className={styles.layoutSketch}
                    data-layout={layout.id}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>{layout.title}</strong>
                  <small>{layout.description}</small>
                </button>
              ))}
            </div>

            <details className={styles.styleDetails}>
              <summary>Estilo visual</summary>
              <div className={styles.presets}>
                {visualPresets.map((preset, index) => (
                  <button
                    type="button"
                    key={preset.id}
                    data-active={
                      shown.preset === preset.id.toLowerCase()
                    }
                    onClick={() =>
                      commit((current) => {
                        current.presentation = applyPreset(
                          preset.id,
                          current.presentation
                        );
                        return current;
                      })
                    }
                  >
                    <span data-kind={index}>
                      <i />
                      <i />
                      <i />
                    </span>
                    <b>{preset.label}</b>
                  </button>
                ))}
              </div>
            </details>
          </section>

          <section
            className={`${styles.block} ${styles.motionBlock}`}
          >
            <Heading
              over="MOVIMIENTO"
              title="Elige cómo cambia de juego"
              note="Un solo motor físico"
            />
            <div
              className={styles.transitions}
              role="group"
              aria-label="Estilo de movimiento del Hero"
            >
              {motionStyles.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  data-active={shown.motionStyle === entry.id}
                  aria-pressed={shown.motionStyle === entry.id}
                  onClick={() =>
                    setPresentation("motionStyle", entry.id)
                  }
                >
                  <span data-motion={entry.id}>
                    <i />
                    <i />
                  </span>
                  <b>{entry.title}</b>
                  <small>{entry.description}</small>
                </button>
              ))}
            </div>
            <div className={styles.timeline}>
              <span>
                {shown.motionStyle === "momentum"
                  ? "Momentum · directo"
                  : shown.motionStyle === "morph"
                    ? "Morph · expansión"
                    : "Parallax Sweep · cinematográfico"}
              </span>
              <button type="button" onClick={() => setPreview(true)}>
                Probar movimiento
              </button>
            </div>
            <p className={styles.help}>
              Arrastre, táctil, teclado y repetición forman parte del
              comportamiento estable del carrusel y no necesitan microajustes.
            </p>
          </section>

          <section className={styles.infoNotice}>
            <strong>Una regla simple: contenido aquí, detalle en el juego.</strong>
            <span>
              El Hero decide qué juegos aparecen y cómo se presentan. Textos,
              imágenes y encuadre se editan en la ficha de cada juego.
            </span>
          </section>
        </div>

        <aside className={styles.inspector}>
          <header>
            <div>
              <span>
                {workspace === "motion" ? "MOVIMIENTO" : "DISEÑO"}
              </span>
              <strong>
                {workspace === "motion"
                  ? "Avance automático"
                  : "Ajustes esenciales"}
              </strong>
            </div>
          </header>
          <div>
            {accordion(
              "size",
              "Tamaño y espacio",
              "01",
              <>
                <p className={styles.help}>
                  Ajusta sólo la geometría esencial de {deviceLabel.toLowerCase()}.
                  El ancho manual usa píxeles reales del sitio; la vista previa
                  puede verse reducida para entrar en el panel.
                </p>
                <Switch
                  label="Extender hasta las flechas"
                  value={responsive.cardWidthMode === "fill"}
                  change={(value) =>
                    setCardWidthMode(value ? "fill" : "fixed")
                  }
                />
                {responsive.cardWidthMode === "fixed" ? (
                  <Range
                    label="Ancho manual"
                    value={responsive.cardWidth}
                    min={HERO_FRAME_MIN_WIDTH}
                    max={HERO_FRAME_MAX_WIDTH}
                    unit="px"
                    change={(value) => setResponsive("cardWidth", value)}
                  />
                ) : (
                  <p className={styles.help}>
                    La tarjeta usa automáticamente el espacio real entre las
                    flechas. Todas las diapositivas comparten este ancho cuando
                    pasan por la posición principal; el ancho manual se conserva
                    para volver atrás.
                  </p>
                )}
                <Range
                  label="Alto"
                  value={responsive.cardHeight}
                  min={HERO_FRAME_MIN_HEIGHT}
                  max={HERO_FRAME_MAX_HEIGHT}
                  unit="px"
                  change={(value) => setResponsive("cardHeight", value)}
                />
                <Range
                  label="Separación entre tarjetas"
                  value={responsive.gap}
                  min={0}
                  max={100}
                  unit="px"
                  change={(value) => setResponsive("gap", value)}
                />
                <Range
                  label="Espacio superior"
                  value={responsive.spaceBefore}
                  min={0}
                  max={160}
                  unit="px"
                  change={(value) => setResponsive("spaceBefore", value)}
                />
                <Range
                  label="Espacio inferior"
                  value={responsive.spaceAfter}
                  min={0}
                  max={200}
                  unit="px"
                  change={(value) => setResponsive("spaceAfter", value)}
                />
              </>
            )}

            {accordion(
              "navigation",
              "Controles del carrusel",
              "02",
              <>
                <label className={styles.select}>
                  <span>Estilo de controles</span>
                  <select
                    value={shown.navigation.style}
                    onChange={(event) =>
                      setNavigationStyle(
                        event.target.value as HomeHeroNavigationStyle
                      )
                    }
                  >
                    {navigationStyles.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Switch
                  label="Mostrar indicadores"
                  value={shown.navigation.showIndicators}
                  change={(value) =>
                    setNavigationToggle("showIndicators", value)
                  }
                />
                <Switch
                  label="Mostrar progreso"
                  value={shown.navigation.showProgress}
                  change={(value) =>
                    setNavigationToggle("showProgress", value)
                  }
                />
                <Switch
                  label="Mostrar pausa"
                  value={shown.navigation.showPause}
                  change={(value) =>
                    setNavigationToggle("showPause", value)
                  }
                />
                <label className={styles.select}>
                  <span>Icono de flecha</span>
                  <select
                    value={shown.navigation.arrowIcon}
                    onChange={(event) =>
                      setArrowAppearance(
                        "arrowIcon",
                        event.target.value as HomeHeroArrowIcon
                      )
                    }
                  >
                    {arrowIcons.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.select}>
                  <span>Contenedor de flecha</span>
                  <select
                    value={shown.navigation.arrowShape}
                    onChange={(event) =>
                      setArrowAppearance(
                        "arrowShape",
                        event.target.value as HomeHeroArrowShape
                      )
                    }
                  >
                    {arrowShapes.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Range
                  label="Altura de las flechas"
                  value={arrowPlacement.y}
                  min={0}
                  max={100}
                  unit="%"
                  change={(value) => setArrowPlacement("y", value)}
                />
                <Range
                  label="Distancia al borde"
                  value={arrowPlacement.inset}
                  min={-40}
                  max={160}
                  unit="px"
                  change={(value) => setArrowPlacement("inset", value)}
                />
                <Range
                  label="Tamaño de las flechas"
                  value={arrowPlacement.scale}
                  min={70}
                  max={160}
                  unit="%"
                  change={(value) => setArrowPlacement("scale", value)}
                />
                <Range
                  label="Posición horizontal"
                  value={navigationPlacement.x}
                  min={0}
                  max={100}
                  unit="%"
                  change={(value) => setNavigationPlacement("x", value)}
                />
                <Range
                  label="Posición vertical"
                  value={navigationPlacement.y}
                  min={0}
                  max={100}
                  unit="%"
                  change={(value) => setNavigationPlacement("y", value)}
                />
                <Range
                  label="Escala de controles"
                  value={navigationPlacement.scale}
                  min={50}
                  max={180}
                  unit="%"
                  change={(value) => setNavigationPlacement("scale", value)}
                />
                <p className={styles.help}>
                  Puedes mover el bloque completo de indicadores, progreso y
                  pausa arrastrando el asa que aparece sobre él en la vista
                  previa. Las flechas y el bloque guardan su posición y tamaño
                  por dispositivo.
                </p>
              </>
            )}

            {accordion(
              "behavior",
              "Avance automático",
              "01",
              <>
                <Switch
                  label="Avance automático"
                  value={shown.autoplay}
                  change={(value) =>
                    setPresentation("autoplay", value)
                  }
                />
                <label className={styles.select}>
                  <span>Tiempo por juego</span>
                  <select
                    disabled={!shown.autoplay}
                    value={shown.autoplayMs || 6500}
                    onChange={(event) =>
                      setPresentation(
                        "autoplayMs",
                        Number(event.target.value) as HomeHeroPresentation["autoplayMs"]
                      )
                    }
                  >
                    <option value="4000">4 segundos</option>
                    <option value="6500">6,5 segundos</option>
                    <option value="8000">8 segundos</option>
                  </select>
                </label>
                <p className={styles.help}>
                  Dirección, loop, hover, ratón, táctil y teclado se mantienen
                  como comportamiento del sistema. El editor sólo decide si hay
                  autoplay y su ritmo.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Heading({
  over,
  title,
  note,
}: {
  over: string;
  title: string;
  note?: string;
}) {
  return (
    <header className={styles.heading}>
      <div>
        <span>{over}</span>
        <strong>{title}</strong>
      </div>
      {note && <small>{note}</small>}
    </header>
  );
}