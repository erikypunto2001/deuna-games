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
  home_historical_references: number;
};

export type GameDeletionPreview = {
  deletable: boolean;
  reason:
    | "ready"
    | "source_managed"
    | "still_public"
    | "media_unverified"
    | "home_reference"
    | "home_history_reference";
  revision: number;
  publicationNumber: number;
  publicVisible: boolean;
  revisions: number;
  publications: number;
  updates: number;
  preferences: number;
  ratings: number;
  insightSnapshots: number;
  mediaResources: number | null;
  mediaInventoryVerified: boolean;
  homeDraftReferences: number;
  homePublishedReferences: number;
  homeHistoricalReferences: number;
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
  | { outcome: "still_public" }
  | {
      outcome: "home_reference";
      draftReferences: number;
      publishedReferences: number;
    }
  | {
      outcome: "home_history_reference";
      historicalReferences: number;
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
  homeRevisions: number;
  homePublications: number;
};

export type CompactEditorialHistoryResult =
  | {
      outcome: "compacted";
      items: number;
      revisionsBefore: number;
      revisionsAfter: number;
      publicationsBefore: number;
      publicationsAfter: number;
    }
  | {
      outcome: "conflict";
      items: number;
      revisions: number;
      publications: number;
    };

export type CompactEditorialItemHistoryResult =
  | {
      outcome: "compacted";
      revisionsBefore: number;
      revisionsAfter: number;
      publicationsBefore: number;
      publicationsAfter: number;
    }
  | {
      outcome: "conflict";
      revisions: number;
      publications: number;
    };


export type EditorialItemHistoryOverview = {
  revisions: number;
  publications: number;
};

export type CompactEditorialPublicationHistoryResult =
  | {
      outcome: "compacted";
      publicationsBefore: number;
      publicationsAfter: number;
    }
  | {
      outcome: "conflict";
      publications: number;
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
       ) AS home_published_references,
       (
         SELECT count(*)::int
           FROM (
             SELECT revision.payload
               FROM deuna_admin.editorial_revisions AS revision
               INNER JOIN deuna_admin.editorial_items AS home
                 ON home.id = revision.item_id
              WHERE home.item_type = 'home_config'
                AND home.item_key = 'home'
             UNION ALL
             SELECT publication.payload
               FROM deuna_admin.editorial_publications AS publication
               INNER JOIN deuna_admin.editorial_items AS home
                 ON home.id = publication.item_id
              WHERE home.item_type = 'home_config'
                AND home.item_key = 'home'
           ) AS history
          WHERE
            COALESCE(history.payload -> 'heroSlugs', '[]'::jsonb) ? item.item_key
            OR COALESCE(history.payload -> 'popularSlugs', '[]'::jsonb) ? item.item_key
            OR COALESCE(history.payload -> 'lowSpecSlugs', '[]'::jsonb) ? item.item_key
            OR COALESCE(history.payload -> 'recommendedSlugs', '[]'::jsonb) ? item.item_key
       ) AS home_historical_references
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
    const inventory =
      await inspectEditorialMediaDeletionInventory(slug);
    mediaResources = inventory.resources;
    mediaInventoryVerified =
      inventory.unrecognizedEntries === 0;
  } catch {
    mediaResources = null;
    mediaInventoryVerified = false;
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
    : row.public_visible
      ? "still_public"
      : !mediaInventoryVerified
        ? "media_unverified"
        : hasHomeReference
          ? "home_reference"
          : row.home_historical_references > 0
            ? "home_history_reference"
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
    mediaInventoryVerified,
    homeDraftReferences:
      row.home_draft_references,
    homePublishedReferences:
      row.home_published_references,
    homeHistoricalReferences:
      row.home_historical_references,
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
  if (outcome === "source_managed") {
    return { outcome: "source_managed" };
  }
  if (outcome === "still_public") {
    return { outcome: "still_public" };
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
  if (outcome === "home_history_reference") {
    return {
      outcome: "home_history_reference",
      historicalReferences: numberField(
        raw,
        "historicalReferences"
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
    mediaDeleted =
      await deleteAllEditorialMediaResources(slug);
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
    home_revisions: number;
    home_publications: number;
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
       ) AS publications,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_revisions AS revision
           INNER JOIN deuna_admin.editorial_items AS item
             ON item.id = revision.item_id
          WHERE item.item_type = 'home_config'
            AND item.item_key = 'home'
       ) AS home_revisions,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_publications AS publication
           INNER JOIN deuna_admin.editorial_items AS item
             ON item.id = publication.item_id
          WHERE item.item_type = 'home_config'
            AND item.item_key = 'home'
       ) AS home_publications`
  );
  const row = result.rows[0];

  return {
    items: row?.items ?? 0,
    revisions: row?.revisions ?? 0,
    publications: row?.publications ?? 0,
    revisionsAfterCompaction: row?.items ?? 0,
    publicationsAfterCompaction: row?.items ?? 0,
    homeRevisions: row?.home_revisions ?? 0,
    homePublications: row?.home_publications ?? 0,
  };
}

export async function compactEditorialHistory(
  actorUserId: string,
  expected: {
    items: number;
    revisions: number;
    publications: number;
  }
): Promise<CompactEditorialHistoryResult> {
  const session = await requireOwner();

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
    `SELECT deuna_admin.compact_editorial_history(
       $1,
       $2,
       $3,
       $4,
       $5
     ) AS result`,
    [
      actorUserId,
      sessionToken,
      expected.items,
      expected.revisions,
      expected.publications,
    ]
  );
  const raw = asRecord(result.rows[0]?.result);

  if (raw.outcome === "conflict") {
    return {
      outcome: "conflict",
      items: numberField(raw, "items"),
      revisions: numberField(raw, "revisions"),
      publications: numberField(raw, "publications"),
    };
  }

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


export async function compactHomeEditorialHistory(
  actorUserId: string,
  expected: {
    revisions: number;
    publications: number;
  }
): Promise<CompactEditorialItemHistoryResult> {
  const session = await requireOwner();

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
    `SELECT deuna_admin.compact_editorial_item_history(
       'home_config',
       'home',
       $1,
       $2,
       $3,
       $4
     ) AS result`,
    [
      actorUserId,
      sessionToken,
      expected.revisions,
      expected.publications,
    ]
  );
  const raw = asRecord(result.rows[0]?.result);

  if (raw.outcome === "conflict") {
    return {
      outcome: "conflict",
      revisions: numberField(raw, "revisions"),
      publications: numberField(raw, "publications"),
    };
  }

  if (raw.outcome !== "compacted") {
    throw new Error(
      "La compactación del historial de Inicio fue rechazada por la base."
    );
  }

  return {
    outcome: "compacted",
    revisionsBefore: numberField(raw, "revisionsBefore"),
    revisionsAfter: numberField(raw, "revisionsAfter"),
    publicationsBefore: numberField(raw, "publicationsBefore"),
    publicationsAfter: numberField(raw, "publicationsAfter"),
  };
}


export async function getGameHistoryMaintenanceOverview(
  slug: string
): Promise<EditorialItemHistoryOverview | null> {
  await verifyAdminSession();

  const result = await adminQuery<{
    revisions: number;
    publications: number;
  }>(
    `SELECT
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_revisions AS revision
          WHERE revision.item_id = item.id
       ) AS revisions,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_publications AS publication
          WHERE publication.item_id = item.id
       ) AS publications
     FROM deuna_admin.editorial_items AS item
     WHERE item.item_type = 'game'
       AND item.item_key = $1
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] ?? null;
}

export async function compactGamePublicationHistory(
  slug: string,
  actorUserId: string,
  expectedPublications: number
): Promise<CompactEditorialPublicationHistoryResult> {
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

  const result = await adminQuery<{ result: unknown }>(
    `SELECT deuna_admin.compact_editorial_publication_history(
       'game',
       $1,
       $2,
       $3,
       $4
     ) AS result`,
    [
      slug,
      actorUserId,
      sessionToken,
      expectedPublications,
    ]
  );
  const raw = asRecord(result.rows[0]?.result);

  if (raw.outcome === "conflict") {
    return {
      outcome: "conflict",
      publications: numberField(raw, "publications"),
    };
  }

  if (raw.outcome !== "compacted") {
    throw new Error(
      "La limpieza de snapshots del juego fue rechazada por la base."
    );
  }

  return {
    outcome: "compacted",
    publicationsBefore: numberField(raw, "publicationsBefore"),
    publicationsAfter: numberField(raw, "publicationsAfter"),
  };
}

export async function compactGameEditorialHistory(
  slug: string,
  actorUserId: string,
  expected: EditorialItemHistoryOverview
): Promise<CompactEditorialItemHistoryResult> {
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

  const result = await adminQuery<{ result: unknown }>(
    `SELECT deuna_admin.compact_editorial_item_history(
       'game',
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
      expected.revisions,
      expected.publications,
    ]
  );
  const raw = asRecord(result.rows[0]?.result);

  if (raw.outcome === "conflict") {
    return {
      outcome: "conflict",
      revisions: numberField(raw, "revisions"),
      publications: numberField(raw, "publications"),
    };
  }

  if (raw.outcome !== "compacted") {
    throw new Error(
      "La limpieza del historial del juego fue rechazada por la base."
    );
  }

  return {
    outcome: "compacted",
    revisionsBefore: numberField(raw, "revisionsBefore"),
    revisionsAfter: numberField(raw, "revisionsAfter"),
    publicationsBefore: numberField(raw, "publicationsBefore"),
    publicationsAfter: numberField(raw, "publicationsAfter"),
  };
}
