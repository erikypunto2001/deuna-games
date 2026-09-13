import type { HomeHeroPresentation, HomeHeroPositionStyle } from "@/data/home-config";

export type PresetName =
  | "Classic"
  | "Cinema"
  | "Minimal"
  | "Spotlight"
  | "Cards"
  | "Custom";

const clone = <T,>(value: T): T => structuredClone(value);

const neutralPosition: HomeHeroPositionStyle = {
  scale: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  translateX: 0,
  translateY: 0,
  translateZ: 0,
  opacity: 100,
  blur: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
};

function position(
  overrides: Partial<HomeHeroPositionStyle>
): HomeHeroPositionStyle {
  return { ...neutralPosition, ...overrides };
}

export function applyPreset(
  name: PresetName,
  value: HomeHeroPresentation
) {
  if (name === "Custom") {
    return { ...clone(value), preset: "custom" as const };
  }

  const next = clone(value);
  Object.assign(next, { radius: 18, shadow: 55, glow: 18, overlay: 48, borderWidth: 1 });
  next.positions.all = position({});
  next.positions.main = position({ translateZ: 80, saturation: 105 });

  const setSides = (
    near: Partial<HomeHeroPositionStyle>,
    far: Partial<HomeHeroPositionStyle>
  ) => {
    next.positions.left1 = position({ ...near, translateX: -Math.abs(near.translateX ?? 0), rotateY: Math.abs(near.rotateY ?? 0) });
    next.positions.right1 = position({ ...near, translateX: Math.abs(near.translateX ?? 0), rotateY: -Math.abs(near.rotateY ?? 0) });
    next.positions.left2 = position({ ...far, translateX: -Math.abs(far.translateX ?? 0), rotateY: Math.abs(far.rotateY ?? 0) });
    next.positions.right2 = position({ ...far, translateX: Math.abs(far.translateX ?? 0), rotateY: -Math.abs(far.rotateY ?? 0) });
  };

  if (name === "Classic") {
    setSides(
      { scale: .84, translateX: 70, translateZ: -80, opacity: 76, brightness: 82, saturation: 88 },
      { scale: .69, translateX: 126, translateZ: -170, opacity: 44, blur: 1, brightness: 66, saturation: 72 }
    );
    next.radius = 16;
    next.composition = "studio";
  }

  if (name === "Cinema") {
    setSides(
      { scale: .84, rotateY: 14, translateX: 74, translateZ: -100, opacity: 72, brightness: 74, saturation: 82 },
      { scale: .68, rotateY: 22, translateX: 126, translateZ: -180, opacity: 42, blur: 1, brightness: 58, saturation: 68 }
    );
    next.radius = 18;
    next.composition = "cinema";
  }

  if (name === "Minimal") {
    setSides(
      { scale: .9, translateX: 68, translateZ: -50, opacity: 48, brightness: 82, saturation: 86 },
      { scale: .76, translateX: 120, translateZ: -120, opacity: 24, brightness: 68, saturation: 72 }
    );
    next.radius = 8;
    next.shadow = 20;
    next.glow = 0;
    next.overlay = 30;
    next.composition = "focus";
  }

  if (name === "Spotlight") {
    setSides(
      { scale: .76, rotateY: 8, translateX: 90, translateZ: -150, opacity: 36, brightness: 54, saturation: 62 },
      { scale: .6, rotateY: 14, translateX: 154, translateZ: -260, opacity: 18, blur: 2, brightness: 42, saturation: 50 }
    );
    next.glow = 50;
    next.overlay = 62;
    next.composition = "cinema";
  }

  if (name === "Cards") {
    setSides(
      { scale: .86, translateX: 76, translateZ: -70, opacity: 90, brightness: 94, saturation: 96 },
      { scale: .72, translateX: 132, translateZ: -150, opacity: 66, brightness: 82, saturation: 88 }
    );
    next.radius = 24;
    next.composition = "studio";
  }

  next.preset = name.toLowerCase() as HomeHeroPresentation["preset"];
  return next;
}

export const carouselLayouts = [
  { id: "center", title: "Centrado", description: "Principal en el centro, con vistas a ambos lados." },
  { id: "left", title: "Principal a la izquierda", description: "Próximos juegos a la derecha; deslizamiento hacia la izquierda." },
  { id: "right", title: "Principal a la derecha", description: "Juegos a la izquierda; deslizamiento hacia la derecha." },
  { id: "single", title: "Una imagen", description: "Un juego por vez, con transición suave." },
  { id: "duo", title: "Dúo editorial", description: "Principal a la izquierda y una vista del próximo juego." },
] as const;

export function applyHeroLayout(layout: typeof carouselLayouts[number]["id"], presentation: HomeHeroPresentation) {
  const next = applyPreset(layout === "single" ? "Minimal" : "Classic", presentation);
  for (const id of ["desktop", "tablet", "mobile"] as const) {
    const settings = next.responsive[id];
    settings.alignment = layout === "left" || layout === "duo" ? "left" : layout === "right" ? "right" : "center";
    settings.hiddenPositions = [];
    settings.visibleCards = layout === "single" ? 1 : layout === "duo" ? 2 : layout === "center" && id === "desktop" ? 5 : 3;
  }
  next.direction = layout === "right" ? "reverse" : "forward";
  next.autoplay = true;
  next.loop = true;
  next.autoplayMs = next.autoplayMs || 6500;
  next.preset = "custom";
  return next;
}
