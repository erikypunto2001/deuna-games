"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Gamepad2,
  Info,
  Play,
  Star,
  Tag,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import HeroNavigation, { type HeroNavigationEditor } from "@/components/home/HeroNavigation";
import FramedVideo from "@/components/ui/FramedVideo";
import GameMedia from "@/components/ui/GameMedia";
import type {
  HomeHeroArrowIcon,
  HomeHeroDevice,
  HomeHeroPresentation,
} from "@/data/home-config";
import { formatGameReleaseDate } from "@/lib/games/game-date";
import { resolveHeroDeviceDesign } from "@/lib/home/hero-device-design";
import { homeHeroDeviceForWidth } from "@/lib/home/hero-devices";
import {
  HOME_HERO_AUTOPLAY_MS,
  formatHomeHeroPosition,
} from "@/lib/home/hero-contract";
import {
  HOME_HERO_VISUAL_POSITIONS,
  homeHeroPositionDisplay,
  homeHeroAnchor,
  homeHeroCardWidthCSS,
  homeHeroPositionOffset,
  homeHeroPositionTransform,
  homeHeroSlotCSS,
  homeHeroVisiblePositions,
  fitHomeHeroBounds,
  type HomeHeroVisualPosition,
} from "@/lib/home/hero-layout";
import {
  resolveGameDestinationMediaMode,
  resolveGameHeroVideo,
} from "@/lib/media/game-video-media";
import {
  resolveHeroImageTuning,
  type HeroImageTuning,
} from "@/lib/site/hero-image";
import type { Game } from "@/types/game";

import artworkStyles from "./HeroArtwork.module.css";
import motionStyles from "./HeroMotion.module.css";
import styles from "./HeroSection.module.css";

const FINE_HOVER_MEDIA = "(hover: hover) and (pointer: fine)";
const HERO_PRIMARY_ACTION = "Ver juego";
const HERO_SECONDARY_ACTION = "Más información";
const HERO_EDGE_WRAP_RESET_MS = 220;
const HERO_CARD_ARROW_GAP = 8;
const HERO_FILL_MIN_CARD_WIDTH = 260;
const HERO_FILL_MAX_CARD_WIDTH = 1800;
const HERO_FILL_SEARCH_STEPS = 12;

type HeroFact = {
  kind: "rating" | "developer" | "release" | "platforms" | "version";
  label: string;
};

type ResponsiveArtworkProps = {
  game: Game;
  alt: string;
  active?: boolean;
  style?: CSSProperties;
};

const PARALLAX_ARTWORK_TRANSFORM: Record<HomeHeroVisualPosition, string> = {
  left2: "translate3d(9%, 0, 0) scale(1.085)",
  left1: "translate3d(4.5%, 0, 0) scale(1.06)",
  main: "translate3d(0, 0, 0) scale(1.035)",
  right1: "translate3d(-4.5%, 0, 0) scale(1.06)",
  right2: "translate3d(-9%, 0, 0) scale(1.085)",
};

function heroMotionRenderPositions(
  _visiblePositions: readonly HomeHeroVisualPosition[],
  direction: number
) {
  const positions = [...HOME_HERO_VISUAL_POSITIONS];
  return direction < 0 ? positions.reverse() : positions;
}

function canUseFineHover() {
  return typeof window !== "undefined" && window.matchMedia(FINE_HOVER_MEDIA).matches;
}

function imageViewportForHero(game: Game) {
  const viewport = game.heroImage ? game.imageMedia?.hero : game.imageMedia?.cover;
  return viewport ? { ...viewport, aspect: undefined } : undefined;
}

function classificationLine(game: Game) {
  const values = [game.category, ...(game.genres ?? [])];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase("es");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value.toLocaleUpperCase("es"));
    if (unique.length === 3) break;
  }
  return unique;
}

function heroTitleParts(game: Game) {
  const base = (game.shortTitle ?? game.title).trim();
  const highlight = game.highlightedTitle?.trim() ?? "";
  const comparableBase = base.toLocaleLowerCase("es");
  const comparableHighlight = highlight.toLocaleLowerCase("es");
  const highlightAlreadyIncluded = Boolean(
    comparableHighlight &&
      (comparableBase === comparableHighlight || comparableBase.endsWith(` ${comparableHighlight}`))
  );
  return { base, highlight: highlightAlreadyIncluded ? "" : highlight };
}

function heroFacts(game: Game): HeroFact[] {
  const facts: HeroFact[] = [];
  if (typeof game.rating === "number") {
    const reviews = game.reviews?.trim();
    facts.push({ kind: "rating", label: `${game.rating.toFixed(1)}${reviews ? ` · ${reviews} reseñas` : ""}` });
  }
  if (game.developer?.trim()) facts.push({ kind: "developer", label: game.developer.trim() });
  const release = formatGameReleaseDate(game.releaseDate);
  if (release) facts.push({ kind: "release", label: release });
  if (game.platforms?.length) facts.push({ kind: "platforms", label: game.platforms.join(" · ") });
  if (facts.length < 4 && game.version?.trim()) facts.push({ kind: "version", label: `Versión ${game.version.trim()}` });
  return facts.slice(0, 4);
}

function FactIcon({ kind }: { kind: HeroFact["kind"] }) {
  if (kind === "rating") return <Star size={17} fill="currentColor" aria-hidden="true" />;
  if (kind === "developer") return <Building2 size={17} aria-hidden="true" />;
  if (kind === "release") return <CalendarDays size={17} aria-hidden="true" />;
  if (kind === "platforms") return <Gamepad2 size={17} aria-hidden="true" />;
  return <Tag size={17} aria-hidden="true" />;
}

function HeroArrowGlyph({
  icon,
  direction,
}: {
  icon: HomeHeroArrowIcon;
  direction: "left" | "right";
}) {
  const left = direction === "left";
  if (icon === "arrow") {
    const Icon = left ? ArrowLeft : ArrowRight;
    return <Icon size={27} aria-hidden="true" />;
  }
  if (icon === "double-chevron") {
    const Icon = left ? ChevronsLeft : ChevronsRight;
    return <Icon size={27} aria-hidden="true" />;
  }
  if (icon === "long-arrow") {
    return (
      <svg viewBox="0 0 30 24" width="30" height="24" aria-hidden="true">
        <path
          d={left ? "M27 12H5m0 0 7-7M5 12l7 7" : "M3 12h22m0 0-7-7m7 7-7 7"}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }
  if (icon === "triangle") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d={left ? "M16 4 6 12l10 8z" : "m8 4 10 8-10 8z"} fill="currentColor" />
      </svg>
    );
  }
  const Icon = left ? ChevronLeft : ChevronRight;
  return <Icon size={29} aria-hidden="true" />;
}

function ResponsiveArtwork({ game, alt, active = false, style }: ResponsiveArtworkProps) {
  const src = game.heroImage ?? game.coverImage;
  if (!src) return null;
  return (
    <span className={`${styles.heroPicture} ${artworkStyles.artworkFrame}`} style={style}>
      <GameMedia src={src} alt={alt} sizes="(max-width: 680px) 92vw, (max-width: 1100px) 88vw, 78vw" priority={active} variant="hero" viewport={imageViewportForHero(game)} imageClassName={styles.heroArtwork} />
    </span>
  );
}

function HeroVideoLayer({ game, enabled }: { game: Game; enabled: boolean }) {
  const resolved = resolveGameHeroVideo(game);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [documentVisible, setDocumentVisible] = useState(true);
  useEffect(() => {
    const syncVisibility = () => setDocumentVisible(!document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);
  if (!enabled || !resolved || failedSrc === resolved.src || !documentVisible) return null;
  return <FramedVideo key={resolved.src} src={resolved.src} viewport={resolved.viewport} autoPlay loop controls={false} preload="metadata" tabIndex={-1} frameStyle={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "transparent" }} onError={() => setFailedSrc(resolved.src)} />;
}

function MainCardContent({ game, motionEnabled }: { game: Game; motionEnabled: boolean }) {
  const classifications = classificationLine(game);
  const facts = heroFacts(game);
  const title = heroTitleParts(game);
  return (
    <div className={`${styles.content} ${motionEnabled ? motionStyles.contentReveal : ""}`}>
      {classifications.length > 0 && <div className={styles.classificationLine} aria-label="Clasificación del juego">{classifications.map((item) => <span key={item}>{item}</span>)}</div>}
      <h3 className={styles.title}><span>{title.base}</span>{title.highlight && <strong>{title.highlight}</strong>}</h3>
      <p className={styles.description}>{game.description}</p>
      {facts.length > 0 && <div className={styles.facts} aria-label="Información principal del juego">{facts.map((fact) => <span className={styles.fact} key={`${fact.kind}-${fact.label}`}><FactIcon kind={fact.kind} /><span>{fact.label}</span></span>)}</div>}
      <div className={styles.actions}>
        <Link href={`/juegos/${game.slug}`} className={styles.primaryButton}><Play size={17} fill="currentColor" aria-hidden="true" />{HERO_PRIMARY_ACTION}</Link>
        <Link href={`/juegos/${game.slug}`} className={styles.secondaryButton}><Info size={18} aria-hidden="true" />{HERO_SECONDARY_ACTION}</Link>
      </div>
    </div>
  );
}

function deviceVariables(presentation: HomeHeroPresentation, totalGames: number) {
  const variables: Record<string, string | number> = {
    "--hero-editor-radius": `${presentation.radius}px`,
    "--hero-editor-shadow": presentation.shadow / 100,
    "--hero-editor-glow": presentation.glow / 100,
    "--hero-editor-overlay": presentation.overlay / 100,
    "--hero-editor-border": `${presentation.borderWidth}px`,
    "--hero-autoplay-ms": `${presentation.autoplayMs || HOME_HERO_AUTOPLAY_MS}ms`,
  };
  for (const device of ["desktop", "tablet", "mobile"] as const) {
    const responsive = presentation.responsive[device];
    const navigation = presentation.navigation.responsive[device];
    const arrows = presentation.navigation.arrowResponsive[device];
    variables[`--hero-${device}-anchor`] = homeHeroAnchor(responsive);
    variables[`--hero-${device}-card-width`] = homeHeroCardWidthCSS(
      responsive,
      arrows,
      device,
      totalGames > 1
    );
    variables[`--hero-${device}-card-height`] = `${responsive.cardHeight}px`;
    variables[`--hero-${device}-gap`] = `${responsive.gap}px`;
    variables[`--hero-${device}-perspective`] = `${responsive.perspective}px`;
    variables[`--hero-${device}-space-before`] = `${responsive.spaceBefore}px`;
    variables[`--hero-${device}-space-after`] = `${responsive.spaceAfter}px`;
    variables[`--hero-${device}-navigation-x`] = `${navigation.x}%`;
    variables[`--hero-${device}-navigation-y`] = `${navigation.y}%`;
    variables[`--hero-${device}-navigation-scale`] = navigation.scale;
    variables[`--hero-${device}-arrow-inset`] = `${arrows.inset}px`;
    variables[`--hero-${device}-arrow-y`] = `${arrows.y}%`;
    variables[`--hero-${device}-arrow-scale`] = arrows.scale / 100;
    variables[`--hero-${device}-arrow-hover-scale`] = (arrows.scale * 1.06) / 100;
    for (const position of HOME_HERO_VISUAL_POSITIONS) {
      variables[`--hero-${device}-display-${position}`] = homeHeroPositionDisplay(position, responsive, presentation.direction, totalGames);
      variables[`--hero-${device}-slot-${position}`] = homeHeroSlotCSS(position);
    }
  }
  return variables as CSSProperties;
}

function horizontalBounds(elements: HTMLElement[]) {
  const bounds = elements.map((element) => element.getBoundingClientRect());
  return {
    left: Math.min(...bounds.map((box) => box.left)),
    right: Math.max(...bounds.map((box) => box.right)),
    width: Math.max(...bounds.map((box) => box.right)) - Math.min(...bounds.map((box) => box.left)),
  };
}

export default function HeroSection({ games, presentation: sourcePresentation, imageEffect = false, imageTuning, autoplaySuspended = false, onSelectPosition, navigationEditor }: {
  games: Game[];
  presentation: HomeHeroPresentation;
  imageEffect?: boolean;
  imageTuning?: Partial<HeroImageTuning>;
  autoplaySuspended?: boolean;
  onSelectPosition?: (position: HomeHeroVisualPosition) => void;
  navigationEditor?: HeroNavigationEditor;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [designDevice, setDesignDevice] = useState<HomeHeroDevice>("desktop");
  const [motionReady, setMotionReady] = useState(false);
  useLayoutEffect(() => {
    const view = rootRef.current?.ownerDocument.defaultView;
    if (!view) return;
    const update = () => setDesignDevice(homeHeroDeviceForWidth(view.innerWidth));
    update();
    let secondFrame: number | null = null;
    const firstFrame = view.requestAnimationFrame(() => {
      secondFrame = view.requestAnimationFrame(() => setMotionReady(true));
    });
    view.addEventListener("resize", update);
    return () => {
      view.removeEventListener("resize", update);
      view.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) view.cancelAnimationFrame(secondFrame);
    };
  }, []);
  const presentation = useMemo(() => resolveHeroDeviceDesign(sourcePresentation, designDevice), [sourcePresentation, designDevice]);
  const fitRef = useRef<HTMLDivElement>(null);
  const dragSettleFrame = useRef<number | null>(null);
  const edgeWrapResetTimer = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const pointerStart = useRef<{ x: number; y: number; id: number; lastX: number; lastTime: number; velocityX: number } | null>(null);
  const suppressClick = useRef(false);
  const lastWheel = useRef(0);
  const autoplayClock = useRef({ key: "", remaining: 0 });
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [manualPaused, setManualPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hoverPreviewActive, setHoverPreviewActive] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [motionDelta, setMotionDelta] = useState(0);
  const resolvedTuning = useMemo(() => resolveHeroImageTuning(imageTuning), [imageTuning]);
  const artworkStyle = useMemo<CSSProperties>(() => ({ filter: `brightness(${resolvedTuning.brightness}%) saturate(${resolvedTuning.saturation}%) contrast(${resolvedTuning.contrast}%)` }), [resolvedTuning]);
  const tuningOverlayOpacity = resolvedTuning.overlayStrength / 100;
  const normalizedActiveIndex = games.length ? ((activeIndex % games.length) + games.length) % games.length : 0;
  const activeGame = games[normalizedActiveIndex] ?? games[0];
  const isPaused = (hovered && presentation.pauseOnHover) || focused || manualPaused || reducedMotion || dragging || !documentVisible || autoplaySuspended;
  const autoplayDelay = !presentation.autoplay || presentation.autoplayMs === 0 ? null : presentation.autoplayMs || HOME_HERO_AUTOPLAY_MS;
  const direction = presentation.direction === "reverse" ? -1 : 1;
  const rootStyle = useMemo(() => ({ ...deviceVariables(presentation, games.length), "--hero-drag-offset": `${dragOffset}px` }) as CSSProperties, [dragOffset, games.length, presentation]);

  const registerMotionDelta = useCallback((delta: number) => {
    const view = rootRef.current?.ownerDocument.defaultView;
    if (edgeWrapResetTimer.current !== null && view) {
      view.clearTimeout(edgeWrapResetTimer.current);
      edgeWrapResetTimer.current = null;
    }
    if (!delta || reducedMotion || !view) {
      setMotionDelta(0);
      return;
    }
    setMotionDelta(delta);
    edgeWrapResetTimer.current = view.setTimeout(() => {
      edgeWrapResetTimer.current = null;
      setMotionDelta(0);
    }, HERO_EDGE_WRAP_RESET_MS);
  }, [reducedMotion]);

  useEffect(() => {
    const view = rootRef.current?.ownerDocument.defaultView;
    return () => {
      if (edgeWrapResetTimer.current !== null && view) {
        view.clearTimeout(edgeWrapResetTimer.current);
      }
    };
  }, []);

  const moveBy = useCallback((delta: number) => {
    if (!games.length || !delta) return;
    const normalized = ((activeIndexRef.current % games.length) + games.length) % games.length;
    const requested = normalized + delta;
    const target = presentation.loop
      ? (requested + games.length) % games.length
      : Math.max(0, Math.min(games.length - 1, requested));
    if (target === normalized) {
      registerMotionDelta(0);
      return;
    }
    activeIndexRef.current = target;
    registerMotionDelta(delta);
    setActiveIndex(target);
  }, [games.length, presentation.loop, registerMotionDelta]);

  const selectSlide = useCallback((targetIndex: number) => {
    if (!games.length) return;
    const normalized = ((activeIndexRef.current % games.length) + games.length) % games.length;
    const target = ((targetIndex % games.length) + games.length) % games.length;
    if (target === normalized) {
      registerMotionDelta(0);
      return;
    }
    let delta = target - normalized;
    if (presentation.loop && Math.abs(delta) > games.length / 2) delta += delta > 0 ? -games.length : games.length;
    activeIndexRef.current = target;
    registerMotionDelta(delta);
    setActiveIndex(target);
  }, [games.length, presentation.loop, registerMotionDelta]);
  const nextSlide = useCallback(() => moveBy(direction), [direction, moveBy]);
  const previousSlide = useCallback(() => moveBy(-direction), [direction, moveBy]);

  useEffect(() => {
    const media = (rootRef.current?.ownerDocument.defaultView ?? window).matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const doc = rootRef.current?.ownerDocument ?? document;
    const update = () => setDocumentVisible(!doc.hidden);
    update();
    doc.addEventListener("visibilitychange", update);
    return () => doc.removeEventListener("visibilitychange", update);
  }, []);

  const atAutoplayEnd = !presentation.loop && normalizedActiveIndex === (direction === 1 ? games.length - 1 : 0);
  useEffect(() => {
    const key = `${activeGame?.id}-${autoplayDelay}-${direction}`;
    if (autoplayClock.current.key !== key) autoplayClock.current = { key, remaining: autoplayDelay ?? 0 };
    if (isPaused || atAutoplayEnd || games.length <= 1 || autoplayDelay === null) return;
    const started = performance.now();
    const timer = window.setTimeout(nextSlide, autoplayClock.current.remaining);
    return () => {
      window.clearTimeout(timer);
      autoplayClock.current.remaining = Math.max(0, autoplayClock.current.remaining - (performance.now() - started));
    };
  }, [activeGame?.id, autoplayDelay, direction, games.length, isPaused, atAutoplayEnd, nextSlide]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !presentation.wheel) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) < 12) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastWheel.current < 650) return;
      lastWheel.current = now;
      moveBy(event.deltaY > 0 ? direction : -direction);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [direction, moveBy, presentation.wheel]);

  useLayoutEffect(() => {
    const fit = fitRef.current;
    const root = rootRef.current;
    const viewport = fit?.parentElement;
    if (!fit || !root || !viewport) return;
    const resetVisualInsets = () => {
      root.style.setProperty("--hero-visual-inset-top", "0px");
      root.style.setProperty("--hero-visual-inset-bottom", "0px");
    };
    const resetFillOverrides = () => {
      root.style.removeProperty("--hero-card-width");
      root.style.removeProperty("--hero-anchor");
    };
    const update = () => {
      fit.style.transform = "none";
      resetFillOverrides();
      const origin = viewport.getBoundingClientRect();
      const cards = Array.from(fit.querySelectorAll<HTMLElement>("[data-hero-visible='true']")).filter((card) => card.getClientRects().length > 0);
      if (!cards.length || !origin.width || !origin.height) { resetVisualInsets(); return; }
      const responsive = presentation.responsive[designDevice];
      const mainCard = cards.find((card) => card.dataset.position === "main") ?? cards[0];

      if (responsive.cardWidthMode === "fill" && mainCard) {
        const previous = root.querySelector<HTMLElement>('button[aria-label="Juego anterior"]');
        const next = root.querySelector<HTMLElement>('button[aria-label="Juego siguiente"]');
        if (previous?.getClientRects().length && next?.getClientRects().length) {
          const previousBounds = previous.getBoundingClientRect();
          const nextBounds = next.getBoundingClientRect();
          const targetLeft = previousBounds.right + HERO_CARD_ARROW_GAP;
          const targetRight = nextBounds.left - HERO_CARD_ARROW_GAP;
          const targetWidth = targetRight - targetLeft;
          const oneSided = responsive.alignment === "left" || responsive.alignment === "right";
          const footprintCards = oneSided ? cards : [mainCard];

          if (targetWidth > 0 && footprintCards.length) {
            const minWidth = Math.min(HERO_FILL_MIN_CARD_WIDTH, responsive.cardWidth);
            let low = Math.max(1, minWidth);
            let high = HERO_FILL_MAX_CARD_WIDTH;
            let best = low;
            const measure = (width: number) => {
              root.style.setProperty("--hero-card-width", `${width}px`);
              return horizontalBounds(footprintCards);
            };
            const minimumBounds = measure(low);
            if (minimumBounds.width <= targetWidth) {
              for (let step = 0; step < HERO_FILL_SEARCH_STEPS; step += 1) {
                const candidate = (low + high) / 2;
                const candidateBounds = measure(candidate);
                if (candidateBounds.width <= targetWidth) {
                  best = candidate;
                  low = candidate;
                } else {
                  high = candidate;
                }
              }
            }

            const roundedWidth = Math.round(best * 100) / 100;
            const filledBounds = measure(roundedWidth);
            const currentAnchor = Number.parseFloat(getComputedStyle(mainCard).left);
            const centerOffset =
              (targetLeft + targetRight - filledBounds.left - filledBounds.right) / 2;
            if (Number.isFinite(currentAnchor) && Number.isFinite(centerOffset)) {
              root.style.setProperty(
                "--hero-anchor",
                `${Math.round((currentAnchor + centerOffset) * 100) / 100}px`
              );
            }
          }
        }
      }

      const fittedCards = cards.filter((card) => card.dataset.position === "main");
      const bounds = fittedCards.map((card) => card.getBoundingClientRect());
      if (responsive.cardWidthMode !== "fill") {
        const fitted = fitHomeHeroBounds({ left: Math.min(...bounds.map((box) => box.left)) - origin.left, top: Math.min(...bounds.map((box) => box.top)) - origin.top, right: Math.max(...bounds.map((box) => box.right)) - origin.left, bottom: Math.max(...bounds.map((box) => box.bottom)) - origin.top }, origin.width, origin.height, responsive.alignment);
        fit.style.transform = `translate(${fitted.x}px, ${fitted.y}px) scale(${fitted.scale})`;
      }
      if (responsive.spacingReference === "canvas") { resetVisualInsets(); return; }
      const rootBounds = root.getBoundingClientRect();
      const viewportBounds = viewport.getBoundingClientRect();
      const verticalBounds: Array<{ top: number; bottom: number }> = [];
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        const top = Math.max(box.top, viewportBounds.top);
        const bottom = Math.min(box.bottom, viewportBounds.bottom);
        if (bottom > top) verticalBounds.push({ top, bottom });
      }
      for (const control of root.querySelectorAll<HTMLElement>("[data-hero-spacing-boundary]")) {
        if (!control.getClientRects().length) continue;
        const box = control.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) verticalBounds.push({ top: box.top, bottom: box.bottom });
      }
      if (!verticalBounds.length) { resetVisualInsets(); return; }
      const visualTop = Math.min(...verticalBounds.map((box) => box.top));
      const visualBottom = Math.max(...verticalBounds.map((box) => box.bottom));
      const round = (value: number) => Math.round(value * 100) / 100;
      root.style.setProperty("--hero-visual-inset-top", `${round(visualTop - rootBounds.top)}px`);
      root.style.setProperty("--hero-visual-inset-bottom", `${round(rootBounds.bottom - visualBottom)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    const view = root.ownerDocument.defaultView;
    view?.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      view?.removeEventListener("resize", update);
      resetFillOverrides();
      root.style.removeProperty("--hero-visual-inset-top");
      root.style.removeProperty("--hero-visual-inset-bottom");
    };
  }, [presentation, games.length, designDevice]);

  const heroMode = activeGame ? resolveGameDestinationMediaMode(activeGame, "hero") : "image";
  const hoverPlayback = heroMode === "hover-video";
  const videoShouldRender = !reducedMotion && heroMode !== "image" && (!hoverPlayback || hoverPreviewActive);
  const visiblePositions = homeHeroVisiblePositions(presentation.responsive[designDevice], presentation.direction, games.length);
  const visiblePositionSet = new Set<HomeHeroVisualPosition>(visiblePositions);
  const renderPositions = heroMotionRenderPositions(visiblePositions, direction);
  const seenGames = new Set<string>();
  const renderedCards = renderPositions.flatMap((position) => {
    const offset = homeHeroPositionOffset(position);
    const rawIndex = normalizedActiveIndex + offset;
    if (!presentation.loop && (rawIndex < 0 || rawIndex >= games.length)) return [];
    const index = ((rawIndex % games.length) + games.length) % games.length;
    const game = games[index];
    if (!game) return [];
    if (seenGames.has(String(game.id))) return [];
    seenGames.add(String(game.id));
    return [{ position, game, index, isVisible: visiblePositionSet.has(position) }];
  }).sort((left, right) => left.index - right.index);
  const previousActiveIndex = games.length
    ? ((normalizedActiveIndex - motionDelta) % games.length + games.length) % games.length
    : 0;
  const previousPositionByGameId = new Map<string, HomeHeroVisualPosition>();
  if (presentation.loop && motionDelta !== 0) {
    const previousSeen = new Set<string>();
    for (const position of renderPositions) {
      const previousIndex = ((previousActiveIndex + homeHeroPositionOffset(position)) % games.length + games.length) % games.length;
      const previousGame = games[previousIndex];
      if (!previousGame) continue;
      const key = String(previousGame.id);
      if (previousSeen.has(key)) continue;
      previousSeen.add(key);
      previousPositionByGameId.set(key, position);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!presentation.keyboard) return;
    if (event.key === "ArrowRight") { event.preventDefault(); nextSlide(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); previousSlide(); }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (!event.isPrimary || event.button !== 0 || onSelectPosition) return;
    if ((event.pointerType === "mouse" && presentation.drag) || (event.pointerType !== "mouse" && presentation.touch)) {
      const now = performance.now();
      pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId, lastX: event.clientX, lastTime: now, velocityX: 0 };
    }
  }

  const settleDrag = useCallback((delta = 0) => {
    const view = rootRef.current?.ownerDocument.defaultView;
    if (dragSettleFrame.current !== null && view) view.cancelAnimationFrame(dragSettleFrame.current);
    setDragging(false);
    const finish = () => {
      dragSettleFrame.current = null;
      setDragOffset(0);
      if (delta) moveBy(delta);
    };
    if (!view || reducedMotion) { finish(); return; }
    dragSettleFrame.current = view.requestAnimationFrame(finish);
  }, [moveBy, reducedMotion]);

  useEffect(() => {
    const view = rootRef.current?.ownerDocument.defaultView;
    return () => {
      if (dragSettleFrame.current !== null && view) view.cancelAnimationFrame(dragSettleFrame.current);
    };
  }, []);

  function resetPointer(animate = false) {
    const hadPointer = pointerStart.current !== null;
    pointerStart.current = null;
    if (animate && hadPointer) settleDrag();
    else { setDragging(false); setDragOffset(0); }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) { resetPointer(true); return; }
    if (Math.abs(dx) < 4) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = true;
    setDragging(true);
    setDragOffset(dx);
    const now = performance.now();
    const elapsed = Math.max(1, now - start.lastTime);
    start.velocityX = (event.clientX - start.lastX) / elapsed;
    start.lastX = event.clientX;
    start.lastTime = now;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const velocity = start.velocityX;
    pointerStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const threshold = Math.min(120, Math.max(46, presentation.responsive[designDevice].cardWidth * 0.1));
    const commits = Math.abs(dx) >= threshold || Math.abs(velocity) >= 0.45;
    if (!commits || Math.abs(dy) >= Math.max(Math.abs(dx), 24)) { settleDrag(); return; }
    suppressClick.current = true;
    const gesture = Math.abs(velocity) >= 0.45 ? velocity : dx;
    settleDrag(gesture < 0 ? direction : -direction);
  }

  function handleLostPointerCapture() {
    if (!pointerStart.current) return;
    pointerStart.current = null;
    settleDrag();
  }

  function startHoverPreview() {
    if (hoverPlayback && canUseFineHover()) setHoverPreviewActive(true);
    setHovered(true);
  }
  function stopHoverPreview() {
    if (hoverPlayback) setHoverPreviewActive(false);
    setHovered(false);
  }

  if (!activeGame) return null;

  return (
    <section
      ref={rootRef}
      className={`${styles.heroSection} ${motionStyles.motionRoot}`}
      data-composition={presentation.composition}
      data-motion-style={presentation.motionStyle}
      data-motion-ready={motionReady || undefined}
      data-dragging={dragging || undefined}
      aria-label="Juegos destacados"
      aria-roledescription="carrusel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={rootStyle}
      onMouseEnter={startHoverPreview}
      onMouseLeave={stopHoverPreview}
      onPointerDownCapture={() => setFocused(false)}
      onFocusCapture={(event) => {
        const target = event.target as Element;
        setFocused(
          typeof target.matches === "function" && target.matches(":focus-visible")
        );
      }}
      onBlurCapture={(event) => {
        if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) {
          setFocused(false);
        }
      }}
    >
      <h2 className={styles.srOnly}>Juegos destacados</h2>
      <div className={styles.carouselViewport} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onLostPointerCapture={handleLostPointerCapture} onDragStart={(event) => event.preventDefault()} onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }} onPointerCancel={() => resetPointer(true)}>
        <div ref={fitRef} className={styles.stageFit}><div className={styles.stage}>
          {renderedCards.map(({ position, game, index, isVisible }) => {
            const positionStyle = presentation.positions[position];
            const isMain = position === "main";
            const previousPosition = presentation.loop && motionDelta !== 0
              ? previousPositionByGameId.get(String(game.id))
              : undefined;
            const edgeWrap = Boolean(
              presentation.loop &&
              motionDelta !== 0 &&
              previousPosition &&
              homeHeroPositionOffset(position) - homeHeroPositionOffset(previousPosition) !== -motionDelta
            );
            const parallaxArtworkStyle = presentation.motionStyle === "parallax"
              ? { transform: PARALLAX_ARTWORK_TRANSFORM[position] }
              : undefined;
            return (
              <article key={game.id} className={`${styles.heroCard} ${motionStyles.motionCard}`} data-position={position} data-main={isMain || undefined} data-hero-visible={isVisible || undefined} data-motion-buffer={!isVisible || undefined} data-edge-wrap={edgeWrap || undefined} onClick={isVisible && onSelectPosition ? () => onSelectPosition(position) : undefined} role="group" aria-hidden={!isVisible || undefined} aria-roledescription="slide" aria-label={`${index + 1} de ${games.length}: ${game.title}`} style={{ display: "block", opacity: isVisible ? positionStyle.opacity / 100 : 0, pointerEvents: isVisible ? undefined : "none", filter: `blur(${positionStyle.blur}px) brightness(${positionStyle.brightness}%) contrast(${positionStyle.contrast}%) saturate(${positionStyle.saturation}%)`, transform: homeHeroPositionTransform(positionStyle) }}>
                <div className={motionStyles.motionFrame}><div className={styles.cardSurface}>
                  <div className={`${styles.media} ${motionStyles.motionArtwork}`} style={parallaxArtworkStyle}>
                    {game.heroImage || game.coverImage ? <ResponsiveArtwork game={game} alt={isMain ? game.mediaAccessibility?.hero ?? game.imageAlt : ""} active={isMain} style={artworkStyle} /> : <div className={styles.mediaFallback} aria-hidden="true" />}
                    {isMain && <HeroVideoLayer game={game} enabled={videoShouldRender} />}
                    {imageEffect && isMain && <div className={styles.tuningOverlay} style={{ opacity: tuningOverlayOpacity }} aria-hidden="true" />}
                    <div className={styles.editorOverlay} aria-hidden="true" />
                    {isMain && <div className={styles.readabilityOverlay} aria-hidden="true" />}
                  </div>
                  {isMain ? <>{game.badge && <span className={styles.featuredBadge}>{game.badge}</span>}<MainCardContent game={game} motionEnabled={!reducedMotion} /></> : (
                    <button type="button" tabIndex={isVisible ? undefined : -1} className={styles.sideSelect} aria-label={onSelectPosition ? `Editar posición de ${game.title}` : `Mostrar ${game.title}`} onClick={(event) => { if (!isVisible) return; if (onSelectPosition) { event.stopPropagation(); onSelectPosition(position); return; } selectSlide(index); }}><span><strong>{game.shortTitle ?? game.title}</strong><small>{game.category}</small></span></button>
                  )}
                </div></div>
              </article>
            );
          })}
        </div></div>
      </div>
      {games.length > 1 && <>
        <button type="button" className={`${styles.arrow} ${styles.arrowLeft}`} data-arrow-shape={presentation.navigation.arrowShape} data-arrow-icon={presentation.navigation.arrowIcon} data-hero-spacing-boundary="control" aria-label="Juego anterior" onClick={previousSlide} disabled={!presentation.loop && normalizedActiveIndex === (direction === 1 ? 0 : games.length - 1)}><HeroArrowGlyph icon={presentation.navigation.arrowIcon} direction="left" /></button>
        <button type="button" className={`${styles.arrow} ${styles.arrowRight}`} data-arrow-shape={presentation.navigation.arrowShape} data-arrow-icon={presentation.navigation.arrowIcon} data-hero-spacing-boundary="control" aria-label="Juego siguiente" onClick={nextSlide} disabled={!presentation.loop && normalizedActiveIndex === (direction === 1 ? games.length - 1 : 0)}><HeroArrowGlyph icon={presentation.navigation.arrowIcon} direction="right" /></button>
        <HeroNavigation games={games} activeIndex={normalizedActiveIndex} config={presentation.navigation} autoplayDelay={autoplayDelay} isPaused={isPaused} manualPaused={manualPaused} atAutoplayEnd={atAutoplayEnd} onSelect={selectSlide} onTogglePause={() => setManualPaused((current) => !current)} editor={navigationEditor} />
      </>}
      <span className={styles.srOnly} aria-hidden="true">{formatHomeHeroPosition(normalizedActiveIndex, games.length)}</span>
    </section>
  );
}