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
// Patrón VP9 de 96×54 y 1 s: visualmente inequívoco para distinguir
// la capa de video del fallback de imagen en capturas de navegador.
const FIXTURE_WEBM_BASE64 =
  "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";

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