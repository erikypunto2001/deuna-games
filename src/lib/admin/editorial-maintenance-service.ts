import "server-only";

import {
  adminQuery,
} from "./database";
import {
  verifyAdminSession,
} from "./session";
import {
  deleteEditorialMediaResource,
  listEditorialMediaLibrary,
} from "@/lib/media/editorial-media-library";

type GameDeletionPreviewRow = {
  item_id: string;
  source_present: boolean;
  source_payload: unknown;
  revision: number;
  publication_number: number;
  public_visible: boolean;
  revisions: number;
  publications: number;
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
    | "source_managed"
    | "home_reference";
  revision: number;
  publicationNumber: number;
  publicVisible: boolean;
  revisions: number;
  publications: number;
  updates: number;
  preferences: number;
  ratings: number;
  insightSnapshots: number;
  mediaResources: number;
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
  | { outcome: "source_managed" }
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

export type EditorialHistoryMaintenanceOverview = {
  items: number;
  revisions: number;
  publications: number;
  revisionsAfterCompaction: number;
  publicationsAfterCompaction: number;
};

export type CompactEditorialHistoryResult = {
  outcome: "compacted";
  items: number;
  revisionsBefore: number;
  revisionsAfter: number;
  publicationsBefore: number;
  publicationsAfter: number;
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
       item.id AS item_id,
       item.source_present,
       item.source_payload,
       item.revision,
       item.publication_number,
       item.public_visible,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_revisions AS revision
          WHERE revision.item_id = item.id
       ) AS revisions,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_publications AS publication
          WHERE publication.item_id = item.id
       ) AS publications,
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

  let mediaResources = 0;
  try {
    mediaResources = (
      await listEditorialMediaLibrary(slug)
    ).length;
  } catch {
    mediaResources = 0;
  }

  const sourcePayload = asRecord(row.source_payload);
  const panelCreated =
    !row.source_present &&
    Object.keys(sourcePayload).length === 0;
  const hasHomeReference =
    row.home_draft_references > 0 ||
    row.home_published_references > 0;
  const reason = !panelCreated
    ? "source_managed"
    : hasHomeReference
      ? "home_reference"
      : "ready";

  return {
    deletable: reason === "ready",
    reason,
    revision: row.revision,
    publicationNumber: row.publication_number,
    publicVisible: row.public_visible,
    revisions: row.revisions,
    publications: row.publications,
    updates: row.updates,
    preferences: row.preferences,
    ratings: row.ratings,
    insightSnapshots: row.insight_snapshots,
    mediaResources,
    homeDraftReferences:
      row.home_draft_references,
    homePublishedReferences:
      row.home_published_references,
  };
}

export async function deletePanelGame(
  slug: string,
  expectedRevision: number,
  expectedPublicationNumber: number,
  actorUserId: string
): Promise<DeletePanelGameResult> {
  const session = await requireOwner();

  if (session.userId !== actorUserId) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }

  const result = await adminQuery<{
    result: unknown;
  }>(
    `SELECT deuna_admin.delete_panel_game(
       $1,
       $2,
       $3,
       $4
     ) AS result`,
    [
      slug,
      actorUserId,
      expectedRevision,
      expectedPublicationNumber,
    ]
  );
  const raw = asRecord(result.rows[0]?.result);
  const outcome = raw.outcome;

  if (outcome === "not_found") {
    return { outcome: "not_found" };
  }
  if (outcome === "source_managed") {
    return { outcome: "source_managed" };
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
    const resources =
      await listEditorialMediaLibrary(slug);

    for (const resource of resources) {
      await deleteEditorialMediaResource(
        slug,
        resource
      );
      mediaDeleted += 1;
    }
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

export async function getEditorialHistoryMaintenanceOverview():
  Promise<EditorialHistoryMaintenanceOverview> {
  await requireOwner();

  const result = await adminQuery<{
    items: number;
    revisions: number;
    publications: number;
  }>(
    `SELECT
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_items
       ) AS items,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_revisions
       ) AS revisions,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_publications
       ) AS publications`
  );
  const row = result.rows[0];

  return {
    items: row?.items ?? 0,
    revisions: row?.revisions ?? 0,
    publications: row?.publications ?? 0,
    revisionsAfterCompaction: row?.items ?? 0,
    publicationsAfterCompaction: row?.items ?? 0,
  };
}

export async function compactEditorialHistory(
  actorUserId: string
): Promise<CompactEditorialHistoryResult> {
  const session = await requireOwner();

  if (session.userId !== actorUserId) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }

  const result = await adminQuery<{
    result: unknown;
  }>(
    `SELECT deuna_admin.compact_editorial_history(
       $1
     ) AS result`,
    [actorUserId]
  );
  const raw = asRecord(result.rows[0]?.result);

  if (raw.outcome !== "compacted") {
    throw new Error(
      "La compactación del historial fue rechazada por la base."
    );
  }

  return {
    outcome: "compacted",
    items: numberField(raw, "items"),
    revisionsBefore: numberField(
      raw,
      "revisionsBefore"
    ),
    revisionsAfter: numberField(
      raw,
      "revisionsAfter"
    ),
    publicationsBefore: numberField(
      raw,
      "publicationsBefore"
    ),
    publicationsAfter: numberField(
      raw,
      "publicationsAfter"
    ),
  };
}
