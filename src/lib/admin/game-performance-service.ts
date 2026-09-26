import "server-only";

import type { PoolClient } from "pg";

import {
  resolvePcRelease,
} from "@/lib/games/releases";
import type {
  Game,
  GamePerformanceCalibration,
  GamePerformanceMetadata,
} from "@/types/game";

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

type GamePerformanceRow = {
  id: string;
  item_key: string;
  draft_payload: unknown;
  revision: number;
  source_checksum: string;
};

export type GamePerformanceMutationResult =
  | { outcome: "saved"; revision: number }
  | { outcome: "conflict"; revision: number }
  | { outcome: "unsupported_platform" }
  | { outcome: "not_found" };

async function writePerformanceRevision(
  client: PoolClient,
  item: GamePerformanceRow,
  game: Game,
  actorUserId: string
) {
  const nextRevision = item.revision + 1;
  const normalized = normalizeEditorialPayload(
    parseEditorialPayload("game", game)
  );
  const serialized = JSON.stringify(normalized);
  const status =
    hashEditorialPayload(normalized) ===
    item.source_checksum
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
      serialized,
      status,
      nextRevision,
      actorUserId,
    ]
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
        section: "performance",
      }),
    ]
  );

  return nextRevision;
}

export async function saveGamePerformanceDraft(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  calibration: GamePerformanceCalibration | undefined,
  metadata: GamePerformanceMetadata | undefined
): Promise<GamePerformanceMutationResult> {
  const session = await verifyAdminSession();

  if (session.userId !== actorUserId) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }

  return withAdminTransaction(async (client) => {
    const result = await client.query<GamePerformanceRow>(
      `SELECT
         id,
         item_key,
         draft_payload,
         revision,
         source_checksum
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
    const pcRelease =
      resolvePcRelease(
        current
      );

    if (
      !pcRelease &&
      (
        calibration ||
        metadata
      )
    ) {
      return {
        outcome:
          "unsupported_platform",
      };
    }

    const performanceMetadata =
      calibration ? metadata : undefined;
    const releases = current.releases?.map(
      (release) =>
        release.platformId === "pc-windows"
          ? {
              ...release,
              performance: calibration,
              performanceMetadata,
            }
          : release
    );
    const next: Game = {
      ...current,
      performance: calibration,
      performanceMetadata,
      ...(current.releases
        ? { releases }
        : {}),
    };
    const revision = await writePerformanceRevision(
      client,
      item,
      next,
      actorUserId
    );

    return { outcome: "saved", revision };
  });
}
