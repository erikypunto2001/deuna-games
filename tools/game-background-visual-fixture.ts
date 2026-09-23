import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "../src/lib/admin/content-hash.ts";
import { parseEditorialPayload } from "../src/lib/admin/content-validation.ts";
import { getAdminDatabaseConfig } from "../src/lib/admin/database-config.ts";

const FIXTURE_FLAG = "DEUNA_GAME_BACKGROUND_VISUAL_FIXTURE";
const FIXTURE_SLUG = "elden-ring";

type GameRow = {
  id: string;
  item_key: string;
  source_checksum: string;
  published_payload: unknown;
  revision: number;
  publication_number: number;
};

function assertVisualCiOnly() {
  if (
    process.env[FIXTURE_FLAG] !== "1" ||
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.DEUNA_VISUAL_OUTPUT_DIR === undefined ||
    process.env.DEUNA_VISUAL_ADMIN_USERNAME === undefined
  ) {
    throw new Error(
      `${FIXTURE_FLAG}=1 sólo puede usarse dentro del job visual aislado de GitHub Actions.`
    );
  }

  const host = process.env.DEUNA_DATABASE_HOST?.trim();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      "El fixture visual de Fondo exige una PostgreSQL local/efímera."
    );
  }
}

async function main() {
  assertVisualCiOnly();

  const client = new Client(getAdminDatabaseConfig("migration"));
  await client.connect();

  try {
    await client.query("BEGIN");

    const actorResult = await client.query<{ id: string }>(
      `SELECT id::text
       FROM deuna_admin.admin_users
       WHERE username_key = lower($1)
         AND active = true
       LIMIT 1`,
      [process.env.DEUNA_VISUAL_ADMIN_USERNAME]
    );
    const actorUserId = actorResult.rows[0]?.id;
    if (!actorUserId) {
      throw new Error("No se encontró el owner visual aislado de CI.");
    }

    const itemResult = await client.query<GameRow>(
      `SELECT
         id::text,
         item_key,
         source_checksum,
         published_payload,
         revision,
         publication_number
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game'
         AND public_visible = true
         AND published_payload ->> 'slug' = $1
       LIMIT 1
       FOR UPDATE`,
      [FIXTURE_SLUG]
    );
    const item = itemResult.rows[0];
    if (!item) {
      throw new Error(
        `No se encontró el juego publicado ${FIXTURE_SLUG} para el fixture visual de Fondo.`
      );
    }

    const current = parseEditorialPayload("game", item.published_payload);
    const image = current.heroImage?.trim() || current.coverImage?.trim();
    if (!image) {
      throw new Error(
        "El fixture visual de Fondo necesita una imagen ya publicada del juego."
      );
    }

    const next = parseEditorialPayload("game", {
      ...current,
      backgroundImage: image,
      imageMedia: {
        ...current.imageMedia,
        background: {
          x: 0.38,
          y: 0.44,
          zoom: 1.12,
          confirmed: true,
        },
      },
      mediaModes: {
        ...current.mediaModes,
        background: "image",
      },
    });
    const normalized = normalizeEditorialPayload(next);
    const serialized = JSON.stringify(normalized);
    const digest = hashEditorialPayload(normalized);
    const nextRevision = item.revision + 1;
    const nextPublication = item.publication_number + 1;
    const draftStatus =
      digest === item.source_checksum ? "synced" : "modified";

    await client.query(
      `UPDATE deuna_admin.editorial_items
       SET draft_payload = $2::jsonb,
           draft_status = $3,
           revision = $4,
           updated_at = now(),
           updated_by = $5
       WHERE id = $1`,
      [item.id, serialized, draftStatus, nextRevision, actorUserId]
    );
    await client.query(
      `INSERT INTO deuna_admin.admin_audit_log
         (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'draft_saved', 'game', $2, $3::jsonb)`,
      [
        actorUserId,
        item.item_key,
        JSON.stringify({
          revision: nextRevision,
          fixture: "game-background-browser-runtime",
        }),
      ]
    );

    await client.query(
      `UPDATE deuna_admin.editorial_items
       SET published_payload = $2::jsonb,
           published_checksum = $3,
           published_from_revision = $4,
           publication_number = $5,
           published_at = now(),
           published_by = $6,
           public_visible = true
       WHERE id = $1`,
      [
        item.id,
        serialized,
        digest,
        nextRevision,
        nextPublication,
        actorUserId,
      ]
    );
    await client.query(
      `INSERT INTO deuna_admin.admin_audit_log
         (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'content_published', 'game', $2, $3::jsonb)`,
      [
        actorUserId,
        item.item_key,
        JSON.stringify({
          publicationNumber: nextPublication,
          revision: nextRevision,
          firstVisibility: false,
          fixture: "game-background-browser-runtime",
        }),
      ]
    );

    await client.query("COMMIT");

    const outputRoot = path.resolve(process.env.DEUNA_VISUAL_OUTPUT_DIR);
    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      path.join(outputRoot, "game-background-fixture.json"),
      `${JSON.stringify(
        {
          slug: normalized.slug,
          image,
          mode: "image",
          viewport: normalized.imageMedia?.background ?? null,
          revision: nextRevision,
          publicationNumber: nextPublication,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    console.log(
      `Game background visual fixture: OK (slug=${normalized.slug}, revision=${nextRevision}, publication=${nextPublication}).`
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

await main();
