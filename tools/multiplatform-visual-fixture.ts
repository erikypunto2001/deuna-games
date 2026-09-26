import "server-only";

import {
  randomUUID,
} from "node:crypto";

import { Client } from "pg";

import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "../src/lib/admin/content-hash.ts";
import {
  parseEditorialPayload,
} from "../src/lib/admin/content-validation.ts";
import {
  getAdminDatabaseConfig,
} from "../src/lib/admin/database-config.ts";

const FIXTURE_FLAG =
  "DEUNA_MULTIPLATFORM_VISUAL_FIXTURE";
export const visualSoftwareSlug =
  "visual-emulator";
export const visualCollectionSlug =
  "visual-collection";
const representativeGameSlug =
  "elden-ring";

function assertVisualCiOnly() {
  if (
    process.env[FIXTURE_FLAG] !== "1" ||
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    !process.env.DEUNA_VISUAL_OUTPUT_DIR ||
    !process.env.DEUNA_VISUAL_ADMIN_USERNAME
  ) {
    throw new Error(
      "El fixture multiplataforma visual sólo puede ejecutarse dentro del visual-smoke aislado de GitHub Actions."
    );
  }

  const host =
    process.env.DEUNA_DATABASE_HOST?.trim();

  if (
    host !== "127.0.0.1" &&
    host !== "localhost" &&
    host !== "::1"
  ) {
    throw new Error(
      "El fixture multiplataforma visual exige una PostgreSQL local/efímera."
    );
  }
}

async function main() {
  assertVisualCiOnly();

  const client = new Client(
    getAdminDatabaseConfig(
      "migration"
    )
  );
  await client.connect();

  try {
    await client.query("BEGIN");

    const ownerResult =
      await client.query<{
        id: string;
      }>(
        `SELECT id::text
         FROM deuna_admin.admin_users
         WHERE username_key = lower($1)
           AND role = 'owner'
           AND active = true
         LIMIT 1`,
        [
          process.env
            .DEUNA_VISUAL_ADMIN_USERNAME,
        ]
      );
    const ownerId =
      ownerResult.rows[0]?.id;

    if (!ownerId) {
      throw new Error(
        "No se encontró el Owner visual aislado de CI."
      );
    }

    const platformResult =
      await client.query<{
        published_payload: unknown;
      }>(
        `SELECT published_payload
         FROM deuna_admin.editorial_items
         WHERE item_type = 'platform_catalog'
           AND item_key = 'platforms'
           AND public_visible = true
         LIMIT 1`
      );
    const platformCatalog =
      parseEditorialPayload(
        "platform_catalog",
        platformResult.rows[0]
          ?.published_payload
      );
    const pcPlatform =
      platformCatalog.platforms.find(
        (platform) =>
          platform.id ===
          "pc-windows"
      ) ??
      platformCatalog.platforms.find(
        (platform) =>
          platform.active
      );

    if (!pcPlatform) {
      throw new Error(
        "El fixture visual necesita una plataforma pública activa."
      );
    }

    const gameResult =
      await client.query<{
        item_key: string;
      }>(
        `SELECT item_key
         FROM deuna_admin.editorial_items
         WHERE item_type = 'game'
           AND item_key = $1
           AND public_visible = true
         LIMIT 1`,
        [
          representativeGameSlug,
        ]
      );

    if (!gameResult.rows[0]) {
      throw new Error(
        `El fixture visual requiere el juego público ${representativeGameSlug}.`
      );
    }

    const software =
      normalizeEditorialPayload(
        parseEditorialPayload(
          "software",
          {
            id: visualSoftwareSlug,
            slug: visualSoftwareSlug,
            name: "Emulador visual CI",
            shortDescription:
              "Fixture público para validar Programas.",
            description:
              "Programa sintético publicado únicamente dentro del visual-smoke aislado para comprobar layout, navegación y descargas.",
            kind: "emulator",
            version: "1.0.0-ci",
            developer:
              "DeUna visual fixture",
            runsOnPlatformIds: [
              pcPlatform.id,
            ],
            emulatesPlatformIds: [
              pcPlatform.id,
            ],
            packages: [
              {
                id: "principal",
                kind: "archive",
                label:
                  "Paquete de prueba",
                platformId:
                  pcPlatform.id,
                sources: [
                  {
                    id: "fixture",
                    name: "Fixture",
                    href:
                      "/programas/" +
                      visualSoftwareSlug,
                    label:
                      "Abrir descarga de prueba",
                    enabled: true,
                    status:
                      "available",
                  },
                ],
              },
            ],
            featured: true,
          }
        )
      );

    const collection =
      normalizeEditorialPayload(
        parseEditorialPayload(
          "game_collection",
          {
            id:
              visualCollectionSlug,
            slug:
              visualCollectionSlug,
            title:
              "Colección visual CI",
            description:
              "Colección sintética publicada únicamente dentro del visual-smoke aislado para validar la experiencia pública y administrativa.",
            gameSlugs: [
              representativeGameSlug,
            ],
            featured: true,
          }
        )
      );

    for (
      const [
        type,
        key,
        payload,
      ] of [
        [
          "software",
          visualSoftwareSlug,
          software,
        ],
        [
          "game_collection",
          visualCollectionSlug,
          collection,
        ],
      ] as const
    ) {
      const serialized =
        JSON.stringify(
          payload
        );
      const digest =
        hashEditorialPayload(
          payload
        );

      await client.query(
        `INSERT INTO deuna_admin.editorial_items (
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
           published_from_revision,
           publication_number,
           public_visible,
           published_at,
           published_by,
           updated_by
         )
         VALUES (
           $1,
           $2,
           $3,
           '{}'::jsonb,
           $4,
           false,
           $5::jsonb,
           'modified',
           $5::jsonb,
           $6,
           1,
           1,
           true,
           now(),
           $7,
           $7
         )
         ON CONFLICT (item_type, item_key)
         DO UPDATE SET
           draft_payload =
             EXCLUDED.draft_payload,
           published_payload =
             EXCLUDED.published_payload,
           published_checksum =
             EXCLUDED.published_checksum,
           published_from_revision = 1,
           publication_number = 1,
           public_visible = true,
           published_at = now(),
           published_by =
             EXCLUDED.published_by,
           updated_by =
             EXCLUDED.updated_by,
           updated_at = now()`,
        [
          randomUUID(),
          type,
          key,
          hashEditorialPayload(
            {}
          ),
          serialized,
          digest,
          ownerId,
        ]
      );
    }

    await client.query("COMMIT");

    console.log(
      `Multiplatform visual fixture: OK (software=${visualSoftwareSlug}; collection=${visualCollectionSlug}; game=${representativeGameSlug}).`
    );
  } catch (error) {
    await client.query(
      "ROLLBACK"
    ).catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

await main();
