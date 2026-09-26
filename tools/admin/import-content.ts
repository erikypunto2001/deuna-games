import {
  createHash,
  randomUUID,
} from "node:crypto";
import process from "node:process";

import {
  Pool,
  type PoolClient,
} from "pg";

import {
  sourceAboutConfig,
} from "../../src/data/about-config.ts";
import { games } from "../../src/data/games.ts";
import {
  sourceHomeConfig,
} from "../../src/data/home-config.ts";
import {
  sourcePublicPagesConfig,
} from "../../src/data/public-pages-config.ts";
import {
  PLATFORM_CATALOG_EDITORIAL_KEY,
  sourcePlatformCatalog,
} from "../../src/data/platform-catalog.ts";
import {
  gameUpdates,
} from "../../src/data/update-records.ts";
import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "../../src/lib/admin/content-hash.ts";
import {
  parseEditorialPayload,
  type EditorialItemType,
} from "../../src/lib/admin/content-validation.ts";
import {
  getAdminDatabaseConfig,
} from "../../src/lib/admin/database-config.ts";
import {
  siteConfig,
} from "../../src/lib/site.ts";
import type { Game } from "../../src/types/game.ts";
import type {
  GameTaxonomy,
  GameTaxonomyTerm,
} from "../../src/types/game-taxonomy.ts";

type SourceItem = {
  type: EditorialItemType;
  key: string;
  payload: Record<string, unknown>;
};

type ExistingItemRow = {
  id: string;
  source_checksum: string;
  draft_status: "synced" | "modified";
  revision: number;
};

type ExistingTaxonomyRow = {
  id: string;
  draft_payload: unknown;
  revision: number;
  publication_number: number;
  public_visible: boolean;
};

type GamePayloadRow = {
  draft_payload: unknown;
};

const importLockKey = 1_926_042_787;
const validateOnly = process.argv.includes(
  "--validate-only"
);

function normalizeTaxonomyLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function taxonomyKey(label: string) {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);

  return base || `term-${createHash("sha256")
    .update(label, "utf8")
    .digest("hex")
    .slice(0, 12)}`;
}

function taxonomyTerms(values: string[]) {
  const labels = new Map<string, string>();

  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const normalized = normalizeTaxonomyLabel(label);
    if (!labels.has(normalized)) labels.set(normalized, label);
  }

  const usedKeys = new Set<string>();

  return [...labels.values()]
    .sort((left, right) => left.localeCompare(right, "es"))
    .map<GameTaxonomyTerm>((label) => {
      const base = taxonomyKey(label);
      let key = base;

      if (usedKeys.has(key)) {
        key = `${base.slice(0, 146)}-${createHash("sha256")
          .update(label, "utf8")
          .digest("hex")
          .slice(0, 8)}`;
      }

      usedKeys.add(key);
      return { key, label, active: true };
    });
}

function buildGameTaxonomy(
  sourceGames: readonly Game[]
): GameTaxonomy {
  return {
    classifications: taxonomyTerms(
      sourceGames.flatMap((game) => [
        game.category,
        ...(game.genres ?? []),
      ])
    ),
    tags: taxonomyTerms(
      sourceGames.flatMap((game) => game.tags ?? [])
    ),
  };
}

function buildSourceItems(): SourceItem[] {
  if (games.length === 0) {
    throw new Error(
      "La fuente editorial debe conservar al menos un juego."
    );
  }

  const gameSlugs = new Set(
    games.map((game) => game.slug)
  );

  for (const update of gameUpdates) {
    if (!gameSlugs.has(update.gameSlug)) {
      throw new Error(
        `La actualización ${update.id} referencia un juego inexistente.`
      );
    }
  }

  const homeConfig = normalizeEditorialPayload(
    parseEditorialPayload(
      "home_config",
      sourceHomeConfig
    )
  );
  const aboutConfig = normalizeEditorialPayload(
    parseEditorialPayload(
      "about_config",
      sourceAboutConfig
    )
  );
  const publicPagesConfig = normalizeEditorialPayload(
    parseEditorialPayload(
      "public_pages_config",
      sourcePublicPagesConfig
    )
  );
  const platformCatalog = normalizeEditorialPayload(
    parseEditorialPayload(
      "platform_catalog",
      sourcePlatformCatalog
    )
  );

  for (const slug of new Set([
    ...homeConfig.heroSlugs,
    ...homeConfig.popularSlugs,
    ...homeConfig.lowSpecSlugs,
    ...homeConfig.recommendedSlugs,
  ])) {
    if (!gameSlugs.has(slug)) {
      throw new Error(
        `La portada fuente referencia el juego inexistente ${slug}.`
      );
    }
  }

  const items: SourceItem[] = [
    ...games.map((game) => ({
      type: "game" as const,
      key: game.slug,
      payload: normalizeEditorialPayload(
        parseEditorialPayload("game", game)
      ) as unknown as Record<string, unknown>,
    })),
    ...gameUpdates.map((update) => ({
      type: "game_update" as const,
      key: update.id,
      payload: normalizeEditorialPayload(
        parseEditorialPayload(
          "game_update",
          update
        )
      ) as unknown as Record<string, unknown>,
    })),
    {
      type: "site_config",
      key: "site",
      payload: normalizeEditorialPayload(
        parseEditorialPayload(
          "site_config",
          siteConfig
        )
      ) as Record<string, unknown>,
    },
    {
      type: "home_config",
      key: "home",
      payload: homeConfig as unknown as Record<string, unknown>,
    },
    {
      type: "about_config",
      key: "about",
      payload: aboutConfig as unknown as Record<string, unknown>,
    },
    {
      type: "public_pages_config",
      key: "public-pages",
      payload:
        publicPagesConfig as unknown as Record<string, unknown>,
    },
    {
      type: "platform_catalog",
      key: PLATFORM_CATALOG_EDITORIAL_KEY,
      payload:
        platformCatalog as unknown as Record<string, unknown>,
    },
  ];
  const identities = new Set<string>();

  for (const item of items) {
    const identity = `${item.type}:${item.key}`;

    if (identities.has(identity)) {
      throw new Error(
        `Identidad editorial duplicada: ${identity}`
      );
    }

    identities.add(identity);
  }

  return items;
}

function applySourceGameRetirements(
  items: SourceItem[],
  retiredGameSlugs: ReadonlySet<string>
) {
  if (retiredGameSlugs.size === 0) return items;

  const filtered: SourceItem[] = [];

  for (const item of items) {
    if (
      item.type === "game" &&
      retiredGameSlugs.has(item.key)
    ) {
      continue;
    }

    if (
      item.type === "game_update" &&
      retiredGameSlugs.has(
        typeof item.payload.gameSlug === "string"
          ? item.payload.gameSlug
          : ""
      )
    ) {
      continue;
    }

    if (item.type === "home_config") {
      const payload = { ...item.payload };
      for (const key of [
        "heroSlugs",
        "popularSlugs",
        "lowSpecSlugs",
        "recommendedSlugs",
      ] as const) {
        const value = payload[key];
        if (Array.isArray(value)) {
          payload[key] = value.filter(
            (slug) =>
              typeof slug === "string" &&
              !retiredGameSlugs.has(slug)
          );
        }
      }
      filtered.push({ ...item, payload });
      continue;
    }

    filtered.push(item);
  }

  return filtered;
}

async function importItem(
  client: PoolClient,
  item: SourceItem
) {
  const payload = JSON.stringify(item.payload);
  const digest = hashEditorialPayload(item.payload);
  const existing = await client.query<ExistingItemRow>(
    `SELECT
       id,
       source_checksum,
       draft_status,
       revision
     FROM deuna_admin.editorial_items
     WHERE item_type = $1
       AND item_key = $2
     LIMIT 1
     FOR UPDATE`,
    [item.type, item.key]
  );
  const current = existing.rows[0];

  if (!current) {
    const id = randomUUID();

    await client.query(
      `INSERT INTO deuna_admin.editorial_items
         (
           id,
           item_type,
           item_key,
           source_payload,
           source_checksum,
           draft_payload,
           published_payload,
           published_checksum,
           publication_number
         )
       VALUES (
         $1,
         $2,
         $3,
         $4::jsonb,
         $5,
         $4::jsonb,
         $4::jsonb,
         $5,
         1
       )`,
      [id, item.type, item.key, payload, digest]
    );

    return "created" as const;
  }

  if (current.source_checksum === digest) {
    await client.query(
      `UPDATE deuna_admin.editorial_items
       SET source_present = true,
           source_imported_at = now()
       WHERE id = $1`,
      [current.id]
    );

    return "unchanged" as const;
  }

  if (current.draft_status === "modified") {
    await client.query(
      `UPDATE deuna_admin.editorial_items
       SET source_payload = $2::jsonb,
           source_checksum = $3,
           source_present = true,
           source_imported_at = now()
       WHERE id = $1`,
      [current.id, payload, digest]
    );

    return "conflict" as const;
  }

  const nextRevision = current.revision + 1;

  await client.query(
    `UPDATE deuna_admin.editorial_items
     SET source_payload = $2::jsonb,
         source_checksum = $3,
         source_present = true,
         draft_payload = $2::jsonb,
         draft_status = 'synced',
         revision = $4,
         source_imported_at = now(),
         updated_at = now(),
         updated_by = NULL
     WHERE id = $1`,
    [current.id, payload, digest, nextRevision]
  );

  return "refreshed" as const;
}

async function ensureGameTaxonomyItem(
  client: PoolClient
) {
  const existing = await client.query<ExistingTaxonomyRow>(
    `SELECT
       id,
       draft_payload,
       revision,
       publication_number,
       public_visible
     FROM deuna_admin.editorial_items
     WHERE item_type = 'game_taxonomy'
       AND item_key = 'games'
     LIMIT 1
     FOR UPDATE`
  );
  const current = existing.rows[0];

  if (current?.public_visible) {
    return "unchanged" as const;
  }

  if (current) {
    const taxonomy = normalizeEditorialPayload(
      parseEditorialPayload(
        "game_taxonomy",
        current.draft_payload
      )
    );
    const payload = JSON.stringify(taxonomy);
    const digest = hashEditorialPayload(taxonomy);
    const nextPublication = current.publication_number + 1;

    await client.query(
      `UPDATE deuna_admin.editorial_items
       SET published_payload = $2::jsonb,
           published_checksum = $3,
           published_from_revision = $4,
           publication_number = $5,
           published_at = now(),
           published_by = NULL,
           public_visible = true
       WHERE id = $1`,
      [
        current.id,
        payload,
        digest,
        current.revision,
        nextPublication,
      ]
    );

    return "refreshed" as const;
  }

  const gameRows = await client.query<GamePayloadRow>(
    `SELECT draft_payload
       FROM deuna_admin.editorial_items
      WHERE item_type = 'game'
      ORDER BY item_key ASC`
  );
  const editorialGames = gameRows.rows.map((row) =>
    parseEditorialPayload("game", row.draft_payload)
  );
  const taxonomy = normalizeEditorialPayload(
    parseEditorialPayload(
      "game_taxonomy",
      buildGameTaxonomy(editorialGames)
    )
  );
  const payload = JSON.stringify(taxonomy);
  const digest = hashEditorialPayload(taxonomy);
  const id = randomUUID();

  await client.query(
    `INSERT INTO deuna_admin.editorial_items
       (
         id,
         item_type,
         item_key,
         source_payload,
         source_checksum,
         source_present,
         draft_payload,
         draft_status,
         published_payload,
         published_checksum,
         publication_number,
         public_visible
       )
     VALUES (
       $1,
       'game_taxonomy',
       'games',
       $2::jsonb,
       $3,
       true,
       $2::jsonb,
       'synced',
       $2::jsonb,
       $3,
       1,
       true
     )`,
    [id, payload, digest]
  );

  return "created" as const;
}

async function markMissingSources(
  client: PoolClient,
  items: SourceItem[]
) {
  let missing = 0;

  for (const type of [
    "game",
    "game_update",
    "site_config",
    "home_config",
    "about_config",
    "public_pages_config",
    "platform_catalog",
  ] satisfies EditorialItemType[]) {
    const keys = items
      .filter((item) => item.type === type)
      .map((item) => item.key);
    const result = await client.query(
      `UPDATE deuna_admin.editorial_items
       SET source_present = false,
           source_imported_at = now()
       WHERE item_type = $1
         AND source_present = true
         AND NOT (item_key = ANY($2::text[]))`,
      [type, keys]
    );

    missing += result.rowCount ?? 0;
  }

  return missing;
}

async function main() {
  const items = buildSourceItems();
  const sourceTaxonomy = parseEditorialPayload(
    "game_taxonomy",
    buildGameTaxonomy(games)
  );
  const sourcePublicPages = parseEditorialPayload(
    "public_pages_config",
    sourcePublicPagesConfig
  );
  const sourcePlatforms = parseEditorialPayload(
    "platform_catalog",
    sourcePlatformCatalog
  );

  if (validateOnly) {
    void sourceTaxonomy;
    void sourcePublicPages;
    void sourcePlatforms;
    console.log(
      `Contenido editorial validado: ${games.length} juegos, ${gameUpdates.length} actualizaciones, 1 configuración, 1 portada, 1 página institucional, 1 configuración de superficies públicas, 1 catálogo de plataformas y taxonomía de juegos válida.`
    );
    return;
  }

  const pool = new Pool(
    getAdminDatabaseConfig("migration")
  );
  const client = await pool.connect();
  const counts = {
    created: 0,
    unchanged: 0,
    refreshed: 0,
    conflict: 0,
    missing: 0,
    retiredSourceGames: 0,
  };

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock($1)",
      [importLockKey]
    );

    const retirementRows = await client.query<{
      game_slug: string;
    }>(
      `SELECT game_slug
         FROM deuna_admin.source_game_retirements
        ORDER BY game_slug ASC`
    );
    const retiredGameSlugs = new Set(
      retirementRows.rows.map((row) => row.game_slug)
    );
    const importableItems =
      applySourceGameRetirements(
        items,
        retiredGameSlugs
      );
    counts.retiredSourceGames =
      retiredGameSlugs.size;

    for (const item of importableItems) {
      const result = await importItem(client, item);
      counts[result] += 1;
    }

    const taxonomyResult =
      await ensureGameTaxonomyItem(client);
    counts[taxonomyResult] += 1;

    counts.missing = await markMissingSources(
      client,
      importableItems
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(
    `Importación editorial completa: ${counts.created} creados, ${counts.refreshed} actualizados, ${counts.unchanged} sin cambios, ${counts.conflict} borradores preservados ante conflicto, ${counts.missing} fuentes ausentes conservadas y ${counts.retiredSourceGames} retiros fuente respetados.`
  );
}

main().catch(() => {
  console.error(
    "No se pudo importar el contenido editorial. Ejecuta primero las migraciones y revisa la conexión privada."
  );
  process.exitCode = 1;
});