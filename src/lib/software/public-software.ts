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
import {
  orderPublicSoftware,
} from "@/lib/software/software-presentation";
import type {
  Software,
} from "@/types/software";

type SoftwareRow = {
  item_key: string;
  published_payload: unknown;
  public_visible: boolean;
};

function parseRow(
  row: SoftwareRow
): Software | null {
  if (!row.public_visible) {
    return null;
  }

  try {
    const software =
      parseEditorialPayload(
        "software",
        row.published_payload
      );

    return software.slug ===
      row.item_key
      ? software
      : null;
  } catch {
    return null;
  }
}

export const getPublicSoftware =
  cache(
    async (): Promise<
      Software[]
    > => {
      await connection();

      try {
        const result =
          await adminQuery<SoftwareRow>(
            `SELECT
               item_key,
               published_payload,
               public_visible
             FROM deuna_admin.editorial_items
             WHERE item_type = 'software'`
          );

        return orderPublicSoftware(
          result.rows
            .map(parseRow)
            .filter(
              (
                item
              ): item is Software =>
                item !== null
            )
        );
      } catch {
        return [];
      }
    }
  );

export async function getPublicSoftwareBySlug(
  slug: string
) {
  const items =
    await getPublicSoftware();

  return items.find(
    (item) =>
      item.slug === slug
  );
}
