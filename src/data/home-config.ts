export const homeSectionIds = [
  "hero",
  "popular",
  "finder",
  "classifications",
  "recent",
  "updates",
  "lowSpec",
  "recommended",
  "trust",
] as const;

export type HomeSectionId =
  (typeof homeSectionIds)[number];

export type HomeSectionConfig = {
  id: HomeSectionId;
  visible: boolean;
};

export const homeCurationCollectionIds = [
  "hero",
  "popular",
  "lowSpec",
  "recommended",
] as const;

export type HomeCurationCollectionId =
  (typeof homeCurationCollectionIds)[number];

export type HomeCurationMode =
  | "manual"
  | "automatic"
  | "hybrid";

export type HomeCurationConfig = Record<
  HomeCurationCollectionId,
  {
    mode: HomeCurationMode;
  }
>;

export type HomeCopy = {
  hero: {
    accessibleTitle: string;
    primaryCta: string;
    secondaryCta: string;
  };
  popular: {
    title: string;
    highlight: string;
    linkLabel: string;
  };
  finder: {
    eyebrow: string;
    title: string;
    highlight: string;
    text: string;
    features: [string, string, string];
    cta: string;
  };
  classifications: {
    title: string;
    highlight: string;
    linkLabel: string;
  };
  recent: {
    title: string;
    highlight: string;
    linkLabel: string;
  };
  updates: {
    title: string;
    highlight: string;
    linkLabel: string;
    badgeLabel: string;
    detailsLabel: string;
  };
  lowSpec: {
    eyebrow: string;
    title: string;
    highlight: string;
    text: string;
    cta: string;
    optionTitles: [string, string, string, string];
    optionSubtitles: [string, string, string, string];
    listTitle: string;
    listHighlight: string;
    listLinkLabel: string;
  };
  recommended: {
    eyebrow: string;
    title: string;
    highlight: string;
    text: string;
    linkLabel: string;
  };
  trust: {
    items: [
      { title: string; text: string },
      { title: string; text: string },
      { title: string; text: string },
      { title: string; text: string },
    ];
  };
};

export const homeHeroCompositionIds = [
  "studio",
  "cinema",
  "focus",
] as const;

export const homeHeroPresetIds = [
  "classic", "cinema", "minimal", "spotlight", "cards", "custom",
] as const;

export const homeHeroLegacyPresetIds = [
  "coverflow", "stack", "arc", "perspective",
] as const;

export const homeHeroMotionStyleIds = [
  "momentum",
  "morph",
  "parallax",
] as const;

export const homeHeroNavigationStyleIds = [
  "segmented-pro",
  "integrated",
  "pills",
  "dots",
  "timeline",
  "minimal",
  "glass",
  "rail",
] as const;

export const homeHeroArrowIconIds = [
  "chevron",
  "arrow",
  "double-chevron",
  "long-arrow",
  "triangle",
] as const;

export const homeHeroArrowShapeIds = [
  "circle",
  "rounded",
  "square",
  "none",
] as const;

export type HomeHeroDevice = "desktop" | "tablet" | "mobile";
export type HomeHeroPosition = "all" | "main" | "left1" | "left2" | "right1" | "right2";
export type HomeHeroMotionStyle = (typeof homeHeroMotionStyleIds)[number];
export type HomeHeroNavigationStyle = (typeof homeHeroNavigationStyleIds)[number];
export type HomeHeroArrowIcon = (typeof homeHeroArrowIconIds)[number];
export type HomeHeroArrowShape = (typeof homeHeroArrowShapeIds)[number];

export type HomeHeroPositionStyle = {
  scale: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  translateX: number;
  translateY: number;
  translateZ: number;
  opacity: number;
  blur: number;
  brightness: number;
  contrast: number;
  saturation: number;
};

export type HomeHeroResponsiveStyle = {
  visibleCards: 1 | 2 | 3 | 4 | 5;
  alignment?: "left" | "center" | "right";
  hiddenPositions?: Array<Exclude<HomeHeroPosition, "all" | "main">>;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  perspective: number;
  spaceBefore: number;
  spaceAfter: number;
  spacingReference: "visual" | "canvas";
};

export type HomeHeroNavigationPlacement = {
  x: number;
  y: number;
  scale: number;
};

export type HomeHeroArrowPlacement = {
  inset: number;
  y: number;
  scale: number;
};

export type HomeHeroNavigationConfig = {
  style: HomeHeroNavigationStyle;
  showIndicators: boolean;
  showPause: boolean;
  showProgress: boolean;
  arrowIcon: HomeHeroArrowIcon;
  arrowShape: HomeHeroArrowShape;
  responsive: Record<HomeHeroDevice, HomeHeroNavigationPlacement>;
  arrowResponsive: Record<HomeHeroDevice, HomeHeroArrowPlacement>;
};

export type HomeHeroBasePresentation = {
  composition: (typeof homeHeroCompositionIds)[number];
  previewCount: 1 | 2 | 3;
  motionStyle: HomeHeroMotionStyle;
  autoplayMs: 0 | 4000 | 6500 | 8000;
  preset: (typeof homeHeroPresetIds)[number];
  radius: number;
  shadow: number;
  borderWidth: number;
  glow: number;
  overlay: number;
  autoplay: boolean;
  loop: boolean;
  pauseOnHover: boolean;
  drag: boolean;
  touch: boolean;
  keyboard: boolean;
  wheel: boolean;
  direction: "forward" | "reverse";
  positions: Record<HomeHeroPosition, HomeHeroPositionStyle>;
  responsive: Record<HomeHeroDevice, HomeHeroResponsiveStyle>;
  navigation: HomeHeroNavigationConfig;
};

export type HomeHeroPresentation = HomeHeroBasePresentation & {
  deviceOverrides?: Partial<Record<HomeHeroDevice, HomeHeroBasePresentation>>;
};

export type HomeHeroBasePresentationInput = Omit<
  Partial<HomeHeroBasePresentation>,
  "positions" | "responsive" | "navigation" | "preset"
> & {
  preset?:
    | (typeof homeHeroPresetIds)[number]
    | (typeof homeHeroLegacyPresetIds)[number];
  // Compatibility-only fields accepted from historical revisions. They are
  // normalized into `motionStyle` and are never written by the current editor.
  motion?: "depth" | "slide" | "fade";
  motionEngine?: "legacy" | "physical";
  transition?:
    | "slide"
    | "coverflow"
    | "fade"
    | "3d"
    | "stack"
    | "perspective"
    | "custom";
  durationMs?: number;
  easing?: "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear";
  positions?: Partial<Record<HomeHeroPosition, HomeHeroPositionStyle>>;
  responsive?: Partial<Record<HomeHeroDevice, Partial<HomeHeroResponsiveStyle>>>;
  navigation?: Partial<
    Omit<HomeHeroNavigationConfig, "responsive" | "arrowResponsive">
  > & {
    responsive?: Partial<
      Record<HomeHeroDevice, Partial<HomeHeroNavigationPlacement>>
    >;
    arrowResponsive?: Partial<
      Record<HomeHeroDevice, Partial<HomeHeroArrowPlacement>>
    >;
  };
};

export type HomeHeroPresentationInput = HomeHeroBasePresentationInput & {
  deviceOverrides?: Partial<
    Record<HomeHeroDevice, HomeHeroBasePresentationInput>
  >;
};

export type HomeConfig = {
  /*
   * Estas listas conservan compatibilidad con todas las revisiones ya
   * publicadas. En modo manual representan la selección exacta; en híbrido
   * son los juegos fijados por el editor; en automático se conservan pero el
   * ranking decide la colección visible.
   */
  heroSlugs: string[];
  popularSlugs: string[];
  lowSpecSlugs: string[];
  recommendedSlugs: string[];
  curation?: HomeCurationConfig;
  heroPresentation?: HomeHeroPresentationInput;
  sections?: HomeSectionConfig[];
  copy?: HomeCopy;
};

export type ResolvedHomeConfig = Omit<
  HomeConfig,
  "curation" | "heroPresentation" | "sections" | "copy"
> & {
  curation: HomeCurationConfig;
  heroPresentation: HomeHeroPresentation;
  sections: HomeSectionConfig[];
  copy: HomeCopy;
};

/*
 * Las revisiones antiguas no guardaban `curation`. Hero, Populares y
 * Recomendados funcionaban como prioridades + relleno automático; por eso se
 * resuelven como híbridos. Bajos recursos nunca se rellenaba arbitrariamente.
 */
const defaultHomeCuration: HomeCurationConfig = {
  hero: { mode: "hybrid" },
  popular: { mode: "hybrid" },
  lowSpec: { mode: "manual" },
  recommended: { mode: "hybrid" },
};

const defaultHeroPresentation: HomeHeroPresentation = {
  composition: "studio",
  previewCount: 2,
  motionStyle: "momentum",
  autoplayMs: 6500,
  preset: "cinema",
  radius: 18,
  shadow: 55,
  borderWidth: 1,
  glow: 18,
  overlay: 48,
  autoplay: true,
  loop: true,
  pauseOnHover: true,
  drag: true,
  touch: true,
  keyboard: true,
  wheel: false,
  direction: "forward",
  positions: {
    all: { scale: 1, rotateX: 0, rotateY: 0, rotateZ: 0, translateX: 0, translateY: 0, translateZ: 0, opacity: 100, blur: 0, brightness: 100, contrast: 100, saturation: 100 },
    main: { scale: 1, rotateX: 0, rotateY: 0, rotateZ: 0, translateX: 0, translateY: 0, translateZ: 80, opacity: 100, blur: 0, brightness: 100, contrast: 100, saturation: 105 },
    left1: { scale: .82, rotateX: 0, rotateY: 16, rotateZ: 0, translateX: -74, translateY: 8, translateZ: -100, opacity: 72, blur: 0, brightness: 72, contrast: 105, saturation: 78 },
    left2: { scale: .68, rotateX: 0, rotateY: 22, rotateZ: 0, translateX: -126, translateY: 15, translateZ: -180, opacity: 42, blur: 1, brightness: 58, contrast: 105, saturation: 62 },
    right1: { scale: .82, rotateX: 0, rotateY: -16, rotateZ: 0, translateX: 74, translateY: 8, translateZ: -100, opacity: 72, blur: 0, brightness: 72, contrast: 105, saturation: 78 },
    right2: { scale: .68, rotateX: 0, rotateY: -22, rotateZ: 0, translateX: 126, translateY: 15, translateZ: -180, opacity: 42, blur: 1, brightness: 58, contrast: 105, saturation: 62 },
  },
  responsive: {
    desktop: { visibleCards: 5, cardWidth: 1000, cardHeight: 450, gap: 24, perspective: 1200, spaceBefore: 28, spaceAfter: 58, spacingReference: "visual" },
    tablet: { visibleCards: 3, cardWidth: 760, cardHeight: 420, gap: 18, perspective: 1000, spaceBefore: 20, spaceAfter: 58, spacingReference: "visual" },
    mobile: { visibleCards: 3, cardWidth: 330, cardHeight: 500, gap: 12, perspective: 800, spaceBefore: 14, spaceAfter: 38, spacingReference: "visual" },
  },
  navigation: {
    style: "segmented-pro",
    showIndicators: true,
    showPause: true,
    showProgress: true,
    arrowIcon: "chevron",
    arrowShape: "circle",
    responsive: {
      desktop: { x: 50, y: 91, scale: 100 },
      tablet: { x: 50, y: 91, scale: 100 },
      mobile: { x: 50, y: 92, scale: 92 },
    },
    arrowResponsive: {
      desktop: { inset: -4, y: 50, scale: 100 },
      tablet: { inset: 0, y: 50, scale: 100 },
      mobile: { inset: 0, y: 46, scale: 100 },
    },
  },
};

export const sourceHomeConfig: ResolvedHomeConfig = {
  heroSlugs: [
    "dragon-ball-sparking-zero",
    "god-of-war-ragnarok",
    "forza-horizon-5",
    "resident-evil-4",
    "cyberpunk-2077",
  ],
  popularSlugs: [
    "god-of-war-ragnarok",
    "elden-ring",
    "forza-horizon-5",
    "resident-evil-4",
    "hogwarts-legacy",
    "cyberpunk-2077",
    "baldurs-gate-3",
  ],
  lowSpecSlugs: [
    "minecraft-java-edition",
    "left-4-dead-2",
    "gta-san-andreas",
    "terraria",
    "half-life-2",
    "portal-2",
    "stardew-valley",
  ],
  recommendedSlugs: [
    "cyberpunk-2077",
    "baldurs-gate-3",
    "red-dead-redemption-2",
    "lies-of-p",
    "armored-core-vi",
    "god-of-war-ragnarok",
    "elden-ring",
  ],
  curation: {
    ...structuredClone(defaultHomeCuration),
    popular: { mode: "manual" },
  },
  heroPresentation: structuredClone(defaultHeroPresentation),
  sections: homeSectionIds.map((id) => ({
    id,
    visible: true,
  })),
  copy: {
    hero: {
      accessibleTitle: "Descubre juegos para PC",
      primaryCta: "Ver juego",
      secondaryCta: "Más información",
    },
    popular: {
      title: "JUEGOS",
      highlight: "SELECCIONADOS",
      linkLabel: "Ver catálogo",
    },
    finder: {
      eyebrow: "COMPATIBILIDAD DE JUEGOS",
      title: "¿Buscas algo que",
      highlight: "funcione en tu PC?",
      text:
        "Detectamos lo que tu navegador permita identificar y, si falta algún dato, completas CPU, GPU y RAM. Sólo mostramos FPS cuando el juego tiene una calibración publicada.",
      features: [
        "Detección local",
        "FPS con calibración",
        "Configuración manual",
      ],
      cta: "Descubrir qué puedo jugar",
    },
    classifications: {
      title: "CLASIFICACIONES",
      highlight: "DESTACADAS",
      linkLabel: "Ver todo el catálogo",
    },
    recent: {
      title: "LANZAMIENTOS",
      highlight: "MÁS RECIENTES",
      linkLabel: "Ver por fecha",
    },
    updates: {
      title: "ÚLTIMAS",
      highlight: "ACTUALIZACIONES",
      linkLabel: "Ver todas las actualizaciones",
      badgeLabel: "ACTUALIZADO",
      detailsLabel: "Ver juego",
    },
    lowSpec: {
      eyebrow: "SEGÚN TU EQUIPO",
      title: "Encuentra juegos para",
      highlight: "tu PC",
      text:
        "Explora el catálogo usando requisitos publicados y, cuando exista una calibración del juego, estimaciones orientativas de rendimiento.",
      cta: "Probar recomendador",
      optionTitles: [
        "Bajos recursos",
        "Con requisitos cargados",
        "Mejor puntuados",
        "Lanzamientos recientes",
      ],
      optionSubtitles: [
        "Según la RAM mínima publicada",
        "Compara memoria, gráficos y sistema",
        "Disponible cuando existen valoraciones",
        "Ordenados por fecha de lanzamiento",
      ],
      listTitle: "JUEGOS CON REQUISITOS",
      listHighlight: "DE BAJOS RECURSOS",
      listLinkLabel: "Ver todos",
    },
    recommended: {
      eyebrow: "PARA DESCUBRIR",
      title: "JUEGOS",
      highlight: "RECOMENDADOS",
      text:
        "Una selección editorial para explorar el catálogo sin presentar métricas que no estén respaldadas.",
      linkLabel: "Ver catálogo",
    },
    trust: {
      items: [
        {
          title: "Versiones identificadas",
          text:
            "Cuando un juego tiene una versión registrada, la mostramos junto con su información.",
        },
        {
          title: "Requisitos claros",
          text:
            "Cuando hay requisitos disponibles, puedes consultarlos rápidamente desde el catálogo.",
        },
        {
          title: "Contenido organizado",
          text: "Cada juego, versión y actualización en su lugar.",
        },
        {
          title: "Rápido y directo",
          text:
            "Menos vueltas y más tiempo descubriendo qué jugar.",
        },
      ],
    },
  },
};

function resolveSections(
  sections: HomeSectionConfig[] | undefined
) {
  const known = new Set<HomeSectionId>();
  const ordered: HomeSectionConfig[] = [];

  for (const section of sections ?? []) {
    if (
      !homeSectionIds.includes(section.id) ||
      known.has(section.id)
    ) {
      continue;
    }

    known.add(section.id);
    ordered.push({ ...section });
  }

  for (const section of sourceHomeConfig.sections) {
    if (!known.has(section.id)) {
      ordered.push({ ...section });
    }
  }

  return ordered;
}

function resolveCuration(
  curation: HomeCurationConfig | undefined
): HomeCurationConfig {
  return {
    hero: {
      ...defaultHomeCuration.hero,
      ...curation?.hero,
    },
    popular: {
      ...defaultHomeCuration.popular,
      ...curation?.popular,
    },
    lowSpec: {
      ...defaultHomeCuration.lowSpec,
      ...curation?.lowSpec,
    },
    recommended: {
      ...defaultHomeCuration.recommended,
      ...curation?.recommended,
    },
  };
}

function normalizeHeroPreset(
  preset: HomeHeroBasePresentationInput["preset"] | undefined
): HomeHeroBasePresentation["preset"] {
  if (!preset) return defaultHeroPresentation.preset;
  if (homeHeroPresetIds.includes(preset as HomeHeroBasePresentation["preset"])) {
    return preset as HomeHeroBasePresentation["preset"];
  }
  if (preset === "stack" || preset === "arc") return "cinema";
  return "classic";
}

function legacyMotionStyle(
  presentation: HomeHeroPresentationInput | undefined
): HomeHeroMotionStyle {
  if (presentation?.motionStyle) return presentation.motionStyle;

  const legacyTransition = presentation?.transition;
  if (legacyTransition === "coverflow" || legacyTransition === "3d" || legacyTransition === "perspective") {
    return "morph";
  }
  if (legacyTransition === "fade" || legacyTransition === "stack" || legacyTransition === "custom") {
    return "parallax";
  }
  return "momentum";
}

function resolveHeroPresentation(
  presentation: HomeHeroPresentationInput | undefined
): HomeHeroPresentation {
  const {
    motion: _legacyMotion,
    motionEngine: _legacyMotionEngine,
    transition: _legacyTransition,
    durationMs: _legacyDuration,
    easing: _legacyEasing,
    deviceOverrides: sourceDeviceOverrides,
    preset: sourcePreset,
    ...currentPresentation
  } = presentation ?? {};
  void _legacyMotion;
  void _legacyMotionEngine;
  void _legacyTransition;
  void _legacyDuration;
  void _legacyEasing;

  const resolved: HomeHeroPresentation = {
    ...defaultHeroPresentation,
    ...currentPresentation,
    preset: normalizeHeroPreset(sourcePreset),
    motionStyle: legacyMotionStyle(presentation),
    positions: {
      ...defaultHeroPresentation.positions,
      ...presentation?.positions,
    },
    responsive: {
      desktop: {
        ...defaultHeroPresentation.responsive.desktop,
        ...presentation?.responsive?.desktop,
      },
      tablet: {
        ...defaultHeroPresentation.responsive.tablet,
        ...presentation?.responsive?.tablet,
      },
      mobile: {
        ...defaultHeroPresentation.responsive.mobile,
        ...presentation?.responsive?.mobile,
      },
    },
    navigation: {
      ...defaultHeroPresentation.navigation,
      ...presentation?.navigation,
      responsive: {
        desktop: {
          ...defaultHeroPresentation.navigation.responsive.desktop,
          ...presentation?.navigation?.responsive?.desktop,
        },
        tablet: {
          ...defaultHeroPresentation.navigation.responsive.tablet,
          ...presentation?.navigation?.responsive?.tablet,
        },
        mobile: {
          ...defaultHeroPresentation.navigation.responsive.mobile,
          ...presentation?.navigation?.responsive?.mobile,
        },
      },
      arrowResponsive: {
        desktop: {
          ...defaultHeroPresentation.navigation.arrowResponsive.desktop,
          ...presentation?.navigation?.arrowResponsive?.desktop,
        },
        tablet: {
          ...defaultHeroPresentation.navigation.arrowResponsive.tablet,
          ...presentation?.navigation?.arrowResponsive?.tablet,
        },
        mobile: {
          ...defaultHeroPresentation.navigation.arrowResponsive.mobile,
          ...presentation?.navigation?.arrowResponsive?.mobile,
        },
      },
    },
  };

  // Before `autoplay` existed, an interval of zero was the persisted way to
  // express manual playback. Preserve that semantic instead of inheriting the
  // new default `autoplay: true` and presenting contradictory editor state.
  if (resolved.autoplayMs === 0) {
    resolved.autoplay = false;
  }

  if (sourceDeviceOverrides) {
    resolved.deviceOverrides = {};
    for (const device of ["desktop", "tablet", "mobile"] as const) {
      const override = sourceDeviceOverrides[device];
      if (!override) continue;
      const normalized = resolveHeroPresentation({
        ...override,
        deviceOverrides: undefined,
      });
      const { deviceOverrides: _nested, ...base } = normalized;
      void _nested;
      resolved.deviceOverrides[device] = base;
    }
  }

  return resolved;
}

export function resolveHomeConfig(
  config: HomeConfig
): ResolvedHomeConfig {
  return {
    heroSlugs: [...config.heroSlugs],
    popularSlugs: [...config.popularSlugs],
    lowSpecSlugs: [...config.lowSpecSlugs],
    recommendedSlugs: [...config.recommendedSlugs],
    curation: resolveCuration(config.curation),
    heroPresentation: resolveHeroPresentation(config.heroPresentation),
    sections: resolveSections(config.sections),
    copy: config.copy
      ? {
          ...sourceHomeConfig.copy,
          ...config.copy,
        }
      : structuredClone(sourceHomeConfig.copy),
  };
}