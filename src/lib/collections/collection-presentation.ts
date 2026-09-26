import type {
  Game,
} from "@/types/game";
import type {
  PlatformCatalog,
  PlatformDefinition,
  PlatformFamily,
} from "@/types/platform";

export type PlatformCollectionGroup = {
  family: PlatformFamily;
  platforms: PlatformDefinition[];
};

export function orderCollectionGames(
  games: readonly Game[],
  gameSlugs: readonly string[]
) {
  const bySlug = new Map(
    games.map((game) => [
      game.slug,
      game,
    ])
  );

  return gameSlugs
    .map((slug) => bySlug.get(slug))
    .filter(
      (game): game is Game =>
        game !== undefined
    );
}

export function groupCollectionPlatforms(
  catalog: PlatformCatalog,
  counts: ReadonlyMap<string, number>
): PlatformCollectionGroup[] {
  const activeFamilies =
    catalog.families
      .filter((family) => family.active)
      .sort(
        (left, right) =>
          left.order - right.order ||
          left.name.localeCompare(
            right.name,
            "es"
          )
      );

  return activeFamilies
    .map((family) => ({
      family,
      platforms:
        catalog.platforms
          .filter(
            (platform) =>
              platform.active &&
              platform.familyId ===
                family.id &&
              (counts.get(
                platform.id
              ) ?? 0) > 0
          )
          .sort(
            (left, right) =>
              left.order -
                right.order ||
              left.name.localeCompare(
                right.name,
                "es"
              )
          ),
    }))
    .filter(
      (group) =>
        group.platforms.length >
        0
    );
}
