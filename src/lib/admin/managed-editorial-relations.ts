import "server-only";

import type {
  PoolClient,
} from "pg";

import {
  resolveGameReleases,
} from "@/lib/games/releases";

import {
  adminQuery,
} from "./database";
import {
  parseEditorialPayload,
} from "./content-validation";
import type {
  Game,
  GameRelease,
} from "@/types/game";
import type {
  PlatformCatalog,
} from "@/types/platform";
import type {
  Software,
} from "@/types/software";

type PayloadRow = {
  item_key: string;
  item_type?: "game" | "software";
  draft_payload: unknown;
  published_payload?: unknown;
  public_visible?: boolean;
};

async function draftPlatformCatalog() {
  const result =
    await adminQuery<PayloadRow>(
      `SELECT
         item_key,
         draft_payload
       FROM deuna_admin.editorial_items
       WHERE item_type = 'platform_catalog'
         AND item_key = 'platforms'
       LIMIT 1`
    );
  const row = result.rows[0];

  return row
    ? parseEditorialPayload(
        "platform_catalog",
        row.draft_payload
      )
    : null;
}

export async function validatePlatformIds(
  ids: readonly string[]
) {
  const catalog =
    await draftPlatformCatalog();

  if (!catalog) {
    return {
      ok: false as const,
      missing: [...new Set(ids)],
    };
  }

  const known = new Set(
    catalog.platforms.map(
      (platform) =>
        platform.id
    )
  );
  const missing =
    [...new Set(ids)].filter(
      (id) =>
        !known.has(id)
    );

  return {
    ok:
      missing.length === 0,
    missing,
  };
}

export async function validateCollectionSlugNamespace(
  slug: string
) {
  const catalog =
    await draftPlatformCatalog();
  const conflicts =
    catalog?.platforms.some(
      (platform) =>
        platform.id === slug
    ) ?? false;

  return {
    ok: !conflicts,
  };
}

export async function validatePlatformCollectionNamespace(
  next: PlatformCatalog
) {
  const result =
    await adminQuery<{
      item_key: string;
    }>(
      `SELECT item_key
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game_collection'`
    );
  const collectionSlugs =
    new Set(
      result.rows.map(
        (row) =>
          row.item_key
      )
    );
  const conflicts =
    next.platforms
      .map(
        (platform) =>
          platform.id
      )
      .filter(
        (id) =>
          collectionSlugs.has(
            id
          )
      )
      .sort();

  return {
    ok:
      conflicts.length === 0,
    conflicts,
  };
}

export async function validateGameSlugs(
  slugs: readonly string[]
) {
  const result =
    await adminQuery<{
      item_key: string;
    }>(
      `SELECT item_key
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game'
         AND item_key = ANY($1::text[])`,
      [[...new Set(slugs)]]
    );
  const known = new Set(
    result.rows.map(
      (row) => row.item_key
    )
  );
  const missing =
    [...new Set(slugs)].filter(
      (slug) =>
        !known.has(slug)
    );

  return {
    ok:
      missing.length === 0,
    missing,
  };
}

export async function validateSoftwareSlugs(
  slugs: readonly string[]
) {
  const unique =
    [...new Set(slugs)];

  if (unique.length === 0) {
    return {
      ok: true as const,
      missing: [] as string[],
    };
  }

  const result =
    await adminQuery<{
      item_key: string;
    }>(
      `SELECT item_key
       FROM deuna_admin.editorial_items
       WHERE item_type = 'software'
         AND item_key = ANY($1::text[])`,
      [unique]
    );
  const known = new Set(
    result.rows.map(
      (row) => row.item_key
    )
  );
  const missing =
    unique.filter(
      (slug) =>
        !known.has(slug)
    );

  return {
    ok:
      missing.length === 0,
    missing,
  };
}

export async function validateGameReleaseRelations(
  releases: readonly GameRelease[]
) {
  const platformIds =
    releases.map(
      (release) =>
        release.platformId
    );
  const softwareSlugs =
    releases.flatMap(
      (release) =>
        release
          .recommendedSoftwareSlugs ??
        []
    );

  const [
    platforms,
    software,
  ] = await Promise.all([
    validatePlatformIds(
      platformIds
    ),
    validateSoftwareSlugs(
      softwareSlugs
    ),
  ]);

  return {
    ok:
      platforms.ok &&
      software.ok,
    missingPlatforms:
      platforms.missing,
    missingSoftware:
      software.missing,
  };
}

function softwarePlatformIds(
  software: Software
) {
  return [
    ...software
      .runsOnPlatformIds,
    ...(software
      .emulatesPlatformIds ??
      []),
    ...(software.packages ??
      []).map(
      (item) =>
        item.platformId
    ),
  ];
}

export async function validateSoftwareRelations(
  software: Software
) {
  return validatePlatformIds(
    softwarePlatformIds(
      software
    )
  );
}

function referencedPlatformIds(
  rows: readonly PayloadRow[],
  payloadKey:
    | "draft_payload"
    | "published_payload"
) {
  const referenced =
    new Set<string>();

  for (const row of rows) {
    const payload =
      row[payloadKey];

    if (!payload) {
      continue;
    }

    try {
      if (
        row.item_type ===
        "game"
      ) {
        const game =
          parseEditorialPayload(
            "game",
            payload
          );

        for (
          const release of
          resolveGameReleases(
            game
          )
        ) {
          referenced.add(
            release.platformId
          );
        }
        continue;
      }

      if (
        row.item_type ===
        "software"
      ) {
        const software =
          parseEditorialPayload(
            "software",
            payload
          );

        for (
          const id of
          softwarePlatformIds(
            software
          )
        ) {
          referenced.add(id);
        }
      }
    } catch {
      continue;
    }
  }

  return referenced;
}

function missingPlatformIds(
  next: PlatformCatalog,
  referenced: ReadonlySet<string>
) {
  const nextIds = new Set(
    next.platforms.map(
      (platform) =>
        platform.id
    )
  );

  return [...referenced]
    .filter(
      (id) =>
        !nextIds.has(id)
    )
    .sort();
}

export async function validatePlatformCatalogRemoval(
  next: PlatformCatalog
) {
  const result =
    await adminQuery<PayloadRow>(
      `SELECT
         item_key,
         item_type,
         draft_payload
       FROM deuna_admin.editorial_items
       WHERE item_type IN (
         'game',
         'software'
       )`
    );

  const missing =
    missingPlatformIds(
      next,
      referencedPlatformIds(
        result.rows,
        "draft_payload"
      )
    );

  return {
    ok:
      missing.length === 0,
    missing,
  };
}

async function publishedPlatformCatalog(
  client: PoolClient
) {
  const result =
    await client.query<{
      published_payload: unknown;
    }>(
      `SELECT
         published_payload
       FROM deuna_admin.editorial_items
       WHERE item_type = 'platform_catalog'
         AND item_key = 'platforms'
         AND public_visible = true
       LIMIT 1
       FOR SHARE`
    );
  const row = result.rows[0];

  return row
    ? parseEditorialPayload(
        "platform_catalog",
        row.published_payload
      )
    : null;
}

async function validatePublishedPlatformIds(
  client: PoolClient,
  ids: readonly string[]
) {
  const catalog =
    await publishedPlatformCatalog(
      client
    );
  const unique =
    [...new Set(ids)];

  if (!catalog) {
    return {
      ok:
        unique.length === 0,
      missing: unique,
    };
  }

  const known = new Set(
    catalog.platforms.map(
      (platform) =>
        platform.id
    )
  );
  const missing =
    unique.filter(
      (id) =>
        !known.has(id)
    );

  return {
    ok:
      missing.length === 0,
    missing,
  };
}

async function validatePublishedKeys(
  client: PoolClient,
  type:
    | "game"
    | "software",
  keys: readonly string[]
) {
  const unique =
    [...new Set(keys)];

  if (unique.length === 0) {
    return {
      ok: true as const,
      missing:
        [] as string[],
    };
  }

  const result =
    await client.query<{
      item_key: string;
    }>(
      `SELECT item_key
       FROM deuna_admin.editorial_items
       WHERE item_type = $1
         AND public_visible = true
         AND item_key = ANY($2::text[])
       FOR SHARE`,
      [
        type,
        unique,
      ]
    );
  const known = new Set(
    result.rows.map(
      (row) => row.item_key
    )
  );
  const missing =
    unique.filter(
      (key) =>
        !known.has(key)
    );

  return {
    ok:
      missing.length === 0,
    missing,
  };
}

export async function validatePublishedGameRelations(
  client: PoolClient,
  game: Game
) {
  const releases =
    resolveGameReleases(
      game
    );
  const platformIds =
    releases.map(
      (release) =>
        release.platformId
    );
  const softwareSlugs =
    releases.flatMap(
      (release) =>
        release
          .recommendedSoftwareSlugs ??
        []
    );
  const [
    platforms,
    software,
  ] = await Promise.all([
    validatePublishedPlatformIds(
      client,
      platformIds
    ),
    validatePublishedKeys(
      client,
      "software",
      softwareSlugs
    ),
  ]);

  return {
    ok:
      platforms.ok &&
      software.ok,
    missingPlatforms:
      platforms.missing,
    missingSoftware:
      software.missing,
  };
}

export function validatePublishedSoftwareRelations(
  client: PoolClient,
  software: Software
) {
  return validatePublishedPlatformIds(
    client,
    softwarePlatformIds(
      software
    )
  );
}

export async function validatePublishedCollectionSlugNamespace(
  client: PoolClient,
  slug: string
) {
  const catalog =
    await publishedPlatformCatalog(
      client
    );
  const conflicts =
    catalog?.platforms.some(
      (platform) =>
        platform.id === slug &&
        platform.active
    ) ?? false;

  return {
    ok: !conflicts,
  };
}

export async function validatePublishedPlatformCollectionNamespace(
  client: PoolClient,
  next: PlatformCatalog
) {
  const result =
    await client.query<{
      item_key: string;
    }>(
      `SELECT item_key
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game_collection'
         AND public_visible = true
       FOR SHARE`
    );
  const collectionSlugs =
    new Set(
      result.rows.map(
        (row) =>
          row.item_key
      )
    );
  const conflicts =
    next.platforms
      .map(
        (platform) =>
          platform.id
      )
      .filter(
        (id) =>
          collectionSlugs.has(
            id
          )
      )
      .sort();

  return {
    ok:
      conflicts.length === 0,
    conflicts,
  };
}

export function validatePublishedGameCollectionRelations(
  client: PoolClient,
  gameSlugs: readonly string[]
) {
  return validatePublishedKeys(
    client,
    "game",
    gameSlugs
  );
}

export async function validatePublishedPlatformCatalogRemoval(
  client: PoolClient,
  next: PlatformCatalog
) {
  const result =
    await client.query<PayloadRow>(
      `SELECT
         item_key,
         item_type,
         draft_payload,
         published_payload,
         public_visible
       FROM deuna_admin.editorial_items
       WHERE item_type IN (
         'game',
         'software'
       )
         AND public_visible = true
       FOR SHARE`
    );
  const missing =
    missingPlatformIds(
      next,
      referencedPlatformIds(
        result.rows,
        "published_payload"
      )
    );

  return {
    ok:
      missing.length === 0,
    missing,
  };
}


export async function validatePublishedSoftwareHide(
  client: PoolClient,
  softwareSlug: string
) {
  const result =
    await client.query<{
      item_key: string;
      published_payload: unknown;
    }>(
      `SELECT
         item_key,
         published_payload
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game'
         AND public_visible = true
       FOR SHARE`
    );
  const usedBy: string[] = [];

  for (const row of result.rows) {
    try {
      const game =
        parseEditorialPayload(
          "game",
          row.published_payload
        );
      const referenced =
        resolveGameReleases(
          game
        ).some(
          (release) =>
            release
              .recommendedSoftwareSlugs
              ?.includes(
                softwareSlug
              ) ?? false
        );

      if (referenced) {
        usedBy.push(
          row.item_key
        );
      }
    } catch {
      continue;
    }
  }

  return {
    ok:
      usedBy.length === 0,
    usedBy,
  };
}

export async function validatePublishedGameHide(
  client: PoolClient,
  gameSlug: string
) {
  const result =
    await client.query<{
      item_key: string;
      published_payload: unknown;
    }>(
      `SELECT
         item_key,
         published_payload
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game_collection'
         AND public_visible = true
       FOR SHARE`
    );
  const usedBy: string[] = [];

  for (const row of result.rows) {
    try {
      const collection =
        parseEditorialPayload(
          "game_collection",
          row.published_payload
        );

      if (
        collection.gameSlugs.includes(
          gameSlug
        )
      ) {
        usedBy.push(
          row.item_key
        );
      }
    } catch {
      continue;
    }
  }

  return {
    ok:
      usedBy.length === 0,
    usedBy,
  };
}
