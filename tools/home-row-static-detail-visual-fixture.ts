import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "../src/lib/admin/content-hash.ts";
import { parseEditorialPayload } from "../src/lib/admin/content-validation.ts";
import { getAdminDatabaseConfig } from "../src/lib/admin/database-config.ts";
import { resolveHomeConfig } from "../src/data/home-config.ts";

const FIXTURE_FLAG = "DEUNA_CARD_VIDEO_VISUAL_FIXTURE";

type HomeRowFixtureMode = "interaction" | "static-detail";

function requestedRevealMode(): HomeRowFixtureMode {
  const raw = process.argv.find((value) => value.startsWith("--mode="));
  const value = raw?.slice("--mode=".length) ?? "static-detail";

  if (value === "interaction" || value === "static-detail") {
    return value;
  }

  throw new Error(
    "El modo del fixture Home debe ser interaction o static-detail."
  );
}

function assertVisualCiOnly() {
  if (
    process.env[FIXTURE_FLAG] !== "1" ||
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.DEUNA_VISUAL_OUTPUT_DIR === undefined ||
    process.env.DEUNA_VISUAL_ADMIN_USERNAME === undefined ||
    process.env.RUNNER_TEMP === undefined
  ) {
    throw new Error(
      "El fixture de fila estática sólo puede ejecutarse dentro del visual-smoke aislado de GitHub Actions."
    );
  }

  const host = process.env.DEUNA_DATABASE_HOST?.trim();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      "El fixture de fila estática exige una PostgreSQL local/efímera."
    );
  }
}

async function main() {
  assertVisualCiOnly();
  const revealMode = requestedRevealMode();
  const fixtureName =
    revealMode === "interaction"
      ? "home-row-interaction"
      : "home-row-static-detail";

  const outputRoot = path.resolve(
    process.env.DEUNA_VISUAL_OUTPUT_DIR ?? "artifacts/visual-smoke"
  );
  const cardFixturePath = path.join(
    outputRoot,
    "card-video-fixture.json"
  );
  const cardFixture = JSON.parse(
    await readFile(cardFixturePath, "utf8")
  ) as {
    slug?: string;
    clip?: string;
    imageSlug?: string;
  };

  if (
    !cardFixture.slug ||
    !cardFixture.clip ||
    !cardFixture.imageSlug ||
    cardFixture.imageSlug === cardFixture.slug
  ) {
    throw new Error(
      "El fixture Home requiere descriptores válidos y distintos para Card Video e Imagen."
    );
  }

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

    const itemResult = await client.query<{
      id: string;
      item_key: string;
      source_checksum: string;
      published_payload: unknown;
      revision: number;
      publication_number: number;
    }>(
      `SELECT
         id::text,
         item_key,
         source_checksum,
         published_payload,
         revision,
         publication_number
       FROM deuna_admin.editorial_items
       WHERE item_type = 'home_config'
         AND item_key = 'home'
         AND public_visible = true
       LIMIT 1
       FOR UPDATE`
    );
    const item = itemResult.rows[0];
    if (!item) {
      throw new Error(
        "No hay un snapshot público de Inicio para el fixture visual."
      );
    }

    const current = parseEditorialPayload(
      "home_config",
      item.published_payload
    );
    const resolved = resolveHomeConfig(current);
    const fixtureSlugs = [cardFixture.slug, cardFixture.imageSlug];
    const popularSlugs = [
      ...fixtureSlugs,
      ...resolved.popularSlugs.filter(
        (slug) => !fixtureSlugs.includes(slug)
      ),
    ].slice(0, 24);
    const sections = resolved.sections.map((section) =>
      section.id === "popular"
        ? {
            ...section,
            cardRevealMode: revealMode,
          }
        : section
    );

    const next = parseEditorialPayload("home_config", {
      ...current,
      popularSlugs,
      curation: {
        ...resolved.curation,
        popular: { mode: "manual" },
      },
      sections,
    });
    const normalized = normalizeEditorialPayload(next);
    const serialized = JSON.stringify(normalized);
    const digest = hashEditorialPayload(normalized);
    const draftStatus =
      digest === item.source_checksum ? "synced" : "modified";
    const nextRevision = item.revision + 1;
    const nextPublication = item.publication_number + 1;

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
      `INSERT INTO deuna_admin.editorial_revisions
         (item_id, revision, payload, action, actor_user_id)
       VALUES ($1, $2, $3::jsonb, 'draft_saved', $4)`,
      [item.id, nextRevision, serialized, actorUserId]
    );
    await client.query(
      `INSERT INTO deuna_admin.admin_audit_log
         (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'draft_saved', 'home_config', $2, $3::jsonb)`,
      [
        actorUserId,
        item.item_key,
        JSON.stringify({
          revision: nextRevision,
          fixture: `${fixtureName}-browser-runtime`,
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
       VALUES ($1, $2, $3::jsonb, $4, $5, 'published', $6)`,
      [
        item.id,
        nextPublication,
        serialized,
        digest,
        nextRevision,
        actorUserId,
      ]
    );
    await client.query(
      `INSERT INTO deuna_admin.admin_audit_log
         (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'content_published', 'home_config', $2, $3::jsonb)`,
      [
        actorUserId,
        item.item_key,
        JSON.stringify({
          publicationNumber: nextPublication,
          revision: nextRevision,
          firstVisibility: false,
          fixture: `${fixtureName}-browser-runtime`,
        }),
      ]
    );

    await client.query("COMMIT");

    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      path.join(outputRoot, `${fixtureName}-fixture.json`),
      `${JSON.stringify(
        {
          slug: cardFixture.slug,
          clip: cardFixture.clip,
          imageSlug: cardFixture.imageSlug,
          revision: nextRevision,
          publicationNumber: nextPublication,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    console.log(
      `Home row ${revealMode} fixture: OK (video=${cardFixture.slug}, image=${cardFixture.imageSlug}, revision=${nextRevision}, publication=${nextPublication}).`
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

await main();