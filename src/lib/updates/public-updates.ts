import "server-only";

import {
  connection,
} from "next/server";
import { cache } from "react";

import {
  gameUpdates as sourceUpdates,
} from "@/data/update-records";
import {
  adminQuery,
} from "@/lib/admin/database";
import {
  parseEditorialPayload,
} from "@/lib/admin/content-validation";
import {
  resolveGameDownload,
} from "@/lib/games/download";
import {
  getPublicGames,
} from "@/lib/games/public-catalog";
import type { Game } from "@/types/game";
import type {
  GameUpdate,
  ResolvedGameUpdate,
} from "@/types/update";

type EditorialUpdateRow = {
  item_key: string;
  published_payload: unknown;
  public_visible: boolean;
};

function parsePublishedUpdate(
  row: EditorialUpdateRow
): GameUpdate | null {
  try {
    const update = parseEditorialPayload(
      "game_update",
      row.published_payload
    );

    return update.id === row.item_key
      ? update
      : null;
  } catch {
    return null;
  }
}

function mergeEditorialUpdates(
  rows: EditorialUpdateRow[]
) {
  const editorialById = new Map(
    rows.map((row) => [row.item_key, row])
  );
  const sourceIds = new Set(
    sourceUpdates.map((update) => update.id)
  );
  const merged: GameUpdate[] = [];

  for (const sourceUpdate of sourceUpdates) {
    const editorial = editorialById.get(
      sourceUpdate.id
    );

    if (!editorial) {
      merged.push(sourceUpdate);
      continue;
    }

    if (!editorial.public_visible) {
      continue;
    }

    merged.push(
      parsePublishedUpdate(editorial) ??
        sourceUpdate
    );
  }

  const additional = rows
    .filter(
      (row) =>
        row.public_visible &&
        !sourceIds.has(row.item_key)
    )
    .map(parsePublishedUpdate)
    .filter(
      (update): update is GameUpdate =>
        update !== null
    );

  return [...merged, ...additional];
}

function resolveUpdates(
  updates: readonly GameUpdate[],
  games: readonly Game[]
) {
  const gamesBySlug = new Map(
    games.map((game) => [game.slug, game])
  );
  const resolved: ResolvedGameUpdate[] = [];

  for (const update of updates) {
    const game = gamesBySlug.get(update.gameSlug);

    if (!game) continue;

    resolved.push({
      ...update,
      game,
      downloadable:
        resolveGameDownload(game) !== null,
    });
  }

  return resolved.sort(
    (a, b) =>
      Date.parse(b.publishedAt) -
      Date.parse(a.publishedAt)
  );
}

async function readEditorialUpdates() {
  const result = await adminQuery<EditorialUpdateRow>(
    `SELECT
       item_key,
       published_payload,
       public_visible
     FROM deuna_admin.editorial_items
     WHERE item_type = 'game_update'
     ORDER BY item_key ASC`
  );

  return result.rows;
}

export const getPublicResolvedUpdates = cache(
  async (): Promise<ResolvedGameUpdate[]> => {
    await connection();
    const games = await getPublicGames();

    try {
      const editorial = await readEditorialUpdates();

      if (!editorial || editorial.length === 0) {
        return resolveUpdates(sourceUpdates, games);
      }

      return resolveUpdates(
        mergeEditorialUpdates(editorial),
        games
      );
    } catch {
      return resolveUpdates(sourceUpdates, games);
    }
  }
);

export async function getPublicUpdatesForGame(
  slug: string
) {
  const updates = await getPublicResolvedUpdates();
  return updates.filter(
    (update) => update.game.slug === slug
  );
}
