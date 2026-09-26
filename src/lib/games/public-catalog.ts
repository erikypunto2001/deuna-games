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

function hasConfiguredEditorialDatabase() {
  return Boolean(
    process.env.DEUNA_DATABASE_HOST?.trim() &&
    process.env.DEUNA_DATABASE_NAME?.trim() &&
    process.env.DEUNA_DATABASE_USER?.trim() &&
    process.env.DEUNA_DATABASE_PASSWORD?.trim()
  );
}

function parsePublishedGame(
  row: EditorialGameRow
): Game | null {
  if (!row.public_visible) return null;

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

  return result.rows
    .map(parsePublishedGame)
    .filter((game): game is Game => game !== null);
}

export const getPublicGames = cache(
  async (): Promise<Game[]> => {
    await connection();

    if (!hasConfiguredEditorialDatabase()) {
      return sourceFallback();
    }

    try {
      return await readEditorialGames();
    } catch {
      /*
       * Con PostgreSQL configurado, el catálogo falla cerrado.
       * Volver a src/data/games.ts podría resucitar un juego retirado
       * de forma explícita desde Admin.
       */
      return [];
    }
  }
);

export async function getPublicGameBySlug(
  slug: string
) {
  const games = await getPublicGames();
  return games.find((game) => game.slug === slug);
}
