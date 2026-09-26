import "server-only";

import type {
  PoolClient,
} from "pg";

import type {
  Game,
  GameCompatibilityMetadata,
  GameHardwareRequirements,
  GameMediaAccessibility,
  GamePlatform,
  GameRelease,
} from "@/types/game";
import {
  resolveGameCardBaseImage,
  resolveGameCoverImage,
} from "@/lib/media/game-card-presentation";
import {
  resolveGameDestinationImage,
} from "@/lib/media/game-video-media";

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

export type GameSectionMutationResult =
  | { outcome: "saved"; revision: number }
  | { outcome: "conflict"; revision: number }
  | { outcome: "not_found" };

export type GameInformationInput = Pick<
  Game,
  | "title"
  | "description"
  | "shortTitle"
  | "highlightedTitle"
  | "developer"
  | "publisher"
  | "releaseDate"
  | "version"
  | "badge"
  | "imageAlt"
>;

export type GameClassificationInput = Pick<
  Game,
  "category" | "genres" | "tags" | "ageRating"
>;

export type GameCompatibilityInput = {
  platforms?: GamePlatform[];
  minimum?: GameHardwareRequirements;
  recommended?: GameHardwareRequirements;
  metadata?: GameCompatibilityMetadata;
};

export type GameMediaAccessibilityInput = Pick<
  Game,
  "mediaAccessibility"
>;

export type GameValuationInput = Pick<Game, "rating">;

export type GameValuationAuditDetails = {
  valuationSource: "manual" | "insight";
  insightScore?: number;
  insightConfidence?: "low" | "medium" | "high";
  insightEvidenceCount?: number;
};

type EditorialItemRow = {
  id: string;
  item_key: string;
  draft_payload: unknown;
  source_checksum: string;
  revision: number;
};

function compactRequirements(
  input: GameHardwareRequirements | undefined
) {
  if (!input) return undefined;

  const compact: GameHardwareRequirements = {};
  for (const key of [
    "system",
    "processor",
    "ram",
    "graphics",
    "storage",
  ] as const) {
    const value = input[key]?.trim();
    if (value) compact[key] = value;
  }

  return Object.keys(compact).length ? compact : undefined;
}

function compactCompatibilityMetadata(
  metadata: GameCompatibilityMetadata | undefined
) {
  if (!metadata) return undefined;

  const compact: GameCompatibilityMetadata = {
    ...(metadata.status ? { status: metadata.status } : {}),
    ...(metadata.source ? { source: metadata.source } : {}),
    ...(metadata.verifiedAt ? { verifiedAt: metadata.verifiedAt } : {}),
  };

  return Object.keys(compact).length ? compact : undefined;
}

function compactMediaAccessibility(
  game: Game,
  accessibility: GameMediaAccessibility | undefined
) {
  if (!accessibility) return undefined;

  const galleryItems = game.galleryMedia?.length
    ? game.galleryMedia
    : (game.screenshots ?? []).map((src) => ({
        kind: "image" as const,
        src,
      }));
  const galleryKeys = new Set(
    galleryItems.map((item) => `${item.kind}:${item.src}`)
  );
  const gallery = accessibility.gallery
    ?.map((item) => ({
      ...item,
      label: item.label.trim(),
    }))
    .filter(
      (item) =>
        item.label.length > 0 &&
        galleryKeys.has(`${item.kind}:${item.src}`)
    );

  const cover = accessibility.cover?.trim();
  const hero = accessibility.hero?.trim();
  const card = accessibility.card?.trim();
  const detail = accessibility.detail?.trim();
  const coverImage = resolveGameCoverImage(game);
  const cardImage = resolveGameCardBaseImage(game);
  const detailImage = resolveGameDestinationImage(game, "detail");
  const compact: GameMediaAccessibility = {
    ...(coverImage && cover ? { cover } : {}),
    ...(game.heroImage && hero ? { hero } : {}),
    ...(cardImage && card ? { card } : {}),
    ...(detailImage && detail ? { detail } : {}),
    ...(gallery?.length ? { gallery } : {}),
  };

  return Object.keys(compact).length ? compact : undefined;
}

async function writeRevision(
  client: PoolClient,
  item: EditorialItemRow,
  game: Game,
  actorUserId: string,
  section: string,
  auditDetails: Record<string, unknown> = {}
) {
  const nextRevision = item.revision + 1;
  const normalized = normalizeEditorialPayload(game);
  const serialized = JSON.stringify(normalized);
  const status = hashEditorialPayload(normalized) === item.source_checksum
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
    [item.id, serialized, status, nextRevision, actorUserId]
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
        section,
        ...auditDetails,
      }),
    ]
  );

  return nextRevision;
}

async function updateGameSection(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  section: string,
  update: (game: Game) => Game,
  auditDetails: Record<string, unknown> = {}
): Promise<GameSectionMutationResult> {
  const session = await verifyAdminSession();
  if (session.userId !== actorUserId) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }

  return withAdminTransaction(async (client) => {
    const result = await client.query<EditorialItemRow>(
      `SELECT
         id,
         item_key,
         draft_payload,
         source_checksum,
         revision
       FROM deuna_admin.editorial_items
       WHERE item_type = 'game'
         AND item_key = $1
       LIMIT 1
       FOR UPDATE`,
      [key]
    );
    const item = result.rows[0];
    if (!item) return { outcome: "not_found" };
    if (item.revision !== expectedRevision) {
      return {
        outcome: "conflict",
        revision: item.revision,
      };
    }

    const current = parseEditorialPayload(
      "game",
      item.draft_payload
    );
    const revision = await writeRevision(
      client,
      item,
      update(current),
      actorUserId,
      section,
      auditDetails
    );

    return { outcome: "saved", revision };
  });
}

export function saveGameInformationSection(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  input: GameInformationInput
) {
  return updateGameSection(
    key,
    expectedRevision,
    actorUserId,
    "information",
    (game) => ({ ...game, ...input })
  );
}

export function saveGameClassificationSection(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  input: GameClassificationInput
) {
  return updateGameSection(
    key,
    expectedRevision,
    actorUserId,
    "classification",
    (game) => ({ ...game, ...input })
  );
}

export function saveGameCompatibilitySection(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  input: GameCompatibilityInput
) {
  return updateGameSection(
    key,
    expectedRevision,
    actorUserId,
    "compatibility",
    (game) => {
      const minimum = compactRequirements(input.minimum);
      const recommended = compactRequirements(input.recommended);
      const metadata = compactCompatibilityMetadata(input.metadata);
      const hasCompatibilityData = Boolean(
        input.platforms?.length || minimum || recommended
      );

      const requirements =
        minimum || recommended
          ? {
              ...(minimum ?? {}),
              ...(minimum ? { minimum } : {}),
              ...(recommended ? { recommended } : {}),
            }
          : undefined;
      const releases = game.releases?.map(
        (release) =>
          release.platformId === "pc-windows"
            ? {
                ...release,
                requirements,
              }
            : release
      );

      return {
        ...game,
        platforms: input.platforms?.length
          ? input.platforms
          : undefined,
        requirements,
        ...(game.releases
          ? { releases }
          : {}),
        compatibilityMetadata: hasCompatibilityData
          ? metadata
          : undefined,
      };
    }
  );
}

export function saveGameMediaAccessibilitySection(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  input: GameMediaAccessibilityInput
) {
  return updateGameSection(
    key,
    expectedRevision,
    actorUserId,
    "media-accessibility",
    (game) => ({
      ...game,
      mediaAccessibility: compactMediaAccessibility(
        game,
        input.mediaAccessibility
      ),
    })
  );
}

export function saveGameValuationSection(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  input: GameValuationInput,
  auditDetails: GameValuationAuditDetails
) {
  return updateGameSection(
    key,
    expectedRevision,
    actorUserId,
    "valuation",
    (game) => ({
      ...game,
      rating: input.rating,
    }),
    auditDetails
  );
}

export function saveGameReleasesSection(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  releases: GameRelease[]
) {
  return updateGameSection(
    key,
    expectedRevision,
    actorUserId,
    "releases",
    (game) => ({
      ...game,
      releases:
        releases.length > 0
          ? releases
          : undefined,
    })
  );
}
