import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "../src/lib/admin/content-hash.ts";
import { parseEditorialPayload } from "../src/lib/admin/content-validation.ts";
import { getAdminDatabaseConfig } from "../src/lib/admin/database-config.ts";
import {
  buildEditorialMediaPublicPath,
  resolveEditorialMediaDiskPath,
} from "../src/lib/media/editorial-media.ts";
import { inspectSafeEditorialWebm } from "../src/lib/media/safe-webm.ts";

const FIXTURE_FLAG = "DEUNA_CARD_VIDEO_VISUAL_FIXTURE";
const FIXTURE_WEBM_BASE64 =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIwEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggIa7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAf0AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WI/QvhMWERGgmcgQAitZyDdW5kiIEAhoVWX1ZQOYOBASPjg4QdzWUA4JCwgUC6gSSagQJVsIRVuYEBElTDZ0B/c3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2MS43LjEwM3Nz2mPAi2PFiP0L4TFhERoJZ8ilRaOHRU5DT0RFUkSHmExhdmM2MS4xOS4xMDEgbGlidnB4LXZwOWfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuNTAwMDAwMDAwAB9DtnXt54EAo+iBAACAgkmDQgAD8AI2BjgkHBhCAAAgQABrQ///6UT+4KU3o8VSrdtJ/1U/RntlFLTcdJsyP6m92VMvCYN3//3Ceh0emoFV9EmWoW/eg7Wi7Hj2c8ZrczM2o/qbSj6QjAHsSPtzSmIhoBxTu2uRu4+zgQC3iveBAfGCAajwgQM=";

function isStrictlyContainedBy(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);

  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function assertVisualCiOnly() {
  if (
    process.env[FIXTURE_FLAG] !== "1" ||
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.DEUNA_VISUAL_OUTPUT_DIR === undefined ||
    process.env.DEUNA_VISUAL_ADMIN_USERNAME === undefined ||
    process.env.DEUNA_EDITORIAL_MEDIA_ROOT === undefined ||
    process.env.RUNNER_TEMP === undefined
  ) {
    throw new Error(
      `${FIXTURE_FLAG}=1 sólo puede usarse dentro del job visual aislado de GitHub Actions.`
    );
  }

  const host = process.env.DEUNA_DATABASE_HOST?.trim();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      "El fixture visual de Card video exige una PostgreSQL local/efímera."
    );
  }

  const runnerTemp = path.resolve(process.env.RUNNER_TEMP);
  const mediaRoot = path.resolve(process.env.DEUNA_EDITORIAL_MEDIA_ROOT);
  if (!isStrictlyContainedBy(runnerTemp, mediaRoot)) {
    throw new Error(
      "El fixture visual de Card video exige que el storage editorial viva dentro de RUNNER_TEMP."
    );
  }
}

async function writeFixtureWebm(slug: string) {
  const content = Buffer.from(FIXTURE_WEBM_BASE64, "base64");
  const inspection = inspectSafeEditorialWebm(content);

  if (!inspection) {
    throw new Error("El WebM mínimo del fixture no supera el inspector canónico.");
  }

  const publicPath = buildEditorialMediaPublicPath(
    slug,
    `${inspection.digest}.webm`
  );
  const resolved = resolveEditorialMediaDiskPath(publicPath);

  if (!resolved) {
    throw new Error("No se pudo resolver el storage editorial del fixture WebM.");
  }

  await mkdir(resolved.gameDirectory, { recursive: true });
  await writeFile(resolved.filePath, content);

  return {
    publicPath,
    bytes: inspection.bytes,
    digest: inspection.digest,
  };
}

type FixtureMode = "video" | "image";
type LegacyCardFixtureMode = "explicit-hover" | "inferred-hover";

type GameRow = {
  id: string;
  item_key: string;
  source_checksum: string;
  published_payload: unknown;
  revision: number;
  publication_number: number;
};

async function persistFixtureSnapshot(
  client: Client,
  item: GameRow,
  actorUserId: string,
  payload: unknown,
  fixture: string
) {
  const normalized = normalizeEditorialPayload(payload);
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
     VALUES ($1, 'draft_saved', 'game', $2, $3::jsonb)`,
    [
      actorUserId,
      item.item_key,
      JSON.stringify({
        revision: nextRevision,
        fixture,
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
     VALUES ($1, 'content_published', 'game', $2, $3::jsonb)`,
    [
      actorUserId,
      item.item_key,
      JSON.stringify({
        publicationNumber: nextPublication,
        revision: nextRevision,
        firstVisibility: false,
        fixture,
      }),
    ]
  );

  return {
    revision: nextRevision,
    publicationNumber: nextPublication,
  };
}

async function publishFixtureGame(
  client: Client,
  item: GameRow,
  actorUserId: string,
  mode: FixtureMode
) {
  const current = parseEditorialPayload("game", item.published_payload);
  const fixtureMedia = mode === "video" ? await writeFixtureWebm(current.slug) : null;
  const otherVideoMedia = { ...(current.videoMedia ?? {}) };
  delete otherVideoMedia.card;
  const videoMedia =
    mode === "video" && fixtureMedia
      ? {
          ...otherVideoMedia,
          card: {
            source: "independent" as const,
            clip: fixtureMedia.publicPath,
            viewport: {
              x: 0.5,
              y: 0.5,
              zoom: 1,
              aspect: "3:2" as const,
              confirmed: true,
            },
            playback: "always" as const,
          },
          detail: {
            clip: fixtureMedia.publicPath,
            viewport: {
              x: 0.5,
              y: 0.5,
              zoom: 1,
              aspect: "source" as const,
              confirmed: true,
            },
            playback: "always" as const,
          },
        }
      : Object.keys(otherVideoMedia).length > 0
        ? otherVideoMedia
        : undefined;
  const next = parseEditorialPayload("game", {
    ...current,
    mediaModes: {
      ...(current.mediaModes ?? {}),
      card: mode,
      ...(mode === "video" ? { detail: "video" as const } : {}),
    },
    videoMedia,
  });
  const persisted = await persistFixtureSnapshot(
    client,
    item,
    actorUserId,
    next,
    `card-${mode}-browser-runtime`
  );

  return {
    itemKey: item.item_key,
    slug: next.slug,
    clip: fixtureMedia?.publicPath ?? null,
    mediaDigest: fixtureMedia?.digest ?? null,
    mediaBytes: fixtureMedia?.bytes ?? null,
    ...persisted,
  };
}

async function publishLegacyCardFixture(
  client: Client,
  item: GameRow,
  actorUserId: string,
  legacyMode: LegacyCardFixtureMode,
  withDetailVideo = false
) {
  const current = parseEditorialPayload("game", item.published_payload);
  const fixtureMedia = await writeFixtureWebm(current.slug);
  const otherVideoMedia = { ...(current.videoMedia ?? {}) };
  delete otherVideoMedia.card;

  const mediaModes = { ...(current.mediaModes ?? {}) };
  delete mediaModes.card;
  if (legacyMode === "explicit-hover") {
    mediaModes.card = "hover-video";
  }
  if (withDetailVideo) {
    mediaModes.detail = "video";
  }

  const rawLegacySnapshot = {
    ...current,
    mediaModes,
    videoMedia: {
      ...otherVideoMedia,
      card: {
        source: "independent" as const,
        clip: fixtureMedia.publicPath,
        viewport: {
          x: 0.5,
          y: 0.5,
          zoom: 1,
          aspect: "3:2" as const,
          confirmed: true,
        },
        playback: "hover" as const,
      },
      ...(withDetailVideo
        ? {
            detail: {
              clip: fixtureMedia.publicPath,
              viewport: {
                x: 0.5,
                y: 0.5,
                zoom: 1,
                aspect: "source" as const,
                confirmed: true,
              },
              playback: "always" as const,
            },
          }
        : {}),
    },
    previewClip: fixtureMedia.publicPath,
  };

  const persisted = await persistFixtureSnapshot(
    client,
    item,
    actorUserId,
    rawLegacySnapshot,
    `card-legacy-${legacyMode}-browser-runtime`
  );

  return {
    itemKey: item.item_key,
    slug: current.slug,
    clip: fixtureMedia.publicPath,
    mediaDigest: fixtureMedia.digest,
    mediaBytes: fixtureMedia.bytes,
    legacyMode,
    ...persisted,
  };
}

async function publishPreviewClipOnlyFixture(
  client: Client,
  item: GameRow,
  actorUserId: string
) {
  const current = parseEditorialPayload("game", item.published_payload);
  const fixtureMedia = await writeFixtureWebm(current.slug);

  const rawLegacySnapshot = {
    ...current,
    previewClip: fixtureMedia.publicPath,
  };
  delete rawLegacySnapshot.mediaModes;
  delete rawLegacySnapshot.videoMedia;

  const persisted = await persistFixtureSnapshot(
    client,
    item,
    actorUserId,
    rawLegacySnapshot,
    "card-legacy-preview-clip-only-browser-runtime"
  );

  return {
    itemKey: item.item_key,
    slug: current.slug,
    clip: fixtureMedia.publicPath,
    mediaDigest: fixtureMedia.digest,
    mediaBytes: fixtureMedia.bytes,
    legacyMode: "preview-clip-only" as const,
    ...persisted,
  };
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

    const fixtureSlugs = [
      "hogwarts-legacy",
      "red-dead-redemption-2",
      "cyberpunk-2077",
      "elden-ring",
    ] as const;
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
         AND item_key = ANY($1::text[])
         AND COALESCE(published_payload ->> 'coverImage', '') <> ''
       FOR UPDATE`,
      [fixtureSlugs]
    );
    const bySlug = new Map(
      itemResult.rows.map((item) => [item.item_key, item])
    );
    const hogwartsItem = bySlug.get("hogwarts-legacy");
    const redDeadItem = bySlug.get("red-dead-redemption-2");
    const cyberpunkItem = bySlug.get("cyberpunk-2077");
    const imageItem = bySlug.get("elden-ring");
    if (!hogwartsItem || !redDeadItem || !cyberpunkItem || !imageItem) {
      throw new Error(
        "Los fixtures visuales requieren Hogwarts Legacy, Red Dead Redemption 2, Cyberpunk 2077 y Elden Ring publicados con imagen base."
      );
    }

    const videoFixture = await publishLegacyCardFixture(
      client,
      hogwartsItem,
      actorUserId,
      "explicit-hover",
      true
    );
    const redDeadFixture = await publishLegacyCardFixture(
      client,
      redDeadItem,
      actorUserId,
      "inferred-hover"
    );
    const cyberpunkFixture = await publishPreviewClipOnlyFixture(
      client,
      cyberpunkItem,
      actorUserId
    );
    const imageFixture = await publishFixtureGame(
      client,
      imageItem,
      actorUserId,
      "image"
    );

    await client.query("COMMIT");

    const outputRoot = path.resolve(
      process.env.DEUNA_VISUAL_OUTPUT_DIR ?? "artifacts/visual-smoke"
    );
    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      path.join(outputRoot, "card-video-fixture.json"),
      `${JSON.stringify(
        {
          ...videoFixture,
          legacyCards: [videoFixture, redDeadFixture, cyberpunkFixture],
          imageItemKey: imageFixture.itemKey,
          imageSlug: imageFixture.slug,
          imageRevision: imageFixture.revision,
          imagePublicationNumber: imageFixture.publicationNumber,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    console.log(
      `Card + Contenedor video visual fixture: OK (legacy=${videoFixture.slug}+${redDeadFixture.slug}+${cyberpunkFixture.slug}, image=${imageFixture.slug}, bytes=${videoFixture.mediaBytes}).`
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

await main();