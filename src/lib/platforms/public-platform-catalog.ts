import "server-only";

import { cache } from "react";
import {
  connection,
} from "next/server";

import {
  PLATFORM_CATALOG_EDITORIAL_KEY,
  sourcePlatformCatalog,
} from "@/data/platform-catalog";
import {
  adminQuery,
} from "@/lib/admin/database";
import {
  parseEditorialPayload,
} from "@/lib/admin/content-validation";
import type {
  PlatformCatalog,
} from "@/types/platform";

type PlatformCatalogRow = {
  published_payload: unknown;
};

function sourceFallback(): PlatformCatalog {
  return structuredClone(
    sourcePlatformCatalog
  );
}

export const getPublicPlatformCatalog =
  cache(
    async (): Promise<PlatformCatalog> => {
      await connection();

      try {
        const result =
          await adminQuery<PlatformCatalogRow>(
            `SELECT published_payload
               FROM deuna_admin.editorial_items
              WHERE item_type = 'platform_catalog'
                AND item_key = $1
                AND public_visible = true
              LIMIT 1`,
            [
              PLATFORM_CATALOG_EDITORIAL_KEY,
            ]
          );
        const row =
          result.rows[0];

        return row
          ? parseEditorialPayload(
              "platform_catalog",
              row.published_payload
            )
          : sourceFallback();
      } catch {
        return sourceFallback();
      }
    }
  );
