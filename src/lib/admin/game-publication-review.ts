import "server-only";

import type { Game } from "@/types/game";
import type { GameTaxonomy } from "@/types/game-taxonomy";

import {
  parseEditorialPayload,
} from "./content-validation";
import {
  adminQuery,
} from "./database";
import {
  verifyAdminSession,
} from "./session";

type PublishedGameRow = {
  published_payload: unknown;
};

type DraftGameRow = {
  draft_payload: unknown;
  revision: number;
};

type PublishedTaxonomyRow = {
  published_payload: unknown;
};


export type GameDraftPublicationCandidate = {
  game: Game;
  revision: number;
};


export type GameTaxonomyPublicationIntegrity =
  | { ok: true }
  | {
      ok: false;
      missingClassifications: string[];
      missingTags: string[];
    };

function normalizeTaxonomyLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function uniqueLabels(values: readonly string[]) {
  const labels = new Map<string, string>();

  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const normalized = normalizeTaxonomyLabel(label);
    if (!labels.has(normalized)) labels.set(normalized, label);
  }

  return [...labels.values()];
}

async function getPublishedGameTaxonomy(): Promise<GameTaxonomy | null> {
  const result = await adminQuery<PublishedTaxonomyRow>(
    `SELECT published_payload
       FROM deuna_admin.editorial_items
      WHERE item_type = 'game_taxonomy'
        AND item_key = 'games'
        AND public_visible = true
      LIMIT 1`
  );
  const row = result.rows[0];

  if (!row) return null;

  return parseEditorialPayload(
    "game_taxonomy",
    row.published_payload
  );
}

export async function inspectPublishedGameTaxonomyIntegrity(
  game: Game
): Promise<GameTaxonomyPublicationIntegrity> {
  await verifyAdminSession();

  const taxonomy = await getPublishedGameTaxonomy();

  if (!taxonomy) {
    return {
      ok: false,
      missingClassifications: uniqueLabels([
        game.category,
        ...(game.genres ?? []),
      ]),
      missingTags: uniqueLabels(game.tags ?? []),
    };
  }

  const classifications = new Set(
    taxonomy.classifications.map((term) =>
      normalizeTaxonomyLabel(term.label)
    )
  );
  const tags = new Set(
    taxonomy.tags.map((term) =>
      normalizeTaxonomyLabel(term.label)
    )
  );
  const requiredClassifications = uniqueLabels([
    game.category,
    ...(game.genres ?? []),
  ]);
  const requiredTags = uniqueLabels(game.tags ?? []);
  const missingClassifications = requiredClassifications.filter(
    (label) => !classifications.has(normalizeTaxonomyLabel(label))
  );
  const missingTags = requiredTags.filter(
    (label) => !tags.has(normalizeTaxonomyLabel(label))
  );

  return missingClassifications.length === 0 &&
    missingTags.length === 0
    ? { ok: true }
    : {
        ok: false,
        missingClassifications,
        missingTags,
      };
}

export async function getPublishedGameSnapshot(
  key: string
): Promise<Game | null> {
  await verifyAdminSession();

  const result = await adminQuery<PublishedGameRow>(
    `SELECT published_payload
     FROM deuna_admin.editorial_items
     WHERE item_type = 'game'
       AND item_key = $1
     LIMIT 1`,
    [key]
  );
  const row = result.rows[0];

  if (!row) return null;

  return parseEditorialPayload(
    "game",
    row.published_payload
  );
}

export async function getGameDraftPublicationCandidate(
  key: string
): Promise<GameDraftPublicationCandidate | null> {
  await verifyAdminSession();

  const result = await adminQuery<DraftGameRow>(
    `SELECT draft_payload, revision
     FROM deuna_admin.editorial_items
     WHERE item_type = 'game'
       AND item_key = $1
     LIMIT 1`,
    [key]
  );
  const row = result.rows[0];

  if (!row) return null;

  return {
    game: parseEditorialPayload(
      "game",
      row.draft_payload
    ),
    revision: row.revision,
  };
}
