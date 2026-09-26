import type { MetadataRoute } from "next";

import {
  getPublicGames,
} from "@/lib/games/public-catalog";
import {
  getPublicGameCollections,
} from "@/lib/collections/public-game-collections";
import {
  gamePlatformIds,
} from "@/lib/games/releases";
import {
  getPublicPlatformCatalog,
} from "@/lib/platforms/public-platform-catalog";
import {
  getPublicSoftware,
} from "@/lib/software/public-software";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [
    games,
    collections,
    platforms,
    software,
  ] = await Promise.all([
    getPublicGames(),
    getPublicGameCollections(),
    getPublicPlatformCatalog(),
    getPublicSoftware(),
  ]);
  const gameEntries: MetadataRoute.Sitemap = games.map(
    (game) => ({
      url: absoluteUrl(`/juegos/${game.slug}`),
      changeFrequency: "weekly",
      priority: 0.75,
    })
  );

  const activePlatformIds = new Set(
    games.flatMap((game) =>
      gamePlatformIds(game)
    )
  );
  const collectionEntries: MetadataRoute.Sitemap = [
    ...collections.map((collection) => ({
      url: absoluteUrl(
        `/colecciones/${collection.slug}`
      ),
      changeFrequency: "weekly" as const,
      priority: 0.72,
    })),
    ...platforms.platforms
      .filter(
        (platform) =>
          platform.active &&
          activePlatformIds.has(platform.id)
      )
      .map((platform) => ({
        url: absoluteUrl(
          `/colecciones/${platform.id}`
        ),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
  ];
  const softwareEntries: MetadataRoute.Sitemap =
    software.map((item) => ({
      url: absoluteUrl(
        `/programas/${item.slug}`
      ),
      changeFrequency: "weekly" as const,
      priority: 0.68,
    }));

  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/juegos"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/requisitos"),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: absoluteUrl("/actualizaciones"),
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: absoluteUrl("/colecciones"),
      changeFrequency: "daily",
      priority: 0.82,
    },
    {
      url: absoluteUrl("/programas"),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/quienes-somos"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...gameEntries,
    ...collectionEntries,
    ...softwareEntries,
  ];
}
