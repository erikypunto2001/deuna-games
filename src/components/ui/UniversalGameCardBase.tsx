"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Monitor,
  Star,
} from "lucide-react";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import GameMedia from "@/components/ui/GameMedia";
import HoverPreviewMedia from "@/components/ui/HoverPreviewMedia";
import {
  formatGameReleaseDate,
} from "@/lib/games/game-date";
import type {
  HomeCardRevealMode,
} from "@/lib/home/card-row-reveal";
import { useMediaQuery } from "@/lib/browser/client-signals";
import { resolveGameCardPresentation } from "@/lib/media/game-card-presentation";
import type { Game } from "@/types/game";

import styles from "./UniversalGameCard.module.css";
import presentationStyles from "./UniversalGameCardPresentation.module.css";
import staticDetailStyles from "./UniversalGameCardStaticDetail.module.css";
import tiltStyles from "./UniversalGameCardTilt.module.css";

export type UniversalGameCardVariant =
  | "standard"
  | "recent"
  | "lowSpec"
  | "catalog";

export type UniversalGameCardPrimaryAction =
  | {
      kind?: "link";
      href?: string;
      ariaLabel?: string;
    }
  | {
      kind: "button";
      ariaLabel: string;
      onClick: () => void;
      pressed?: boolean;
      disabled?: boolean;
    };

export type UniversalGameCardProps = {
  game: Game;
  variant?: UniversalGameCardVariant;
  revealMode?: HomeCardRevealMode;
  overlayAction?: ReactNode;
  supplementalContent?: ReactNode;
  primaryAction?: UniversalGameCardPrimaryAction;
};

type PendingTilt = {
  node: HTMLElement;
  clientX: number;
  clientY: number;
};

type ExpandedCardGeometry = {
  articleLeft: number;
  articleTop: number;
  articleWidth: number;
  articleHeight: number;
  detailLeft: number;
  detailTop: number;
  detailWidth: number;
  detailHeight: number;
  scale: number;
};

type UniversalCardStyle = CSSProperties & {
  "--tilt-x": string;
  "--tilt-y": string;
  "--pointer-x": string;
  "--pointer-y": string;
  "--image-x": string;
  "--image-y": string;
  "--card-detail-left"?: string;
  "--card-detail-top"?: string;
  "--card-detail-width"?: string;
  "--card-detail-height"?: string;
  "--card-transform-origin-x"?: string;
  "--card-transform-origin-y"?: string;
};

// Contrato explícito: Imagen + hover no agrega espera artificial.
const PREVIEW_DELAY_MS = 0;
const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";
const DIRECT_DETAIL_MEDIA = "(hover: none), (pointer: coarse)";
const STATIC_DETAIL_VIDEO_THRESHOLD = 0.01;
const CARD_EXPANSION_SCALE = 1.18;
const CARD_EXPANSION_MAX_WIDTH = 360;
const CARD_VIEWPORT_MARGIN = 24;
const CARD_ASPECT_HEIGHT = 5 / 4;

const fallbackClassBySlug: Record<string, string> = {
  "god-of-war-ragnarok": "godOfWar",
  "elden-ring": "eldenRing",
  "forza-horizon-5": "forza",
  "resident-evil-4": "residentEvil",
  "hogwarts-legacy": "hogwarts",
  "cyberpunk-2077": "cyberpunk",
  "baldurs-gate-3": "baldursGate",
  "red-dead-redemption-2": "redDead",
  "lies-of-p": "liesOfP",
  "armored-core-vi": "armoredCore",
  "stellar-blade": "stellarBlade",
  "palworld": "palworld",
  "enshrouded": "enshrouded",
  "helldivers-2": "helldivers",
  "the-talos-principle-2": "talos",
  "minecraft-java-edition": "minecraft",
  "left-4-dead-2": "left4Dead",
  "gta-san-andreas": "gta",
  "terraria": "terraria",
  "half-life-2": "halfLife",
  "portal-2": "portal",
  "stardew-valley": "stardew",
};

function getMediaBadge(game: Game, variant: UniversalGameCardVariant) {
  if (variant === "recent") {
    return game.releaseDate
      ? { label: "LANZAMIENTO", tone: "brand" as const }
      : null;
  }
  if (variant === "catalog") return { label: game.category, tone: "brand" as const };
  return null;
}

function resetTilt(node: HTMLElement) {
  node.style.setProperty("--tilt-x", "0deg");
  node.style.setProperty("--tilt-y", "0deg");
  node.style.setProperty("--pointer-x", "50%");
  node.style.setProperty("--pointer-y", "50%");
  node.style.setProperty("--image-x", "0px");
  node.style.setProperty("--image-y", "0px");
}

function applyTilt(node: HTMLElement, clientX: number, clientY: number, rect: DOMRect) {
  const x = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const y = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
  node.style.setProperty("--tilt-x", `${((0.5 - y) * 7).toFixed(2)}deg`);
  node.style.setProperty("--tilt-y", `${((x - 0.5) * 8).toFixed(2)}deg`);
  node.style.setProperty("--pointer-x", `${(x * 100).toFixed(1)}%`);
  node.style.setProperty("--pointer-y", `${(y * 100).toFixed(1)}%`);
  node.style.setProperty("--image-x", `${((x - 0.5) * -8).toFixed(2)}px`);
  node.style.setProperty("--image-y", `${((y - 0.5) * -6).toFixed(2)}px`);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function stickyHeaderBottom() {
  const header = document.querySelector("header");

  if (!(header instanceof HTMLElement)) return CARD_VIEWPORT_MARGIN;

  const style = window.getComputedStyle(header);
  if (style.position !== "fixed" && style.position !== "sticky") {
    return CARD_VIEWPORT_MARGIN;
  }

  const rect = header.getBoundingClientRect();
  if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
    return CARD_VIEWPORT_MARGIN;
  }

  return Math.max(CARD_VIEWPORT_MARGIN, rect.bottom + 10);
}

function Rating({ game }: { game: Game }) {
  if (game.rating === undefined && !game.reviews) {
    return null;
  }

  return (
    <div className={styles.rating} data-card-rating="true">
      <Star size={17} fill="currentColor" aria-hidden="true" />
      {game.rating !== undefined && <strong>{game.rating}</strong>}
      {game.reviews && <span>({game.reviews})</span>}
    </div>
  );
}

function LowSpecDetails({ game }: { game: Game }) {
  const requirements = game.requirements;
  const minimum = requirements?.minimum;
  const ram = requirements?.ram ?? minimum?.ram ?? "—";
  const graphics = requirements?.graphics ?? minimum?.graphics ?? "—";
  const system = requirements?.system ?? minimum?.system ?? "—";

  return (
    <>
      <span className={styles.lowSpecBadge} data-card-low-spec-badge="true">
        BAJOS RECURSOS
      </span>
      <div className={styles.requirements} data-card-requirements="true">
        <div><span className={styles.requirementIcon}>R</span><p>RAM: <strong>{ram}</strong></p></div>
        <div><span className={styles.requirementIcon}>G</span><p>Gráfica: <strong>{graphics}</strong></p></div>
        <div><span className={styles.requirementIcon}>SO</span><p>Sistema: <strong>{system}</strong></p></div>
      </div>
    </>
  );
}

export default function UniversalGameCardBase({
  game,
  variant = "standard",
  revealMode = "interaction",
  overlayAction,
  supplementalContent,
  primaryAction,
}: UniversalGameCardProps) {
  const staticDetail = revealMode === "static-detail";
  const tiltFrame = useRef<number | null>(null);
  const anchorFrame = useRef<number | null>(null);
  const pendingTilt = useRef<PendingTilt | null>(null);
  const cardRect = useRef<DOMRect | null>(null);
  const pointerEffectsEnabled = useRef(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [detailVisible, setDetailVisible] = useState(staticDetail);
  const directDetailVisible = useMediaQuery(DIRECT_DETAIL_MEDIA);
  const [previewActive, setPreviewActive] = useState(false);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_MEDIA);
  const [automaticVideoInViewport, setAutomaticVideoInViewport] = useState(false);
  const [expandedGeometry, setExpandedGeometry] =
    useState<ExpandedCardGeometry | null>(null);
  const cardExpanded = expandedGeometry !== null;

  const presentation = resolveGameCardPresentation(game);
  const cardMode = presentation.card.mode;
  const preview = presentation.card.preview;
  const fallbackClass = fallbackClassBySlug[game.slug];
  const mediaBadge = getMediaBadge(game, variant);
  const isStandard = variant === "standard";
  const isCatalog = variant === "catalog";
  const isRecent = variant === "recent";
  const isLowSpec = variant === "lowSpec";
  const variantClass = styles[`variant${variant[0].toUpperCase()}${variant.slice(1)}`];

  useEffect(() => {
    if (
      (!staticDetail && !directDetailVisible) ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const slot = slotRef.current;
    if (!slot) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setAutomaticVideoInViewport(Boolean(
          entry?.isIntersecting &&
          entry.intersectionRatio >= STATIC_DETAIL_VIDEO_THRESHOLD
        ));
      },
      {
        threshold: [0, STATIC_DETAIL_VIDEO_THRESHOLD, 1],
      }
    );

    observer.observe(slot);
    return () => observer.disconnect();
  }, [directDetailVisible, staticDetail]);

  useEffect(() => {
    if (!expandedGeometry) return;

    const detail = articleRef.current?.querySelector('[data-card-face="detail"]');
    cardRect.current =
      detail instanceof HTMLElement
        ? detail.getBoundingClientRect()
        : articleRef.current?.getBoundingClientRect() ?? null;
  }, [expandedGeometry]);

  useEffect(() => {
    if (!cardExpanded) return;

    const syncExpandedCardToSlot = () => {
      if (anchorFrame.current !== null) return;

      anchorFrame.current = requestAnimationFrame(() => {
        anchorFrame.current = null;
        const slot = slotRef.current;
        if (!slot) return;

        const rect = slot.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        setExpandedGeometry((current) => {
          if (!current) return current;
          if (
            Math.abs(current.articleLeft - rect.left) < 0.5 &&
            Math.abs(current.articleTop - rect.top) < 0.5
          ) {
            return current;
          }

          return {
            ...current,
            articleLeft: rect.left,
            articleTop: rect.top,
          };
        });
      });
    };

    window.addEventListener("scroll", syncExpandedCardToSlot, true);
    return () => {
      window.removeEventListener("scroll", syncExpandedCardToSlot, true);
      if (anchorFrame.current !== null) {
        cancelAnimationFrame(anchorFrame.current);
        anchorFrame.current = null;
      }
    };
  }, [cardExpanded]);

  function cancelTiltFrame() {
    if (tiltFrame.current !== null) {
      cancelAnimationFrame(tiltFrame.current);
      tiltFrame.current = null;
    }
    pendingTilt.current = null;
  }

  function cancelPreview() {
    setPreviewActive(false);
  }

  function schedulePreview() {
    const motionReduced = window.matchMedia(REDUCED_MOTION_MEDIA).matches;
    if (!preview || motionReduced || cardMode === "image" || previewActive) {
      return;
    }
    setPreviewActive(true);
  }

  function expandCard() {
    const slot = slotRef.current;
    if (!slot) return;

    const rect = slot.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const safeTop = stickyHeaderBottom();
    const safeBottom = CARD_VIEWPORT_MARGIN;
    const availableWidth = Math.max(
      rect.width,
      viewportWidth - CARD_VIEWPORT_MARGIN * 2
    );
    const availableHeight = Math.max(
      rect.height,
      viewportHeight - safeTop - safeBottom
    );
    const detailWidth = Math.max(
      rect.width,
      Math.min(
        rect.width * CARD_EXPANSION_SCALE,
        CARD_EXPANSION_MAX_WIDTH,
        availableWidth,
        availableHeight / CARD_ASPECT_HEIGHT
      )
    );
    const detailHeight = detailWidth * CARD_ASPECT_HEIGHT;
    const detailViewportLeft = clamp(
      rect.left - (detailWidth - rect.width) / 2,
      CARD_VIEWPORT_MARGIN,
      viewportWidth - CARD_VIEWPORT_MARGIN - detailWidth
    );
    const detailViewportTop = clamp(
      rect.top - (detailHeight - rect.height) / 2,
      safeTop,
      viewportHeight - safeBottom - detailHeight
    );

    setExpandedGeometry({
      articleLeft: rect.left,
      articleTop: rect.top,
      articleWidth: rect.width,
      articleHeight: rect.height,
      detailLeft: detailViewportLeft - rect.left,
      detailTop: detailViewportTop - rect.top,
      detailWidth,
      detailHeight,
      scale: detailWidth / rect.width,
    });
  }

  function collapseCard() {
    setExpandedGeometry(null);
  }

  function activatePointerEffects(event: ReactPointerEvent<HTMLElement>) {
    const pointerSupportsEffects =
      event.pointerType === "mouse" || event.pointerType === "pen";
    const motionReduced = window.matchMedia(REDUCED_MOTION_MEDIA).matches;

    if (!pointerSupportsEffects || motionReduced) {
      if (pointerEffectsEnabled.current) {
        cancelTiltFrame();
        cardRect.current = null;
        resetTilt(event.currentTarget);
      }
      pointerEffectsEnabled.current = false;
      event.currentTarget.removeAttribute("data-tilt-active");
      return false;
    }

    pointerEffectsEnabled.current = true;
    event.currentTarget.setAttribute("data-tilt-active", "true");
    if (!cardRect.current) cardRect.current = event.currentTarget.getBoundingClientRect();
    return true;
  }

  function startCard(event: ReactPointerEvent<HTMLElement>) {
    const pointerSupportsReveal =
      event.pointerType === "mouse" || event.pointerType === "pen";

    if (staticDetail) {
      if (pointerSupportsReveal) schedulePreview();
      return;
    }

    if (pointerSupportsReveal) {
      setDetailVisible(true);
      expandCard();
      schedulePreview();
    }
    if (!activatePointerEffects(event)) return;
    cardRect.current = null;
  }

  function scheduleTilt(event: ReactPointerEvent<HTMLElement>) {
    if (staticDetail) return;

    const pointerSupportsReveal =
      event.pointerType === "mouse" || event.pointerType === "pen";
    if (pointerSupportsReveal && !detailVisible) {
      setDetailVisible(true);
      expandCard();
      schedulePreview();
    }
    if (!activatePointerEffects(event)) return;
    schedulePreview();
    pendingTilt.current = {
      node: event.currentTarget,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (tiltFrame.current !== null) return;
    tiltFrame.current = requestAnimationFrame(() => {
      tiltFrame.current = null;
      const pending = pendingTilt.current;
      const rect = cardRect.current;
      pendingTilt.current = null;
      if (pending && rect) applyTilt(pending.node, pending.clientX, pending.clientY, rect);
    });
  }

  function stopCard(event: ReactPointerEvent<HTMLElement>) {
    if (staticDetail) {
      cancelPreview();
      return;
    }

    cancelTiltFrame();
    cardRect.current = null;
    pointerEffectsEnabled.current = false;
    event.currentTarget.removeAttribute("data-tilt-active");
    resetTilt(event.currentTarget);
    setDetailVisible(false);
    collapseCard();
    cancelPreview();
  }

  function focusCard() {
    if (staticDetail) {
      if (!directDetailVisible) schedulePreview();
      return;
    }

    setDetailVisible(true);
    if (!directDetailVisible) {
      expandCard();
      schedulePreview();
    }
  }

  function blurCard(event: ReactFocusEvent<HTMLElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;

    if (staticDetail) {
      cancelPreview();
      return;
    }

    setDetailVisible(false);
    collapseCard();
    cancelPreview();
  }

  useEffect(() => () => {
    if (tiltFrame.current !== null) cancelAnimationFrame(tiltFrame.current);
  }, []);

  const detailPresented = detailVisible || directDetailVisible;
  const interactionVideoActive =
    !staticDetail &&
    !directDetailVisible &&
    detailVisible &&
    previewActive;
  const automaticVideoActive =
    automaticVideoInViewport &&
    (staticDetail || directDetailVisible) &&
    (cardMode === "video" ||
      (staticDetail && cardMode === "hover-video" && previewActive));
  const videoActive = Boolean(
    preview &&
    cardMode !== "image" &&
    !reducedMotion &&
    (interactionVideoActive || automaticVideoActive)
  );
  const primaryClassName = `${styles.link} ${presentationStyles.link} ${tiltStyles.tiltClip}`;
  const cardContent = (
    <>
      <div className={presentationStyles.coverFace} aria-hidden={detailPresented ? "true" : undefined}>
        <GameMedia
          src={presentation.cover.image}
          alt={detailPresented ? "" : presentation.cover.alt}
          viewport={presentation.cover.viewport}
          sizes="(max-width: 560px) 82vw, (max-width: 900px) 48vw, (max-width: 1250px) 30vw, 20vw"
          fallbackClassName={fallbackClass ? styles[fallbackClass] : undefined}
        />
        <div className={presentationStyles.coverShade} aria-hidden="true" />
      </div>

      <div
        className={presentationStyles.detailFace}
        data-card-face="detail"
        aria-hidden={!detailPresented ? "true" : undefined}
      >
        <div
          className={`${styles.media} ${presentationStyles.detailMedia} ${tiltStyles.tiltMedia}`}
          data-card-detail-media="true"
        >
          <HoverPreviewMedia
            imageSrc={presentation.card.image}
            imageAlt={detailPresented ? presentation.card.alt : ""}
            imageViewport={presentation.card.viewport}
            previewClip={preview?.src}
            previewViewport={preview?.viewport}
            active={videoActive}
            unscaledVideo={staticDetail}
            sizes="(max-width: 560px) 82vw, (max-width: 900px) 48vw, (max-width: 1250px) 30vw, 20vw"
            fallbackClassName={fallbackClass ? styles[fallbackClass] : undefined}
          />
          <div className={styles.mediaOverlay} aria-hidden="true" />
          <div className={tiltStyles.spotlight} aria-hidden="true" />
          {mediaBadge && (
            <span className={`${styles.mediaBadge} ${mediaBadge.tone === "brand" ? styles.mediaBadgeBrand : ""}`}>
              {mediaBadge.label}
            </span>
          )}
          <Monitor size={18} className={styles.platform} aria-hidden="true" />
        </div>

        <div
          className={`${styles.content} ${presentationStyles.detailContent}`}
          data-card-detail-content="true"
        >
          <div className={styles.titleRow} data-card-title-row="true">
            <h3>{game.title}</h3>
            {isRecent && game.version && <span className={styles.version}>{game.version}</span>}
            {isCatalog && <ChevronRight size={17} aria-hidden="true" />}
          </div>
          {(isStandard || isCatalog) && (
            <p className={styles.description} data-card-description="true">
              {game.description}
            </p>
          )}
          {isLowSpec && <LowSpecDetails game={game} />}
          <Rating game={game} />
          {isRecent && game.releaseDate && (
            <div className={styles.date} data-card-date="true">
              <CalendarDays size={15} aria-hidden="true" />
              <span>Lanzamiento: {formatGameReleaseDate(game.releaseDate)}</span>
            </div>
          )}
          {supplementalContent}
        </div>
      </div>
    </>
  );

  const primaryControl = primaryAction?.kind === "button" ? (
    <button
      type="button"
      className={`${primaryClassName} ${presentationStyles.actionButton}`}
      aria-label={primaryAction.ariaLabel}
      aria-pressed={primaryAction.pressed}
      disabled={primaryAction.disabled}
      onClick={primaryAction.onClick}
    >
      {cardContent}
    </button>
  ) : (
    <Link
      href={primaryAction?.href ?? `/juegos/${game.slug}`}
      className={primaryClassName}
      aria-label={primaryAction?.ariaLabel ?? `Ver ${game.title}`}
    >
      {cardContent}
    </Link>
  );

  const cardStyle: UniversalCardStyle = {
    "--tilt-x": "0deg",
    "--tilt-y": "0deg",
    "--pointer-x": "50%",
    "--pointer-y": "50%",
    "--image-x": "0px",
    "--image-y": "0px",
  };

  if (expandedGeometry) {
    cardStyle.position = "fixed";
    cardStyle.left = expandedGeometry.articleLeft;
    cardStyle.top = expandedGeometry.articleTop;
    cardStyle.right = "auto";
    cardStyle.bottom = "auto";
    cardStyle.width = expandedGeometry.articleWidth;
    cardStyle.height = expandedGeometry.articleHeight;
    cardStyle["--card-detail-left"] = `${expandedGeometry.detailLeft}px`;
    cardStyle["--card-detail-top"] = `${expandedGeometry.detailTop}px`;
    cardStyle["--card-detail-width"] = `${expandedGeometry.detailWidth}px`;
    cardStyle["--card-detail-height"] = `${expandedGeometry.detailHeight}px`;
    cardStyle["--card-transform-origin-x"] = `${
      expandedGeometry.detailLeft + expandedGeometry.detailWidth / 2
    }px`;
    cardStyle["--card-transform-origin-y"] = `${
      expandedGeometry.detailTop + expandedGeometry.detailHeight / 2
    }px`;
  }

  return (
    <div
      ref={slotRef}
      className={`${styles.slot} ${expandedGeometry ? styles.slotExpanded : ""}`}
      data-game-card-slot="true"
    >
      <article
        ref={articleRef}
        className={`${styles.card} ${presentationStyles.shell} ${tiltStyles.tiltCard} ${variantClass} ${staticDetail ? staticDetailStyles.staticDetailCard : ""}`}
        data-card-variant={variant}
        data-card-reveal-mode={revealMode}
        data-card-media-mode={cardMode}
        data-card-preview-delay-ms={PREVIEW_DELAY_MS}
        data-card-direct-detail={directDetailVisible ? "true" : "false"}
        data-card-video-active={videoActive ? "true" : "false"}
        data-detail-visible={detailPresented ? "true" : "false"}
        data-card-expanded={expandedGeometry ? "true" : "false"}
        data-card-expansion-scale={expandedGeometry?.scale.toFixed(3) ?? "1.000"}
        data-cover-source={presentation.cover.source}
        onPointerEnter={startCard}
        onPointerMove={scheduleTilt}
        onPointerLeave={stopCard}
        onPointerCancel={stopCard}
        onFocusCapture={focusCard}
        onBlurCapture={blurCard}
        style={cardStyle}
      >
        {primaryControl}
        {overlayAction && (
          <div className={styles.overlayAction} data-card-overlay-action="true">
            {overlayAction}
          </div>
        )}
      </article>
    </div>
  );
}