import type { HomeSectionConfig } from "../../data/home-config";

export const homeGameRowSectionIds = [
  "popular",
  "recent",
  "lowSpec",
  "recommended",
] as const;

export type HomeGameRowSectionId =
  (typeof homeGameRowSectionIds)[number];

export const homeCardRevealModes = [
  "interaction",
  "static-detail",
] as const;

export type HomeCardRevealMode =
  (typeof homeCardRevealModes)[number];

export type HomeCardRevealModes = Record<
  HomeGameRowSectionId,
  HomeCardRevealMode
>;

type HomeSectionWithCardReveal = HomeSectionConfig & {
  cardRevealMode?: HomeCardRevealMode;
};

export function isHomeGameRowSectionId(
  value: string
): value is HomeGameRowSectionId {
  return homeGameRowSectionIds.some((id) => id === value);
}

export function isHomeCardRevealMode(
  value: unknown
): value is HomeCardRevealMode {
  return homeCardRevealModes.some((mode) => mode === value);
}

export function explicitHomeCardRevealMode(
  section: HomeSectionConfig
): HomeCardRevealMode | undefined {
  if (!isHomeGameRowSectionId(section.id)) return undefined;

  const mode = (section as HomeSectionWithCardReveal).cardRevealMode;
  return isHomeCardRevealMode(mode) ? mode : undefined;
}

export function resolveHomeCardRevealMode(
  section: HomeSectionConfig
): HomeCardRevealMode {
  return explicitHomeCardRevealMode(section) ?? "interaction";
}

export function homeCardRevealModesFromSections(
  sections: HomeSectionConfig[]
): HomeCardRevealModes {
  const byId = new Map(sections.map((section) => [section.id, section]));

  return {
    popular: resolveHomeCardRevealMode(
      byId.get("popular") ?? { id: "popular", visible: true }
    ),
    recent: resolveHomeCardRevealMode(
      byId.get("recent") ?? { id: "recent", visible: true }
    ),
    lowSpec: resolveHomeCardRevealMode(
      byId.get("lowSpec") ?? { id: "lowSpec", visible: true }
    ),
    recommended: resolveHomeCardRevealMode(
      byId.get("recommended") ?? { id: "recommended", visible: true }
    ),
  };
}

export function withHomeCardRevealMode(
  section: HomeSectionConfig,
  mode: HomeCardRevealMode
): HomeSectionConfig {
  if (!isHomeGameRowSectionId(section.id)) {
    return { ...section };
  }

  return {
    ...section,
    cardRevealMode: mode,
  } as HomeSectionConfig;
}

/**
 * Presentación posee orden/visibilidad y el editor de filas posee el reveal.
 * Al guardar ambos slices, una presentación que no transporte el campo nuevo
 * conserva la intención editorial actual en vez de resetearla silenciosamente.
 */
export function mergeHomeCardRevealModes(
  currentSections: HomeSectionConfig[],
  nextSections: HomeSectionConfig[]
): HomeSectionConfig[] {
  const currentById = new Map(
    currentSections.map((section) => [section.id, section])
  );

  return nextSections.map((section) => {
    if (!isHomeGameRowSectionId(section.id)) {
      return { ...section };
    }

    const nextMode = explicitHomeCardRevealMode(section);
    const currentMode = resolveHomeCardRevealMode(
      currentById.get(section.id) ?? section
    );

    return withHomeCardRevealMode(
      section,
      nextMode ?? currentMode
    );
  });
}
