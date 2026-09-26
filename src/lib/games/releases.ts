import type {
  DistributionPackage,
  Game,
  GamePlatform,
  GameRelease,
} from "@/types/game";
import type {
  PlatformCatalog,
  PlatformDefinition,
} from "@/types/platform";

const legacyPlatformIds: Record<
  GamePlatform,
  string
> = {
  PC: "pc-windows",
  PlayStation: "playstation",
  Xbox: "xbox",
  "Nintendo Switch": "switch",
};

function legacyPackage(
  game: Game
): DistributionPackage | null {
  const download = game.download;

  if (!download) return null;

  const sources = download.sources?.length
    ? download.sources
    : download.href
      ? [
          {
            id: "primary",
            name: "Descarga principal",
            href: download.href,
            ...(download.label
              ? { label: download.label }
              : {}),
            enabled: true,
            status: "available" as const,
          },
        ]
      : undefined;

  if (!sources?.length) return null;

  return {
    id: "legacy-main",
    kind: "other",
    ...(download.label
      ? { label: download.label }
      : {}),
    ...(download.sizeGb
      ? { sizeGb: download.sizeGb }
      : {}),
    ...(download.fileCount
      ? { fileCount: download.fileCount }
      : {}),
    ...(game.distributionMetadata?.channel
      ? {
          channel:
            game.distributionMetadata.channel,
        }
      : {}),
    ...(game.distributionMetadata?.checksumSha256
      ? {
          checksumSha256:
            game.distributionMetadata
              .checksumSha256,
        }
      : {}),
    sources,
  };
}

export function resolveGameReleases(
  game: Game
): GameRelease[] {
  if (game.releases?.length) {
    return game.releases;
  }

  const platformIds = (
    game.platforms ?? []
  ).map(
    (platform) =>
      legacyPlatformIds[platform]
  );

  const download =
    legacyPackage(game);

  return platformIds.map(
    (platformId, index) => ({
      id: platformId,
      platformId,
      ...(game.releaseDate
        ? {
            releaseDate:
              game.releaseDate,
          }
        : {}),
      ...(index === 0 &&
      game.version
        ? { version: game.version }
        : {}),
      ...(platformId ===
        "pc-windows" &&
      game.requirements
        ? {
            requirements:
              game.requirements,
          }
        : {}),
      ...(platformId ===
        "pc-windows" &&
      game.performance
        ? {
            performance:
              game.performance,
          }
        : {}),
      ...(platformId ===
        "pc-windows" &&
      game.performanceMetadata
        ? {
            performanceMetadata:
              game.performanceMetadata,
          }
        : {}),
      ...(index === 0 &&
      download
        ? {
            packages: [
              download,
            ],
          }
        : {}),
    })
  );
}

export function resolveGameRelease(
  game: Game,
  releaseId: string
) {
  return resolveGameReleases(
    game
  ).find(
    (release) =>
      release.id === releaseId
  );
}

export function resolvePcRelease(
  game: Game
) {
  return resolveGameReleases(
    game
  ).find(
    (release) =>
      release.platformId ===
      "pc-windows"
  );
}

export function gamePlatformIds(
  game: Game
) {
  return Array.from(
    new Set(
      resolveGameReleases(
        game
      ).map(
        (release) =>
          release.platformId
      )
    )
  );
}

export function availablePackages(
  release: GameRelease
) {
  return (
    release.packages ?? []
  ).filter(
    (item) =>
      item.enabled !== false &&
      (
        item.sources ?? []
      ).some(
        (source) =>
          source.enabled !==
            false &&
          source.status !==
            "down" &&
          source.status !==
            "maintenance"
      )
  );
}

export function releaseHasDownload(
  release: GameRelease
) {
  return (
    availablePackages(
      release
    ).length > 0
  );
}

export function gameHasDownload(
  game: Game
) {
  return resolveGameReleases(
    game
  ).some(
    releaseHasDownload
  );
}

export function platformDefinition(
  catalog: PlatformCatalog,
  platformId: string
): PlatformDefinition | null {
  return (
    catalog.platforms.find(
      (platform) =>
        platform.id ===
        platformId
    ) ?? null
  );
}

export function platformLabel(
  catalog: PlatformCatalog,
  platformId: string
) {
  const platform =
    platformDefinition(
      catalog,
      platformId
    );

  return (
    platform?.shortName ||
    platform?.name ||
    platformId
  );
}
