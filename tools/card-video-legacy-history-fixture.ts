import { readFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

import { getAdminDatabaseConfig } from "../src/lib/admin/database-config.ts";

const FIXTURE_FLAG = "DEUNA_CARD_VIDEO_VISUAL_FIXTURE";

function assertVisualCiOnly() {
  if (
    process.env[FIXTURE_FLAG] !== "1" ||
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.DEUNA_VISUAL_OUTPUT_DIR === undefined
  ) {
    throw new Error(
      "El fixture Card video sin historial sólo puede ejecutarse dentro del job visual aislado de GitHub Actions."
    );
  }

  const host = process.env.DEUNA_DATABASE_HOST?.trim();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      "El fixture Card video sin historial exige una PostgreSQL local/efímera."
    );
  }
}

async function main() {
  assertVisualCiOnly();

  const outputRoot = path.resolve(
    process.env.DEUNA_VISUAL_OUTPUT_DIR ?? "artifacts/visual-smoke"
  );
  const fixture = JSON.parse(
    await readFile(
      path.join(outputRoot, "card-video-fixture.json"),
      "utf8"
    )
  ) as {
    itemKey?: string;
    publicationNumber?: number;
  };

  if (!fixture.itemKey || !fixture.publicationNumber) {
    throw new Error(
      "El fixture Card video no contiene itemKey/publicationNumber."
    );
  }

  const client = new Client(getAdminDatabaseConfig("migration"));
  await client.connect();

  try {
    const result = await client.query<{
      publication_number: number;
      public_visible: boolean;
      revisions: number;
      publications: number;
    }>(
      `SELECT
         item.publication_number,
         item.public_visible,
         (
           SELECT count(*)::int
             FROM deuna_admin.editorial_revisions AS revision
            WHERE revision.item_id = item.id
         ) AS revisions,
         (
           SELECT count(*)::int
             FROM deuna_admin.editorial_publications AS publication
            WHERE publication.item_id = item.id
         ) AS publications
       FROM deuna_admin.editorial_items AS item
       WHERE item.item_type = 'game'
         AND item.item_key = $1
       LIMIT 1`,
      [fixture.itemKey]
    );
    const item = result.rows[0];

    if (!item) {
      throw new Error("No se encontró el juego del fixture Card video.");
    }
    if (
      item.publication_number !== fixture.publicationNumber ||
      !item.public_visible
    ) {
      throw new Error(
        "El fixture Card video no coincide con el snapshot público actual."
      );
    }
    if (item.revisions !== 0 || item.publications !== 0) {
      throw new Error(
        `El juego del fixture conserva historial restaurable: revisiones=${item.revisions}, publicaciones=${item.publications}.`
      );
    }

    /*
     * El navegador que corre inmediatamente después debe reproducir el WebM
     * usando sólo editorial_items.published_payload. Esta aserción evita que
     * el serving vuelva a depender de filas históricas de juegos.
     */
    console.log(
      `Card media no-history fixture: OK (${fixture.itemKey}, publicación actual #${fixture.publicationNumber}, revisiones históricas=0, publicaciones históricas=0).`
    );
  } finally {
    await client.end();
  }
}

await main();
