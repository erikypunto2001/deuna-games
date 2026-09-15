import type {
  HomeHeroArrowPlacement,
  HomeHeroDevice,
  HomeHeroPosition,
  HomeHeroPositionStyle,
  HomeHeroPresentation,
  HomeHeroResponsiveStyle,
} from "@/data/home-config";

export const HOME_HERO_VISUAL_POSITIONS = [
  "left2",
  "left1",
  "main",
  "right1",
  "right2",
] as const satisfies readonly Exclude<HomeHeroPosition, "all">[];

export type HomeHeroVisualPosition =
  (typeof HOME_HERO_VISUAL_POSITIONS)[number];

const positionOffsets: Record<HomeHeroVisualPosition, number> = {
  left2: -2,
  left1: -1,
  main: 0,
  right1: 1,
  right2: 2,
};

const slotGeometry: Record<
  HomeHeroVisualPosition,
  { widthFactor: number; gapFactor: number }
> = {
  left2: { widthFactor: -.72, gapFactor: -2 },
  left1: { widthFactor: -.42, gapFactor: -1 },
  main: { widthFactor: 0, gapFactor: 0 },
  right1: { widthFactor: .42, gapFactor: 1 },
  right2: { widthFactor: .72, gapFactor: 2 },
};

export function homeHeroPositionOffset(
  position: HomeHeroVisualPosition
) {
  return positionOffsets[position];
}

export function homeHeroSlotX(
  position: HomeHeroVisualPosition,
  responsive: HomeHeroResponsiveStyle
) {
  const geometry = slotGeometry[position];
  return (
    responsive.cardWidth * geometry.widthFactor +
    responsive.gap * geometry.gapFactor
  );
}

/** Resolve offsets from the rendered width, including responsive width limits. */
export function homeHeroSlotCSS(position: HomeHeroVisualPosition) {
  const geometry = slotGeometry[position];
  if (!geometry.widthFactor && !geometry.gapFactor) return "0px";
  const sign = Math.sign(geometry.widthFactor || geometry.gapFactor);
  return `calc((var(--hero-card-width) * ${Math.abs(geometry.widthFactor)} + var(--hero-gap) * ${Math.abs(geometry.gapFactor)}) * ${sign})`;
}

const heroArrowControlSize: Record<HomeHeroDevice, number> = {
  desktop: 48,
  tablet: 48,
  mobile: 40,
};
const HERO_CARD_ARROW_GAP = 8;

/**
 * Resolve the real rendered card width. Fixed mode preserves historical pixel
 * geometry. Fill mode uses the Hero container and reserves the visible space
 * occupied by each arrow control, including editorial inset and scale.
 */
export function homeHeroCardWidthCSS(
  responsive: HomeHeroResponsiveStyle,
  arrows: HomeHeroArrowPlacement,
  device: HomeHeroDevice,
  hasArrows: boolean
) {
  if (responsive.cardWidthMode !== "fill") {
    return `${responsive.cardWidth}px`;
  }
  if (!hasArrows) return "100cqw";

  const controlSize = heroArrowControlSize[device];
  const scale = arrows.scale / 100;
  const visibleInnerEdge =
    arrows.inset + controlSize / 2 + (controlSize * scale) / 2;
  const safeInset = Math.max(0, visibleInnerEdge + HERO_CARD_ARROW_GAP);
  const totalInset = Math.round(safeInset * 200) / 100;
  return `max(1px, calc(100cqw - ${totalInset}px))`;
}

function defaultVisiblePositions(
  responsive: HomeHeroResponsiveStyle,
  direction: HomeHeroPresentation["direction"],
  totalGames = Number.POSITIVE_INFINITY
): readonly HomeHeroVisualPosition[] {
  const visibleCount = Math.min(responsive.visibleCards, Math.max(1, totalGames));

  if (visibleCount <= 1) return ["main"];
  if (visibleCount === 2) {
    return direction === "reverse"
      ? ["left1", "main"]
      : ["main", "right1"];
  }
  if (visibleCount === 3) return ["left1", "main", "right1"];
  if (visibleCount === 4) {
    return direction === "reverse"
      ? ["left2", "left1", "main", "right1"]
      : ["left1", "main", "right1", "right2"];
  }

  return HOME_HERO_VISUAL_POSITIONS;
}

/** The main card always remains visible; hiding a slot never removes a game. */
export function homeHeroVisiblePositions(
  responsive: HomeHeroResponsiveStyle,
  direction: HomeHeroPresentation["direction"],
  totalGames = Number.POSITIVE_INFINITY
): readonly HomeHeroVisualPosition[] {
  const count = Math.min(responsive.visibleCards, Math.max(1, totalGames));
  const positions: readonly HomeHeroVisualPosition[] = responsive.alignment === "left"
    ? ["main", "right1", "right2"]
    : responsive.alignment === "right"
      ? ["left2", "left1", "main"]
      : defaultVisiblePositions(responsive, direction, totalGames);
  const limited = responsive.alignment === "right" ? positions.slice(-count) : positions.slice(0, count);
  return limited.filter((id) => id === "main" || !responsive.hiddenPositions?.includes(id));
}

function anchorOffsetCSS(
  positions: readonly HomeHeroVisualPosition[]
) {
  if (positions.length <= 1) return "50%";

  const first = slotGeometry[positions[0]];
  const last = slotGeometry[positions[positions.length - 1]];
  const widthFactor = (first.widthFactor + last.widthFactor) / 2;
  const gapFactor = (first.gapFactor + last.gapFactor) / 2;

  if (Math.abs(widthFactor) < 1e-9 && Math.abs(gapFactor) < 1e-9) {
    return "50%";
  }

  const positive = widthFactor > 0 || (widthFactor === 0 && gapFactor > 0);
  const operator = positive ? "-" : "+";
  const terms: string[] = [];
  if (Math.abs(widthFactor) >= 1e-9) {
    terms.push(`var(--hero-card-width) * ${Math.abs(widthFactor)}`);
  }
  if (Math.abs(gapFactor) >= 1e-9) {
    terms.push(`var(--hero-gap) * ${Math.abs(gapFactor)}`);
  }

  return `calc(50% ${operator} (${terms.join(" + ")}))`;
}

/**
 * Keep the complete one-sided composition centered in the Hero. `alignment`
 * chooses which neighboring slots exist; it must not pin the whole carousel to
 * a page edge. Individual editor translations remain relative to this neutral
 * centered origin.
 */
export function homeHeroAnchor(responsive: HomeHeroResponsiveStyle) {
  if (responsive.alignment === "center") return "50%";
  const positions = homeHeroVisiblePositions(responsive, "forward");
  return anchorOffsetCSS(positions);
}

export function homeHeroPositionDisplay(
  position: HomeHeroVisualPosition,
  responsive: HomeHeroResponsiveStyle,
  direction: HomeHeroPresentation["direction"],
  totalGames = Number.POSITIVE_INFINITY
) {
  return homeHeroVisiblePositions(
    responsive,
    direction,
    totalGames
  ).includes(position)
    ? "block"
    : "none";
}

export function homeHeroPositionTransform(
  style: HomeHeroPositionStyle
) {
  return `translate3d(calc(-50% + var(--hero-slot-x) + var(--hero-drag-offset, 0px) + ${style.translateX}px), calc(-50% + ${style.translateY}px), ${style.translateZ}px) rotateX(${style.rotateX}deg) rotateY(${style.rotateY}deg) rotateZ(${style.rotateZ}deg) scale(${style.scale}) scaleX(var(--hero-motion-scale-x, 1))`;
}

export type HeroBounds = { left: number; top: number; right: number; bottom: number };

/** Fit the complete visible composition, including perspective, inside its stage. */
export function fitHomeHeroBounds(bounds: HeroBounds, width: number, height: number, _alignment: HomeHeroResponsiveStyle["alignment"] = "center") {
  // `alignment` remains in the signature for source compatibility. Slot layout
  // already encodes it before measurement, so fitting only needs the real bounds.
  void _alignment;
  // Horizontal spacing is owned by `.main-content`. Since every layout is now
  // centered as a complete composition, rotations must never be corrected by
  // pushing the stage left/right. There is deliberately no hidden vertical
  // clearance: the configured card height is also the real Hero stage height.
  const availableWidth = Math.max(1, width);
  const availableHeight = Math.max(1, height);
  const contentHeight = Math.max(1, bounds.bottom - bounds.top);
  const originX = width / 2;
  const centeredWidth = Math.max(
    1,
    2 * Math.max(originX - bounds.left, bounds.right - originX)
  );
  const scale = Math.min(
    1,
    availableWidth / centeredWidth,
    availableHeight / contentHeight
  );
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  return {
    scale,
    x: (1 - scale) * originX,
    y: clamp(
      (1 - scale) * height / 2,
      -bounds.top * scale,
      height - bounds.bottom * scale
    ),
  };
}
