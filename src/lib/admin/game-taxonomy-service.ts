import "server-only";

import type { PoolClient } from "pg";

import type { Game } from "@/types/game";
import type {
  GameTaxonomy,
  GameTaxonomyKind,
  GameTaxonomyTerm,
} from "@/types/game-taxonomy";

import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "./content-hash";
import {
  parseEditorialPayload,
} from "./content-validation";
import {
  adminQuery,
  withAdminTransaction,
} from "./database";
import {
  verifyAdminSession,
} from "./session";

type TaxonomyItemRow = {
  id: string;
  draft_payload: unknown;
  source_checksum: string;
  revision: number;
};

type TaxonomyPayloadRow = {
  draft_payload: unknown;
};

type GamePayloadRow = {
  draft_payload: unknown;
};

export type GameTaxonomyMutationResult =
  | { outcome: "saved"; revision: number }
  | { outcome: "conflict"; revision: number }
  | { outcome: "in_use"; revision: number }
  | { outcome: "not_found" };

export type GameTaxonomySelectionInput = {
  category?: string;
  genres?: readonly string[];
  tags?: readonly string[];
  currentGameKey?: string;
};

export type GameTaxonomySelectionResult =
  | {
      valid: true;
      category?: string;
      genres?: string[];
      tags?: string[];
    }
  | { valid: false };

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function gameClassifications(game: Game) {
  const values = [
    game.category,
    ...(game.genres ?? []),
  ];
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = normalizeLabel(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function gameValues(games: Game[]) {
  return {
    classifications: games.flatMap(gameClassifications),
    tags: games.flatMap((game) => game.tags ?? []),
  };
}

function preservesUsedGameTerms(
  taxonomy: GameTaxonomy,
  games: Game[]
) {
  const values = gameValues(games);

  for (const kind of [
    "classifications",
    "tags",
  ] as const) {
    const available = new Set(
      taxonomy[kind].map((term) =>
        normalizeLabel(term.label)
      )
    );

    for (const value of values[kind]) {
      if (!available.has(normalizeLabel(value))) {
        return false;
      }
    }
  }

  return true;
}

function currentValuesForKind(
  kind: GameTaxonomyKind,
  game: Game | null
) {
  if (!game) return [];

  return kind === "classifications"
    ? gameClassifications(game)
    : game.tags ?? [];
}

function resolveTerms(
  terms: readonly GameTaxonomyTerm[],
  requested: readonly string[] | undefined,
  current: readonly string[]
) {
  if (requested === undefined) return undefined;

  const active = new Map(
    terms
      .filter((term) => term.active)
      .map((term) => [
        normalizeLabel(term.label),
        term.label,
      ])
  );
  const retained = new Map(
    current.map((value) => [normalizeLabel(value), value])
  );
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const value of requested) {
    const normalized = normalizeLabel(value);
    const canonical =
      active.get(normalized) ?? retained.get(normalized);

    if (!canonical || seen.has(normalized)) {
      return null;
    }

    seen.add(normalized);
    resolved.push(canonical);
  }

  return resolved;
}

async function readGames(client: PoolClient) {
  const result = await client.query<GamePayloadRow>(
    `SELECT draft_payload
       FROM deuna_admin.editorial_items
      WHERE item_type = 'game'
      ORDER BY item_key ASC`
  );

  return result.rows.map((row) =>
    parseEditorialPayload("game", row.draft_payload)
  );
}

async function readCurrentGame(key: string | undefined) {
  if (!key) return null;

  const result = await adminQuery<GamePayloadRow>(
    `SELECT draft_payload
       FROM deuna_admin.editorial_items
      WHERE item_type = 'game'
        AND item_key = $1
      LIMIT 1`,
    [key]
  );
  const row = result.rows[0];

  return row
    ? parseEditorialPayload("game", row.draft_payload)
    : null;
}

export async function resolveGameTaxonomySelection(
  input: GameTaxonomySelectionInput
): Promise<GameTaxonomySelectionResult> {
  await verifyAdminSession();

  const [taxonomyResult, currentGame] = await Promise.all([
    adminQuery<TaxonomyPayloadRow>(
      `SELECT draft_payload
         FROM deuna_admin.editorial_items
        WHERE item_type = 'game_taxonomy'
          AND item_key = 'games'
        LIMIT 1`
    ),
    readCurrentGame(input.currentGameKey),
  ]);
  const taxonomyRow = taxonomyResult.rows[0];

  if (
    !taxonomyRow ||
    (input.currentGameKey && !currentGame)
  ) {
    return { valid: false };
  }

  const taxonomy = parseEditorialPayload(
    "game_taxonomy",
    taxonomyRow.draft_payload
  );
  const currentClassifications = currentValuesForKind(
    "classifications",
    currentGame
  );
  const categoryValues = input.category
    ? [input.category]
    : undefined;
  const category = resolveTerms(
    taxonomy.classifications,
    categoryValues,
    currentClassifications
  );
  const genres = resolveTerms(
    taxonomy.classifications,
    input.genres,
    currentClassifications
  );
  const tags = resolveTerms(
    taxonomy.tags,
    input.tags,
    currentValuesForKind("tags", currentGame)
  );

  if (
    category === null ||
    genres === null ||
    tags === null ||
    (input.category !== undefined && category?.length !== 1)
  ) {
    return { valid: false };
  }

  const primary = category?.[0] ?? currentGame?.category;
  const additional = genres?.filter(
    (value) =>
      !primary || normalizeLabel(value) !== normalizeLabel(primary)
  );

  return {
    valid: true,
    ...(category ? { category: category[0] } : {}),
    ...(genres !== undefined
      ? {
          genres:
            additional && additional.length > 0
              ? additional
              : undefined,
        }
      : {}),
    ...(tags !== undefined
      ? { tags: tags.length > 0 ? tags : undefined }
      : {}),
  };
}

export async function saveGameTaxonomyDraft(
  expectedRevision: number,
  actorUserId: string,
  input: GameTaxonomy
): Promise<GameTaxonomyMutationResult> {
  const session = await verifyAdminSession();

  if (session.userId !== actorUserId) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }

  return withAdminTransaction(async (client) => {
    const result = await client.query<TaxonomyItemRow>(
      `SELECT
         id,
         draft_payload,
         source_checksum,
         revision
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game_taxonomy'
         AND item_key = 'games'
       LIMIT 1
       FOR UPDATE`
    );
    const item = result.rows[0];

    if (!item) return { outcome: "not_found" };

    if (item.revision !== expectedRevision) {
      return {
        outcome: "conflict",
        revision: item.revision,
      };
    }

    const current = parseEditorialPayload(
      "game_taxonomy",
      item.draft_payload
    );
    const next = normalizeEditorialPayload(
      parseEditorialPayload("game_taxonomy", input)
    );

    if (
      hashEditorialPayload(current) ===
      hashEditorialPayload(next)
    ) {
      return {
        outcome: "saved",
        revision: item.revision,
      };
    }

    const games = await readGames(client);
    if (!preservesUsedGameTerms(next, games)) {
      return {
        outcome: "in_use",
        revision: item.revision,
      };
    }

    const serialized = JSON.stringify(next);
    const digest = hashEditorialPayload(next);
    const nextRevision = item.revision + 1;
    const status =
      digest === item.source_checksum
        ? "synced"
        : "modified";

    await client.query(
      `UPDATE deuna_admin.editorial_items
       SET draft_payload = $2::jsonb,
           draft_status = $3,
           revision = $4,
           updated_at = now(),
           updated_by = $5
       WHERE id = $1`,
      [
        item.id,
        serialized,
        status,
        nextRevision,
        actorUserId,
      ]
    );


    await client.query(
      `INSERT INTO deuna_admin.admin_audit_log
         (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'taxonomy_saved', 'game_taxonomy', 'games', $2::jsonb)`,
      [
        actorUserId,
        JSON.stringify({ revision: nextRevision }),
      ]
    );

    return {
      outcome: "saved",
      revision: nextRevision,
    };
  });
}
