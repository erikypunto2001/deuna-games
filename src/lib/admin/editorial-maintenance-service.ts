import "server-only";

import {
  adminQuery,
} from "./database";
import {
  readAdminSessionToken,
  verifyAdminSession,
} from "./session";
import {
  deleteAllEditorialMediaResources,
  inspectEditorialMediaDeletionInventory,
} from "@/lib/media/editorial-media-library";

type GameDeletionPreviewRow = {
  source_present: boolean;
  source_payload: unknown;
  revision: number;
  publication_number: number;
  public_visible: boolean;
  updates: number;
  preferences: number;
  ratings: number;
  insight_snapshots: number;
  home_draft_references: number;
  home_published_references: number;
};

export type GameDeletionPreview = {
  deletable: boolean;
  reason:
    | "ready"
    | "still_public"
    | "media_unverified"
    | "home_reference";
  revision: number;
  publicationNumber: number;
  publicVisible: boolean;
  updates: number;
  preferences: number;
  ratings: number;
  insightSnapshots: number;
  mediaResources: number | null;
  mediaInventoryVerified: boolean;
  homeDraftReferences: number;
  homePublishedReferences: number;
};

export type DeletePanelGameResult =
  | {
      outcome: "deleted";
      updatesDeleted: number;
      preferencesDeleted: number;
      ratingsDeleted: number;
      insightSnapshotsDeleted: number;
      mediaDeleted: number;
      mediaCleanupPending: boolean;
    }
  | { outcome: "not_found" }
  | { outcome: "still_public" }
  | { outcome: "media_unverified" }
  | {
      outcome: "home_reference";
      draftReferences: number;
      publishedReferences: number;
    }
  | {
      outcome: "conflict";
      revision: number;
      publicationNumber: number;
    };

function asRecord(value: unknown) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : {};
}

function numberField(
  value: Record<string, unknown>,
  key: string
) {
  const parsed = Number(value[key] ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requireOwner() {
  const session = await verifyAdminSession();

  if (session.role !== "owner") {
    throw new Error(
      "Sólo la cuenta propietaria puede ejecutar mantenimiento destructivo."
    );
  }

  return session;
}

export async function getGameDeletionPreview(
  slug: string
): Promise<GameDeletionPreview | null> {
  await verifyAdminSession();

  const result = await adminQuery<GameDeletionPreviewRow>(
    `SELECT
       item.source_present,
       item.source_payload,
       item.revision,
       item.publication_number,
       item.public_visible,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_items AS update_item
          WHERE update_item.item_type = 'game_update'
            AND (
              update_item.source_payload ->> 'gameSlug' = item.item_key
              OR update_item.draft_payload ->> 'gameSlug' = item.item_key
              OR update_item.published_payload ->> 'gameSlug' = item.item_key
            )
       ) AS updates,
       (
         SELECT count(*)::int
           FROM deuna_accounts.game_preferences AS preference
          WHERE preference.game_slug = item.item_key
       ) AS preferences,
       (
         SELECT count(*)::int
           FROM deuna_accounts.game_ratings AS rating
          WHERE rating.game_slug = item.item_key
       ) AS ratings,
       (
         SELECT count(*)::int
           FROM deuna_admin.game_insight_scores AS insight
          WHERE insight.game_slug = item.item_key
       ) AS insight_snapshots,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_items AS home
          WHERE home.item_type = 'home_config'
            AND home.item_key = 'home'
            AND (
              COALESCE(home.draft_payload -> 'heroSlugs', '[]'::jsonb) ? item.item_key
              OR COALESCE(home.draft_payload -> 'popularSlugs', '[]'::jsonb) ? item.item_key
              OR COALESCE(home.draft_payload -> 'lowSpecSlugs', '[]'::jsonb) ? item.item_key
              OR COALESCE(home.draft_payload -> 'recommendedSlugs', '[]'::jsonb) ? item.item_key
            )
       ) AS home_draft_references,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_items AS home
          WHERE home.item_type = 'home_config'
            AND home.item_key = 'home'
            AND (
              COALESCE(home.published_payload -> 'heroSlugs', '[]'::jsonb) ? item.item_key
              OR COALESCE(home.published_payload -> 'popularSlugs', '[]'::jsonb) ? item.item_key
              OR COALESCE(home.published_payload -> 'lowSpecSlugs', '[]'::jsonb) ? item.item_key
              OR COALESCE(home.published_payload -> 'recommendedSlugs', '[]'::jsonb) ? item.item_key
            )
       ) AS home_published_references
     FROM deuna_admin.editorial_items AS item
     WHERE item.item_type = 'game'
       AND item.item_key = $1
     LIMIT 1`,
    [slug]
  );
  const row = result.rows[0];

  if (!row) return null;

  let mediaResources: number | null = null;
  let mediaInventoryVerified = false;

  try {
    const inventory = await inspectEditorialMediaDeletionInventory(slug);
    mediaResources = inventory.resources;
    mediaInventoryVerified = inventory.unrecognizedEntries === 0;
  } catch {
    mediaResources = null;
    mediaInventoryVerified = false;
  }

  const hasHomeReference =
    row.home_draft_references > 0 || row.home_published_references > 0;
  const reason = row.public_visible
    ? "still_public"
    : !mediaInventoryVerified
      ? "media_unverified"
      : hasHomeReference
        ? "home_reference"
        : "ready";

  return {
    deletable: reason === "ready",
    reason,
    revision: row.revision,
    publicationNumber: row.publication_number,
    publicVisible: row.public_visible,
    updates: row.updates,
    preferences: row.preferences,
    ratings: row.ratings,
    insightSnapshots: row.insight_snapshots,
    mediaResources,
    mediaInventoryVerified,
    homeDraftReferences: row.home_draft_references,
    homePublishedReferences: row.home_published_references,
  };
}

export async function deletePanelGame(
  slug: string,
  expectedRevision: number,
  expectedPublicationNumber: number,
  actorUserId: string
): Promise<DeletePanelGameResult> {
  const session = await requireOwner();

  try {
    const inventory =
      await inspectEditorialMediaDeletionInventory(slug);
    if (inventory.unrecognizedEntries > 0) {
      return { outcome: "media_unverified" };
    }
  } catch {
    return { outcome: "media_unverified" };
  }

  if (session.userId !== actorUserId) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }

  const sessionToken =
    await readAdminSessionToken();

  if (!sessionToken) {
    throw new Error(
      "La sesión administrativa no está disponible."
    );
  }

  const result = await adminQuery<{
    result: unknown;
  }>(
    `SELECT deuna_admin.delete_panel_game(
       $1,
       $2,
       $3,
       $4,
       $5
     ) AS result`,
    [
      slug,
      actorUserId,
      sessionToken,
      expectedRevision,
      expectedPublicationNumber,
    ]
  );
  const raw = asRecord(result.rows[0]?.result);
  const outcome = raw.outcome;

  if (outcome === "not_found") {
    return { outcome: "not_found" };
  }
  if (outcome === "still_public") {
    return { outcome: "still_public" };
  }
  if (outcome === "media_unverified") {
    return { outcome: "media_unverified" };
  }
  if (outcome === "home_reference") {
    return {
      outcome: "home_reference",
      draftReferences: numberField(
        raw,
        "draftReferences"
      ),
      publishedReferences: numberField(
        raw,
        "publishedReferences"
      ),
    };
  }
  if (outcome === "conflict") {
    return {
      outcome: "conflict",
      revision: numberField(raw, "revision"),
      publicationNumber: numberField(
        raw,
        "publicationNumber"
      ),
    };
  }
  if (outcome !== "deleted") {
    throw new Error(
      "La eliminación del juego fue rechazada por la base."
    );
  }

  let mediaDeleted = 0;
  let mediaCleanupPending = false;

  try {
    const retry = await retryPendingGameMediaCleanup(
      slug,
      actorUserId
    );
    mediaDeleted = retry.mediaDeleted;
    mediaCleanupPending = retry.outcome !== "completed";
  } catch {
    mediaCleanupPending = true;
  }

  return {
    outcome: "deleted",
    updatesDeleted: numberField(
      raw,
      "updatesDeleted"
    ),
    preferencesDeleted: numberField(
      raw,
      "preferencesDeleted"
    ),
    ratingsDeleted: numberField(
      raw,
      "ratingsDeleted"
    ),
    insightSnapshotsDeleted: numberField(
      raw,
      "insightSnapshotsDeleted"
    ),
    mediaDeleted,
    mediaCleanupPending,
  };
}

export type RetryPendingGameMediaCleanupResult =
  | { outcome: "completed"; mediaDeleted: number }
  | { outcome: "not_found"; mediaDeleted: 0 }
  | { outcome: "pending"; mediaDeleted: number };

export async function isGameMediaCleanupPending(
  slug: string
) {
  const result = await adminQuery<{ pending: boolean }>(
    `SELECT deuna_admin.is_game_media_cleanup_pending($1) AS pending`,
    [slug]
  );
  return result.rows[0]?.pending === true;
}

export async function retryPendingGameMediaCleanup(
  slug: string,
  actorUserId: string
): Promise<RetryPendingGameMediaCleanupResult> {
  const session = await requireOwner();
  if (session.userId !== actorUserId) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }

  const sessionToken = await readAdminSessionToken();
  if (!sessionToken) {
    throw new Error(
      "La sesión administrativa no está disponible."
    );
  }

  const started = await adminQuery<{ result: unknown }>(
    `SELECT deuna_admin.begin_game_media_cleanup(
       $1, $2, $3
     ) AS result`,
    [slug, actorUserId, sessionToken]
  );
  const startRaw = asRecord(started.rows[0]?.result);
  if (startRaw.outcome === "not_found") {
    return { outcome: "not_found", mediaDeleted: 0 };
  }
  if (startRaw.outcome !== "pending") {
    throw new Error(
      "La limpieza multimedia pendiente fue rechazada por la base."
    );
  }

  let mediaDeleted = 0;
  try {
    mediaDeleted =
      await deleteAllEditorialMediaResources(slug);
  } catch {
    return { outcome: "pending", mediaDeleted };
  }

  const completed = await adminQuery<{ result: unknown }>(
    `SELECT deuna_admin.complete_game_media_cleanup(
       $1, $2, $3
     ) AS result`,
    [slug, actorUserId, sessionToken]
  );
  const completeRaw = asRecord(completed.rows[0]?.result);

  if (
    completeRaw.outcome !== "completed" &&
    completeRaw.outcome !== "not_found"
  ) {
    return { outcome: "pending", mediaDeleted };
  }

  return { outcome: "completed", mediaDeleted };
}
