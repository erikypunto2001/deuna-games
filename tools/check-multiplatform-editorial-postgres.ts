import {
  randomUUID,
} from "node:crypto";
import process from "node:process";

import { Pool } from "pg";

import {
  parseEditorialPayload,
} from "../src/lib/admin/content-validation.ts";
import {
  getAdminDatabaseConfig,
} from "../src/lib/admin/database-config.ts";
import {
  validatePublishedCollectionSlugNamespace,
  validatePublishedGameCollectionRelations,
  validatePublishedGameHide,
  validatePublishedGameRelations,
  validatePublishedPlatformCatalogRemoval,
  validatePublishedPlatformCollectionNamespace,
  validatePublishedSoftwareHide,
  validatePublishedSoftwareRelations,
} from "../src/lib/admin/managed-editorial-relations.ts";

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

if (
  process.env.CI !== "true" ||
  process.env.GITHUB_ACTIONS !== "true"
) {
  console.log(
    "Relaciones multiplataforma PostgreSQL: omitido fuera de GitHub Actions."
  );
  process.exit(0);
}

const runtimePool = new Pool(
  getAdminDatabaseConfig("runtime")
);
const migrationPool = new Pool(
  getAdminDatabaseConfig("migration")
);
const runtimeClient =
  await runtimePool.connect();
const migrationClient =
  await migrationPool.connect();

const suffix = randomUUID()
  .replaceAll("-", "")
  .slice(0, 12);
const softwareSlug =
  `ci-software-${suffix}`;
const gameSlug =
  `ci-game-${suffix}`;
const collectionSlug =
  `ci-collection-${suffix}`;

try {
  const catalogResult =
    await runtimeClient.query<{
      published_payload: unknown;
    }>(
      `SELECT published_payload
         FROM deuna_admin.editorial_items
        WHERE item_type = 'platform_catalog'
          AND item_key = 'platforms'
          AND public_visible = true
        LIMIT 1`
    );
  const catalogRow =
    catalogResult.rows[0];
  assert(
    catalogRow,
    "Falta el catálogo público de plataformas importado por CI."
  );

  const catalog =
    parseEditorialPayload(
      "platform_catalog",
      catalogRow.published_payload
    );
  const platform =
    catalog.platforms.find(
      (item) => item.active
    );
  assert(
    platform,
    "El catálogo público no contiene una plataforma activa."
  );

  const software =
    parseEditorialPayload(
      "software",
      {
        id: softwareSlug,
        slug: softwareSlug,
        name: "CI Emulator",
        description:
          "Fixture temporal para validar dependencias públicas.",
        kind: "emulator",
        runsOnPlatformIds: [
          platform.id,
        ],
        imageAlt:
          "Fixture CI",
      }
    );

  await migrationClient.query(
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
       public_visible
     )
     VALUES (
       $1,
       'software',
       $2,
       $3::jsonb,
       $4,
       false,
       $3::jsonb,
       'modified',
       $3::jsonb,
       $4,
       false
     )`,
    [
      randomUUID(),
      softwareSlug,
      JSON.stringify(
        software
      ),
      "a".repeat(64),
    ]
  );

  const game =
    parseEditorialPayload(
      "game",
      {
        id: gameSlug,
        slug: gameSlug,
        title: "CI Game",
        description:
          "Fixture temporal para validar relaciones.",
        category: "Pruebas",
        imageAlt:
          "Fixture CI",
        releases: [
          {
            id: "main",
            platformId:
              platform.id,
            recommendedSoftwareSlugs: [
              softwareSlug,
            ],
          },
        ],
      }
    );

  const blockedGame =
    await validatePublishedGameRelations(
      runtimeClient,
      game
    );
  assert(
    !blockedGame.ok &&
      blockedGame.missingSoftware.includes(
        softwareSlug
      ),
    "Un juego no debe poder validar un programa relacionado que todavía está oculto."
  );

  await migrationClient.query(
    `UPDATE deuna_admin.editorial_items
        SET public_visible = true
      WHERE item_type = 'software'
        AND item_key = $1`,
    [
      softwareSlug,
    ]
  );

  const visibleGame =
    await validatePublishedGameRelations(
      runtimeClient,
      game
    );
  assert(
    visibleGame.ok,
    "El juego debe validar cuando plataforma y programa relacionado están publicados."
  );

  const softwareRelations =
    await validatePublishedSoftwareRelations(
      runtimeClient,
      software
    );
  assert(
    softwareRelations.ok,
    "Un programa con plataforma pública válida debe superar la validación."
  );

  await migrationClient.query(
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
       public_visible
     )
     VALUES (
       $1,
       'game',
       $2,
       $3::jsonb,
       $4,
       false,
       $3::jsonb,
       'modified',
       $3::jsonb,
       $4,
       false
     )`,
    [
      randomUUID(),
      gameSlug,
      JSON.stringify(
        game
      ),
      "b".repeat(64),
    ]
  );

  const blockedCollection =
    await validatePublishedGameCollectionRelations(
      runtimeClient,
      [
        gameSlug,
      ]
    );
  assert(
    !blockedCollection.ok &&
      blockedCollection.missing.includes(
        gameSlug
      ),
    "Una colección no debe aceptar un juego todavía oculto."
  );

  await migrationClient.query(
    `UPDATE deuna_admin.editorial_items
        SET public_visible = true
      WHERE item_type = 'game'
        AND item_key = $1`,
    [
      gameSlug,
    ]
  );

  const visibleCollection =
    await validatePublishedGameCollectionRelations(
      runtimeClient,
      [
        gameSlug,
      ]
    );
  assert(
    visibleCollection.ok,
    "Una colección debe aceptar un juego publicado."
  );

  const softwareHide =
    await validatePublishedSoftwareHide(
      runtimeClient,
      softwareSlug
    );
  assert(
    !softwareHide.ok &&
      softwareHide.usedBy.includes(
        gameSlug
      ),
    "No debe ocultarse un programa todavía recomendado por un juego público."
  );

  const collection =
    parseEditorialPayload(
      "game_collection",
      {
        id: collectionSlug,
        slug: collectionSlug,
        title: "CI Collection",
        description:
          "Fixture temporal para validar ocultamiento.",
        gameSlugs: [
          gameSlug,
        ],
        imageAlt:
          "Fixture CI",
      }
    );

  await migrationClient.query(
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
       public_visible
     )
     VALUES (
       $1,
       'game_collection',
       $2,
       $3::jsonb,
       $4,
       false,
       $3::jsonb,
       'modified',
       $3::jsonb,
       $4,
       true
     )`,
    [
      randomUUID(),
      collectionSlug,
      JSON.stringify(
        collection
      ),
      "c".repeat(64),
    ]
  );

  const gameHide =
    await validatePublishedGameHide(
      runtimeClient,
      gameSlug
    );
  assert(
    !gameHide.ok &&
      gameHide.usedBy.includes(
        collectionSlug
      ),
    "No debe ocultarse un juego todavía referenciado por una colección pública."
  );

  const collectionSlugCollision =
    await validatePublishedCollectionSlugNamespace(
      runtimeClient,
      platform.id
    );
  assert(
    !collectionSlugCollision.ok,
    "Una colección editorial no debe poder usar el ID de una plataforma pública activa."
  );

  const catalogNamespaceCollision =
    await validatePublishedPlatformCollectionNamespace(
      runtimeClient,
      {
        ...catalog,
        platforms: [
          ...catalog.platforms,
          {
            ...platform,
            id: collectionSlug,
            name:
              "CI collision platform",
            shortName:
              "CI collision",
            order:
              platform.order +
              10_000,
          },
        ],
      }
    );
  assert(
    !catalogNamespaceCollision.ok &&
      catalogNamespaceCollision.conflicts.includes(
        collectionSlug
      ),
    "Un catálogo público no debe poder introducir una plataforma con el slug de una colección visible."
  );

  const nextCatalog = {
    ...catalog,
    platforms:
      catalog.platforms.filter(
        (item) =>
          item.id !==
          platform.id
      ),
  };

  const blockedCatalog =
    await validatePublishedPlatformCatalogRemoval(
      runtimeClient,
      nextCatalog
    );
  assert(
    !blockedCatalog.ok &&
      blockedCatalog.missing.includes(
        platform.id
      ),
    "No debe publicarse un catálogo que quite una plataforma todavía usada por contenido público."
  );

  console.log(
    "Relaciones multiplataforma PostgreSQL: OK (publicación, ocultamiento y namespace de Colecciones protegen dependencias públicas con mínimo privilegio)."
  );
} finally {
  await migrationClient.query(
    `DELETE FROM deuna_admin.editorial_items
      WHERE (
        item_type = 'software'
        AND item_key = $1
      )
      OR (
        item_type = 'game'
        AND item_key = $2
      )
      OR (
        item_type = 'game_collection'
        AND item_key = $3
      )`,
    [
      softwareSlug,
      gameSlug,
      collectionSlug,
    ]
  ).catch(() => {});

  runtimeClient.release();
  migrationClient.release();
  await runtimePool.end();
  await migrationPool.end();
}
