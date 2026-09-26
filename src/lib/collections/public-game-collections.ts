import "server-only";

import {
  cache,
} from "react";
import {
  connection,
} from "next/server";

import {
  adminQuery,
} from "@/lib/admin/database";
import {
  parseEditorialPayload,
} from "@/lib/admin/content-validation";
import type {
  GameCollection,
} from "@/types/game-collection";

type CollectionRow = {
  item_key: string;
  published_payload: unknown;
  public_visible: boolean;
};

function parseRow(
  row: CollectionRow
): GameCollection | null {
  if (!row.public_visible) {
    return null;
  }

  try {
    const collection =
      parseEditorialPayload(
        "game_collection",
        row.published_payload
      );

    return collection.slug ===
      row.item_key
      ? collection
      : null;
  } catch {
    return null;
  }
}

export const getPublicGameCollections =
  cache(
    async (): Promise<
      GameCollection[]
    > => {
      await connection();

      try {
        const result =
          await adminQuery<CollectionRow>(
            `SELECT
               item_key,
               published_payload,
               public_visible
             FROM deuna_admin.editorial_items
             WHERE item_type = 'game_collection'
             ORDER BY
               COALESCE(
                 (published_payload ->> 'featured')::boolean,
                 false
               ) DESC,
               lower(
                 COALESCE(
                   published_payload ->> 'title',
                   item_key
                 )
               ) ASC`
          );

        return result.rows
          .map(parseRow)
          .filter(
            (
              item
            ): item is GameCollection =>
              item !== null
          );
      } catch {
        return [];
      }
    }
  );

export async function getPublicGameCollectionBySlug(
  slug: string
) {
  const collections =
    await getPublicGameCollections();

  return collections.find(
    (collection) =>
      collection.slug === slug
  );
}
