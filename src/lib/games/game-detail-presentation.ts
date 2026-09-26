import {
  resolveGameDownload,
} from "@/lib/games/download";
import {
  gamePlatformIds,
  resolveGameReleases,
  resolvePcRelease,
} from "@/lib/games/releases";
import type {
  Game,
  GameAgeRatingSystem,
  GameHardwareRequirements,
  GameRequirements,
} from "@/types/game";

export type GameRequirementRow = {
  label: string;
  minimum?: string;
  recommended?: string;
};

function legacyMinimumRequirements(
  requirements: GameRequirements | undefined
): GameHardwareRequirements | undefined {
  if (!requirements) return undefined;

  return {
    system: requirements.system,
    processor: requirements.processor,
    ram: requirements.ram,
    graphics: requirements.graphics,
    storage: requirements.storage,
  };
}

function buildRequirementRows(
  minimum: GameHardwareRequirements | undefined,
  recommended: GameHardwareRequirements | undefined
): GameRequirementRow[] {
  const fields: Array<{
    key: keyof GameHardwareRequirements;
    label: string;
  }> = [
    { key: "system", label: "Sistema operativo" },
    { key: "processor", label: "Procesador" },
    { key: "ram", label: "Memoria RAM" },
    { key: "graphics", label: "Gráficos" },
    { key: "storage", label: "Almacenamiento" },
  ];

  return fields
    .map(({ key, label }) => ({
      label,
      minimum: minimum?.[key],
      recommended: recommended?.[key],
    }))
    .filter(
      (row) => row.minimum || row.recommended
    );
}

function ageRatingSystemLabel(
  system: GameAgeRatingSystem
) {
  if (system === "CLASSIND") return "ClassInd";
  if (system === "OTHER") return "Otro sistema";
  return system;
}

export function resolveGameDetailPresentation(
  game: Game
) {
  const download = resolveGameDownload(game);
  const pcRelease = resolvePcRelease(game);
  const requirements =
    pcRelease?.requirements;
  const minimum =
    requirements?.minimum ??
    legacyMinimumRequirements(requirements);
  const recommended =
    requirements?.recommended;
  const requirementRows = buildRequirementRows(
    minimum,
    recommended
  );

  const releases =
    resolveGameReleases(game);
  const platformIds =
    gamePlatformIds(game);
  const platforms =
    game.platforms ?? [];
  const platformLabel =
    platforms.length
      ? platforms.join(", ")
      : platformIds.length
        ? platformIds.join(", ")
        : "A confirmar";

  const genres =
    game.genres?.length
      ? game.genres
      : [game.category];
  const genreSummaryLabel = genres
    .slice(0, 2)
    .join(", ");

  const visibleTags = Array.from(
    new Set([
      ...genres,
      ...(game.tags ?? []),
    ])
  )
    .filter((tag) => tag !== game.category)
    .slice(0, 5);

  const ageRatingLabel = game.ageRating
    ? `${ageRatingSystemLabel(game.ageRating.system)} · ${game.ageRating.rating}`
    : null;

  const sizeLabel = download?.sizeGb
    ? `${download.sizeGb} GB`
    : minimum?.storage ??
      recommended?.storage ??
      "A confirmar";

  return {
    download,
    minimum,
    recommended,
    requirementRows,
    platforms,
    platformLabel,
    genres,
    genreSummaryLabel,
    visibleTags,
    ageRatingLabel,
    sizeLabel,
    platformIds,
    releases,
    pcRelease,
    versionLabel:
      releases.find(
        (release) =>
          release.version
      )?.version ??
      game.version ??
      "A confirmar",
  };
}
