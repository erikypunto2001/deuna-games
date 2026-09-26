import "server-only";

import { cache } from "react";
import {
  connection,
} from "next/server";

import {
  games as sourceGames,
} from "@/data/games";
import {
  adminQuery,
} from "@/lib/admin/database";
import {
  parseEditorialPayload,
} from "@/lib/admin/content-validation";
import type { Game } from "@/types/game";

type EditorialGameRow = {
  item_key: string;
  published_payload: unknown;
  public_visible: boolean;
};

function sourceFallback() {
  return sourceGames.map((game) => ({
    ...game,
  }));
}

function parsePublishedGame(
  row: EditorialGameRow
): Game | null {
  try {
    const game = parseEditorialPayload(
      "game",
      row.published_payload
    );

    return game.slug === row.item_key
      ? game
      : null;
  } catch {
    return null;
  }
}

function mergeEditorialGames(
  rows: EditorialGameRow[]
) {
  const editorialBySlug = new Map(
    rows.map((row) => [row.item_key, row])
  );
  const sourceSlugs = new Set(
    sourceGames.map((game) => game.slug)
  );
  const merged: Game[] = [];

  for (const sourceGame of sourceGames) {
    const editorial = editorialBySlug.get(
      sourceGame.slug
    );

    if (!editorial) {
      merged.push(sourceGame);
      continue;
    }

    if (!editorial.public_visible) {
      continue;
    }

    merged.push(
      parsePublishedGame(editorial) ??
        sourceGame
    );
  }

  const additional = rows
    .filter(
      (row) =>
        row.public_visible &&
        !sourceSlugs.has(row.item_key)
    )
    .map(parsePublishedGame)
    .filter((game): game is Game => game !== null)
    .sort((a, b) =>
      a.title.localeCompare(b.title, "es")
    );

  return [...merged, ...additional];
}

async function readEditorialGames() {
  const result = await adminQuery<EditorialGameRow>(
    `SELECT
       item_key,
       published_payload,
       public_visible
     FROM deuna_admin.editorial_items
     WHERE item_type = 'game'
     ORDER BY lower(
       COALESCE(
         published_payload ->> 'title',
         item_key
       )
     ) ASC`
  );

  return result.rows;
}

export const getPublicGames = cache(
  async (): Promise<Game[]> => {
    await connection();

    try {
      const editorial = await readEditorialGames();

      if (!editorial || editorial.length === 0) {
        return sourceFallback();
      }

      return mergeEditorialGames(editorial);
    } catch {
      /*
       * El catálogo fuente sigue siendo un fallback deliberado:
       * una caída o una migración todavía no aplicada no debe dejar
       * la web pública sin juegos.
       */
      return sourceFallback();
    }
  }
);

export async function getPublicGameBySlug(
  slug: string
) {
  const games = await getPublicGames();
  return games.find((game) => game.slug === slug);
}
