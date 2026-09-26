import "server-only";

import {
  createHash,
  randomUUID,
} from "node:crypto";

import type { PoolClient } from "pg";

import {
  resolveGameDownload,
} from "@/lib/games/download";
import {
  resolveGameReleases,
} from "@/lib/games/releases";
import {
  evaluateGamePublicationReadiness,
} from "@/lib/admin/game-publication-readiness";
import type {
  DistributionPackage,
  DistributionPackageKind,
  Game,
  GameDistributionMetadata,
  GameDownloadSource,
} from "@/types/game";
import type {
  GameUpdate,
  UpdateType,
} from "@/types/update";

import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "./content-hash";
import {
  parseEditorialPayload,
} from "./content-validation";
import {
  withAdminTransaction,
} from "./database";
import {
  verifyAdminSession,
} from "./session";

type GamePublicationRow = {
  id: string;
  item_key: string;
  source_checksum: string;
  draft_payload: unknown;
  published_payload: unknown;
  published_checksum: string;
  revision: number;
  publication_number: number;
  public_visible: boolean;
};

type InsertedUpdateRow = {
  id: string;
  revision: number;
  publication_number: number;
};

type ExistingUpdateRow = {
  draft_payload: unknown;
};

export type PublishGameUpdateInput = {
  expectedRevision: number;
  releaseId: string;
  version: string;
  type: UpdateType;
  summary: string;
  featured: boolean;
  package: {
    id: string;
    kind: DistributionPackageKind;
    sizeGb?: number;
    fileCount?: number;
    sources?: GameDownloadSource[];
  };
  distributionMetadata?: GameDistributionMetadata;
};

export type PublishGameUpdateResult =
  | {
      outcome: "published";
      updateId: string;
      gamePublicationNumber: number;
      updatePublicationNumber: number;
    }
  | { outcome: "not_found" }
  | { outcome: "not_public" }
  | { outcome: "pending_changes" }
  | { outcome: "not_ready" }
  | { outcome: "same_version" }
  | { outcome: "no_download" }
  | { outcome: "update_exists" }
  | {
      outcome: "conflict";
      revision: number;
    };

function normalizeVersionToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[-._]+$/, "")
    .replace(/-+/g, "-");
}

function updateIdentifier(
  slug: string,
  releaseId: string,
  version: string
) {
  const normalizedVersion =
    normalizeVersionToken(version) || "version";
  const digest = createHash("sha256")
    .update(normalizedVersion)
    .digest("hex")
    .slice(0, 10);
  const versionToken = normalizedVersion.slice(0, 28);
  const releaseToken =
    normalizeVersionToken(releaseId) || "release";
  const suffix =
    `${releaseToken}-${versionToken}-${digest}`;
  const maximumSlug = Math.max(1, 160 - suffix.length - 1);
  const prefix = slug
    .slice(0, maximumSlug)
    .replace(/[-._]+$/, "") || "game";

  return `${prefix}-${suffix}`;
}

function normalizedPayload(
  type: "game" | "game_update",
  payload: unknown
) {
  return normalizeEditorialPayload(
    parseEditorialPayload(type, payload)
  );
}

async function writeAudit(
  client: PoolClient,
  actorUserId: string,
  action: string,
  entityType: "game" | "game_update",
  entityId: string,
  details: Record<string, unknown>
) {
  await client.query(
    `INSERT INTO deuna_admin.admin_audit_log
       (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      actorUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
    ]
  );
}

function buildPackage(
  input: PublishGameUpdateInput["package"],
  metadata: GameDistributionMetadata | undefined
): DistributionPackage | undefined {
  const sources = input.sources?.length
    ? input.sources
    : undefined;

  if (!sources) {
    return undefined;
  }

  const distribution =
    buildDistributionMetadata(metadata);

  return {
    id: input.id,
    kind: input.kind,
    ...(input.sizeGb !== undefined
      ? { sizeGb: input.sizeGb }
      : {}),
    ...(input.fileCount !== undefined
      ? { fileCount: input.fileCount }
      : {}),
    ...(distribution?.channel
      ? { channel: distribution.channel }
      : {}),
    ...(distribution?.checksumSha256
      ? {
          checksumSha256:
            distribution.checksumSha256,
        }
      : {}),
    sources,
  };
}

function legacyDownloadFromPackage(
  item: DistributionPackage,
  platformId: string
): NonNullable<Game["download"]> {
  return {
    sources: item.sources,
    ...(item.sizeGb !== undefined
      ? { sizeGb: item.sizeGb }
      : {}),
    ...(item.fileCount !== undefined
      ? { fileCount: item.fileCount }
      : {}),
    platform:
      platformId === "pc-windows"
        ? "PC"
        : platformId,
  };
}

function buildDistributionMetadata(
  input: GameDistributionMetadata | undefined
) {
  if (!input) return undefined;
  const checksumSha256 = input.checksumSha256
    ?.trim()
    .toLowerCase();
  const metadata: GameDistributionMetadata = {
    ...(input.channel ? { channel: input.channel } : {}),
    ...(checksumSha256 ? { checksumSha256 } : {}),
  };

  return Object.keys(metadata).length > 0
    ? metadata
    : undefined;
}

async function insertPublishedUpdate(
  client: PoolClient,
  update: GameUpdate,
  actorUserId: string
) {
  const normalized = normalizedPayload(
    "game_update",
    update
  );
  const serialized = JSON.stringify(normalized);
  const digest = hashEditorialPayload(normalized);
  const sourcePayload = {};
  const sourceSerialized = JSON.stringify(sourcePayload);
  const sourceDigest = hashEditorialPayload(sourcePayload);
  const itemId = randomUUID();

  const inserted = await client.query<InsertedUpdateRow>(
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
     )
     ON CONFLICT (item_type, item_key)
     DO NOTHING
     RETURNING id, revision, publication_number`,
    [
      itemId,
      update.id,
      sourceSerialized,
      sourceDigest,
      serialized,
      digest,
      actorUserId,
    ]
  );
  const row = inserted.rows[0];

  if (!row) return null;



  await writeAudit(
    client,
    actorUserId,
    "content_created",
    "game_update",
    update.id,
    {
      publicVisible: false,
      revision: row.revision,
      publicationNumber: row.publication_number,
      integratedGameUpdate: true,
    }
  );

  const nextPublication = row.publication_number + 1;

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
      row.id,
      serialized,
      digest,
      row.revision,
      nextPublication,
      actorUserId,
    ]
  );


  await writeAudit(
    client,
    actorUserId,
    "content_published",
    "game_update",
    update.id,
    {
      publicationNumber: nextPublication,
      revision: row.revision,
      firstVisibility: true,
      integratedGameUpdate: true,
    }
  );

  return nextPublication;
}

export async function publishIntegratedGameUpdate(
  slug: string,
  actorUserId: string,
  input: PublishGameUpdateInput
): Promise<PublishGameUpdateResult> {
  const session = await verifyAdminSession();

  if (session.userId !== actorUserId) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }

  return withAdminTransaction(async (client) => {
    const result = await client.query<GamePublicationRow>(
      `SELECT
         id,
         item_key,
         source_checksum,
         draft_payload,
         published_payload,
         published_checksum,
         revision,
         publication_number,
         public_visible
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game'
         AND item_key = $1
       LIMIT 1
       FOR UPDATE`,
      [slug]
    );
    const item = result.rows[0];

    if (!item) return { outcome: "not_found" };

    if (item.revision !== input.expectedRevision) {
      return {
        outcome: "conflict",
        revision: item.revision,
      };
    }

    if (!item.public_visible) {
      return { outcome: "not_public" };
    }

    const normalizedDraft = normalizedPayload(
      "game",
      item.draft_payload
    );

    if (
      hashEditorialPayload(normalizedDraft) !==
      item.published_checksum
    ) {
      return { outcome: "pending_changes" };
    }

    if (
      !evaluateGamePublicationReadiness(
        parseEditorialPayload(
          "game",
          normalizedDraft
        )
      ).essentialsReady
    ) {
      return { outcome: "not_ready" };
    }

    const publishedGame = parseEditorialPayload(
      "game",
      item.published_payload
    );
    const releases =
      resolveGameReleases(
        publishedGame
      );
    const releaseIndex =
      releases.findIndex(
        (release) =>
          release.id ===
          input.releaseId
      );

    if (releaseIndex < 0) {
      return { outcome: "not_found" };
    }

    const currentRelease =
      releases[releaseIndex];
    const version =
      input.version.trim();
    const versionToken =
      normalizeVersionToken(
        version
      );
    const currentVersionToken =
      normalizeVersionToken(
        currentRelease.version ??
          ""
      );

    if (
      versionToken &&
      versionToken ===
        currentVersionToken
    ) {
      return {
        outcome:
          "same_version",
      };
    }

    const nextPackage =
      buildPackage(
        input.package,
        input.distributionMetadata
      );

    if (!nextPackage) {
      return {
        outcome:
          "no_download",
      };
    }

    const currentPackages =
      currentRelease.packages ??
      [];
    const packageIndex =
      currentPackages.findIndex(
        (packageItem) =>
          packageItem.id ===
          nextPackage.id
      );
    const nextPackages =
      packageIndex >= 0
        ? currentPackages.map(
            (
              packageItem,
              index
            ) =>
              index ===
              packageIndex
                ? nextPackage
                : packageItem
          )
        : [
            ...currentPackages,
            nextPackage,
          ];
    const nextReleases = [
      ...releases,
    ];
    nextReleases[
      releaseIndex
    ] = {
      ...currentRelease,
      version,
      packages:
        nextPackages,
    };

    const pcUpdate =
      currentRelease
        .platformId ===
      "pc-windows";
    const legacyDownload =
      pcUpdate
        ? legacyDownloadFromPackage(
            nextPackage,
            currentRelease
              .platformId
          )
        : publishedGame.download;
    const legacyDistribution =
      pcUpdate
        ? buildDistributionMetadata(
            input.distributionMetadata
          )
        : publishedGame
            .distributionMetadata;

    const nextGame =
      parseEditorialPayload(
        "game",
        {
          ...publishedGame,
          releases:
            nextReleases,
          ...(pcUpdate
            ? { version }
            : {}),
          download:
            legacyDownload,
          distributionMetadata:
            legacyDistribution,
        }
      );
    const resolvedDownload =
      resolveGameDownload(
        nextGame
      );

    if (
      !resolvedDownload
    ) {
      return {
        outcome:
          "no_download",
      };
    }

    const existingVersions =
      await client.query<ExistingUpdateRow>(
        `SELECT draft_payload
         FROM deuna_admin.editorial_items
         WHERE item_type = 'game_update'
           AND draft_payload ->> 'gameSlug' = $1
         FOR SHARE`,
        [slug]
      );
    const versionAlreadyRegistered =
      existingVersions.rows.some((row) => {
        try {
          const existingUpdate = parseEditorialPayload(
            "game_update",
            row.draft_payload
          );

          const existingReleaseId =
            existingUpdate.releaseId ??
            "pc-windows";

          return (
            existingReleaseId ===
              input.releaseId &&
            normalizeVersionToken(
              existingUpdate.version
            ) === versionToken
          );
        } catch {
          return false;
        }
      });

    if (versionAlreadyRegistered) {
      return { outcome: "update_exists" };
    }

    const updateId =
      updateIdentifier(
        slug,
        input.releaseId,
        version
      );
    const normalizedGame = normalizedPayload(
      "game",
      nextGame
    );
    const gameSerialized = JSON.stringify(normalizedGame);
    const gameDigest = hashEditorialPayload(normalizedGame);
    const nextRevision = item.revision + 1;
    const draftStatus =
      gameDigest === item.source_checksum
        ? "synced"
        : "modified";

    await client.query(
      `UPDATE deuna_admin.editorial_items
       SET draft_payload = $2::jsonb,
           draft_status = $3,
           revision = $4,
           updated_at = now(),
           updated_by = $5
       WHERE id = $1`,
      [
        item.id,
        gameSerialized,
        draftStatus,
        nextRevision,
        actorUserId,
      ]
    );


    await writeAudit(
      client,
      actorUserId,
      "draft_saved",
      "game",
      slug,
      {
        revision: nextRevision,
        integratedGameUpdate: true,
        releaseId:
          input.releaseId,
        version,
        distributionChannel:
          nextPackage.channel ??
          null,
        checksumConfigured:
          Boolean(
            nextPackage
              .checksumSha256
          ),
      }
    );

    const nextGamePublication = item.publication_number + 1;

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
        gameSerialized,
        gameDigest,
        nextRevision,
        nextGamePublication,
        actorUserId,
      ]
    );


    await writeAudit(
      client,
      actorUserId,
      "content_published",
      "game",
      slug,
      {
        publicationNumber: nextGamePublication,
        revision: nextRevision,
        firstVisibility: false,
        integratedGameUpdate: true,
        releaseId:
          input.releaseId,
        version,
        distributionChannel:
          nextPackage.channel ??
          null,
        checksumConfigured:
          Boolean(
            nextPackage
              .checksumSha256
          ),
      }
    );

    const update: GameUpdate = {
      id: updateId,
      gameSlug: slug,
      releaseId:
        input.releaseId,
      version,
      publishedAt: new Date().toISOString(),
      type: input.type,
      summary: input.summary.trim(),
      featured: input.featured,
    };
    const updatePublicationNumber =
      await insertPublishedUpdate(
        client,
        update,
        actorUserId
      );

    if (updatePublicationNumber === null) {
      throw new Error(
        "La actualización ya existe dentro de la transacción editorial."
      );
    }

    return {
      outcome: "published",
      updateId,
      gamePublicationNumber: nextGamePublication,
      updatePublicationNumber,
    };
  });
}
