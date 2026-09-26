import "server-only";

import {
  adminQuery,
} from "./database";
import {
  parseEditorialPayload,
} from "./content-validation";
import type {
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
  draft_payload: unknown;
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

export async function validatePlatformCatalogRemoval(
  next: PlatformCatalog
) {
  const nextIds = new Set(
    next.platforms.map(
      (platform) =>
        platform.id
    )
  );

  const result =
    await adminQuery<PayloadRow>(
      `SELECT
         item_key,
         draft_payload
       FROM deuna_admin.editorial_items
       WHERE item_type IN (
         'game',
         'software'
       )`
    );

  const referenced =
    new Set<string>();

  for (const row of result.rows) {
    try {
      if (
        "releases" in
        (row.draft_payload as object)
      ) {
        const game =
          parseEditorialPayload(
            "game",
            row.draft_payload
          );
        for (
          const release of
          game.releases ?? []
        ) {
          referenced.add(
            release.platformId
          );
        }
        continue;
      }

      const software =
        parseEditorialPayload(
          "software",
          row.draft_payload
        );
      for (
        const id of
        softwarePlatformIds(
          software
        )
      ) {
        referenced.add(id);
      }
    } catch {
      continue;
    }
  }

  const missing =
    [...referenced]
      .filter(
        (id) =>
          !nextIds.has(id)
      )
      .sort();

  return {
    ok:
      missing.length === 0,
    missing,
  };
}
