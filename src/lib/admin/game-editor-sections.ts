export const gameEditorSections = [
  { id: "ficha", label: "Información" },
  { id: "datos", label: "Clasificación" },
  { id: "requisitos", label: "Requisitos" },
  { id: "rendimiento", label: "Rendimiento" },
  { id: "multimedia", label: "Multimedia" },
  { id: "descargas", label: "Plataformas y descargas" },
  { id: "valoracion", label: "Valoración" },
] as const;

export type GameEditorSection =
  (typeof gameEditorSections)[number]["id"];

const gameEditorSectionIds = new Set<GameEditorSection>(
  gameEditorSections.map((section) => section.id)
);

export function resolveGameEditorSection(
  value: string | string[] | undefined
): GameEditorSection {
  const candidate = Array.isArray(value) ? value[0] : value;

  return candidate && gameEditorSectionIds.has(candidate as GameEditorSection)
    ? (candidate as GameEditorSection)
    : "ficha";
}

export function getGameEditorSection(
  id: GameEditorSection
) {
  return gameEditorSections.find((section) => section.id === id)!;
}

export const gameReadinessSections = gameEditorSections;
