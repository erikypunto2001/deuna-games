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
      "El fixture de historial legacy sólo puede ejecutarse dentro del job visual aislado de GitHub Actions."
    );
  }

  const host = process.env.DEUNA_DATABASE_HOST?.trim();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      "El fixture de historial legacy exige una PostgreSQL local/efímera."
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
    await client.query("BEGIN");

    const itemResult = await client.query<{
      id: string;
      publication_number: number;
      public_visible: boolean;
    }>(
      `SELECT id::text, publication_number, public_visible
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game'
         AND item_key = $1
       LIMIT 1
       FOR UPDATE`,
      [fixture.itemKey]
    );
    const item = itemResult.rows[0];
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
    const itemId = item.id;

    const legacyResult = await client.query<{
      id: string;
      publication_number: number;
    }>(
      `SELECT id::text, publication_number
       FROM deuna_admin.editorial_publications
       WHERE item_id = $1
         AND publication_number < $2
       ORDER BY publication_number ASC
       LIMIT 1
       FOR UPDATE`,
      [itemId, fixture.publicationNumber]
    );
    const legacy = legacyResult.rows[0];
    if (!legacy) {
      throw new Error(
        "El juego del fixture necesita al menos una publicación histórica previa."
      );
    }

    await client.query(
      `UPDATE deuna_admin.editorial_publications
       SET payload = $2::jsonb
       WHERE id = $1`,
      [
        legacy.id,
        JSON.stringify({
          slug: fixture.itemKey,
          legacyMalformedFixture: true,
        }),
      ]
    );

    const currentPublication = await client.query<{ id: string }>(
      `SELECT id::text
       FROM deuna_admin.editorial_publications
       WHERE item_id = $1
         AND publication_number = $2
       LIMIT 1
       FOR UPDATE`,
      [itemId, fixture.publicationNumber]
    );
    const currentPublicationId = currentPublication.rows[0]?.id;
    if (!currentPublicationId) {
      throw new Error(
        "No se encontró la fila histórica de la publicación actual del fixture."
      );
    }

    /*
     * Simulamos un gap legacy: editorial_items conserva el snapshot público
     * canónico y su publication_number, pero la tabla histórica perdió la fila
     * equivalente. El serving debe seguir autorizando el WebM actual sin abrir
     * borradores privados.
     */
    await client.query(
      `DELETE FROM deuna_admin.editorial_publications
       WHERE id = $1`,
      [currentPublicationId]
    );

    await client.query("COMMIT");

    console.log(
      `Card media legacy history fixture: OK (${fixture.itemKey}, publicación legacy #${legacy.publication_number} inválida; fila histórica actual #${fixture.publicationNumber} ausente; snapshot público preservado).`
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

await main();
