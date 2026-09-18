import "server-only";

import {
  randomUUID,
} from "node:crypto";
import { pathToFileURL } from "node:url";

import { Client } from "pg";

import {
  normalizeEditorialPayload,
  hashEditorialPayload,
} from "../src/lib/admin/content-hash.ts";
import {
  parseEditorialPayload,
} from "../src/lib/admin/content-validation.ts";
import {
  getAdminDatabaseConfig,
} from "../src/lib/admin/database-config.ts";

const FIXTURE_FLAG =
  "DEUNA_ADMIN_HISTORICAL_UPDATE_FIXTURE";
const historicalUpdateId = "visual-historical-update";
const historicalGameSlug = "elden-ring";

type VisualUpdateDraftInput = {
  updateId: string;
  gameSlug: string;
  version: string;
  publishedAt: string;
  type: "update" | "fix" | "content" | "hotfix";
  summary: string;
  featured: boolean;
  ownerUsername: string;
  auditMarker: string;
};

function assertVisualCiDatabase() {
  if (
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.DEUNA_VISUAL_OUTPUT_DIR === undefined
  ) {
    throw new Error(
      "Los fixtures editoriales directos sólo pueden ejecutarse dentro del visual-smoke aislado de GitHub Actions."
    );
  }

  const host = process.env.DEUNA_DATABASE_HOST?.trim();
  if (
    host !== "127.0.0.1" &&
    host !== "localhost" &&
    host !== "::1"
  ) {
    throw new Error(
      "Los fixtures editoriales directos exigen una PostgreSQL local/efímera."
    );
  }
}

export async function createVisualUpdateDraft(
  input: VisualUpdateDraftInput
) {
  assertVisualCiDatabase();

  const payload = normalizeEditorialPayload(
    parseEditorialPayload("game_update", {
      id: input.updateId,
      gameSlug: input.gameSlug,
      version: input.version,
      publishedAt: input.publishedAt,
      type: input.type,
      summary: input.summary,
      featured: input.featured,
    })
  );
  const serialized = JSON.stringify(payload);
  const digest = hashEditorialPayload(payload);
  const sourcePayload = {};
  const sourceSerialized = JSON.stringify(sourcePayload);
  const sourceDigest = hashEditorialPayload(sourcePayload);

  const client = new Client(
    getAdminDatabaseConfig("migration")
  );
  await client.connect();

  try {
    await client.query("BEGIN");

    const ownerResult = await client.query<{
      id: string;
    }>(
      `SELECT id::text
       FROM deuna_admin.admin_users
       WHERE username_key = lower($1)
         AND role = 'owner'
         AND active = true
       LIMIT 1`,
      [input.ownerUsername]
    );
    const ownerId = ownerResult.rows[0]?.id;
    if (!ownerId) {
      throw new Error(
        "No se encontró el Owner visual para crear el update sintético."
      );
    }

    const gameResult = await client.query<{
      id: string;
    }>(
      `SELECT id::text
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game'
         AND item_key = $1
       LIMIT 1`,
      [input.gameSlug]
    );
    if (!gameResult.rows[0]) {
      throw new Error(
        `El fixture visual requiere el juego ${input.gameSlug}.`
      );
    }

    const existing = await client.query<{
      id: string;
    }>(
      `SELECT id::text
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game_update'
         AND item_key = $1
       LIMIT 1`,
      [input.updateId]
    );
    if (existing.rows[0]) {
      throw new Error(
        `El update sintético ${input.updateId} ya existe en la base efímera.`
      );
    }

    const itemId = randomUUID();

    await client.query(
      `INSERT INTO deuna_admin.editorial_items
         (
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
           public_visible,
           updated_by
         )
       VALUES (
         $1,
         'game_update',
         $2,
         $3::jsonb,
         $4,
         false,
         $5::jsonb,
         'modified',
         $5::jsonb,
         $6,
         false,
         $7
       )`,
      [
        itemId,
        input.updateId,
        sourceSerialized,
        sourceDigest,
        serialized,
        digest,
        ownerId,
      ]
    );

    await client.query(
      `INSERT INTO deuna_admin.editorial_revisions
         (item_id, revision, payload, action, actor_user_id)
       VALUES ($1, 1, $2::jsonb, 'draft_saved', $3)`,
      [itemId, serialized, ownerId]
    );

    await client.query(
      `INSERT INTO deuna_admin.editorial_publications
         (
           item_id,
           publication_number,
           payload,
           checksum,
           source_revision,
           action,
           actor_user_id
         )
       VALUES ($1, 1, $2::jsonb, $3, 1, 'bootstrap', $4)`,
      [itemId, serialized, digest, ownerId]
    );

    await client.query(
      `INSERT INTO deuna_admin.admin_audit_log
         (user_id, action, entity_type, entity_id, details)
       VALUES (
         $1,
         'content_created',
         'game_update',
         $2,
         $3::jsonb
       )`,
      [
        ownerId,
        input.updateId,
        JSON.stringify({
          publicVisible: false,
          revision: 1,
          publicationNumber: 1,
          visualFixture: input.auditMarker,
        }),
      ]
    );

    await client.query("COMMIT");

    return {
      revision: 1,
      publicationNumber: 1,
      payload,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  if (process.env[FIXTURE_FLAG] !== "1") {
    throw new Error(
      "El fixture histórico exige DEUNA_ADMIN_HISTORICAL_UPDATE_FIXTURE=1."
    );
  }

  const ownerUsername =
    process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
  if (!ownerUsername) {
    throw new Error(
      "Falta DEUNA_VISUAL_ADMIN_USERNAME para atribuir el fixture histórico."
    );
  }

  await createVisualUpdateDraft({
    updateId: historicalUpdateId,
    gameSlug: historicalGameSlug,
    version: "legacy-ci-draft",
    publishedAt: "2026-01-15T12:00:00.000Z",
    type: "fix",
    summary:
      "Borrador histórico sintético para validar compatibilidad editorial sin reabrir el flujo legacy de creación.",
    featured: false,
    ownerUsername,
    auditMarker: "historical-update-editor",
  });

  console.log(
    `Admin historical update fixture: OK (${historicalUpdateId}, privado, revisión 1, asociado a ${historicalGameSlug}).`
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (invokedPath === import.meta.url) {
  await main();
}
