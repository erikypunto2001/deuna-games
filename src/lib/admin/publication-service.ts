import "server-only";

import type {
  PoolClient,
} from "pg";

import {
  PUBLIC_PAGES_EDITORIAL_KEY,
} from "@/data/public-pages-config";
import {
  reconcileEditorialImageDeletions,
} from "@/lib/media/editorial-media-library";

import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "./content-hash";
import {
  parseEditorialPayload,
} from "./content-validation";
import {
  adminQuery,
  withAdminTransaction,
} from "./database";
import {
  listGameImageReferences,
} from "./game-media-integrity";
import {
  verifyAdminSession,
} from "./session";

type PublishableEditorialType =
  | "game"
  | "game_update"
  | "site_config"
  | "home_config"
  | "about_config"
  | "game_taxonomy"
  | "public_pages_config";

type PublicationAction =
  | "bootstrap"
  | "published"
  | "rollback"
  | "baseline";

type PublicationItemRow = {
  id: string;
  item_key: string;
  draft_payload: unknown;
  revision: number;
  published_checksum: string;
  published_from_revision: number | null;
  publication_number: number;
  published_at: Date;
  public_visible: boolean;
};

type PublishedGamePayloadRow = {
  published_payload: unknown;
  public_visible: boolean;
};

type PublicationHistoryRow = {
  id: string;
  publication_number: number;
  checksum: string;
  source_revision: number | null;
  action: PublicationAction;
  created_at: Date;
};

type RestorePublicationRow = {
  publication_id: string;
  payload: unknown;
  checksum: string;
  source_revision: number | null;
  target_publication_number: number;
  item_id: string;
  item_key: string;
  current_publication_number: number;
  current_published_checksum: string;
  current_public_visible: boolean;
};

export type EditorialPublication = {
  id: string;
  publicationNumber: number;
  checksum: string;
  sourceRevision: number | null;
  action: PublicationAction;
  createdAt: Date;
};

export type EditorialPublicationState = {
  itemId: string;
  key: string;
  draftRevision: number;
  publicationNumber: number;
  publishedFromRevision: number | null;
  publishedAt: Date;
  publicVisible: boolean;
  hasUnpublishedChanges: boolean;
  publications: EditorialPublication[];
};

export type GamePublicationState = EditorialPublicationState;
export type UpdatePublicationState = EditorialPublicationState;
export type SiteConfigPublicationState = EditorialPublicationState;
export type HomeConfigPublicationState = EditorialPublicationState;
export type AboutConfigPublicationState = EditorialPublicationState;
export type GameTaxonomyPublicationState = EditorialPublicationState;
export type PublicPagesConfigPublicationState = EditorialPublicationState;

export type PublishEditorialResult =
  | {
      outcome: "published";
      publicationNumber: number;
    }
  | {
      outcome: "no_changes";
      publicationNumber: number;
    }
  | {
      outcome: "conflict";
      revision: number;
    }
  | { outcome: "not_found" };

export type PublishGameResult = PublishEditorialResult;
export type PublishUpdateResult = PublishEditorialResult;
export type PublishSiteConfigResult = PublishEditorialResult;
export type PublishHomeConfigResult = PublishEditorialResult;
export type PublishAboutConfigResult = PublishEditorialResult;
export type PublishGameTaxonomyResult = PublishEditorialResult;
export type PublishPublicPagesConfigResult = PublishEditorialResult;

export type RestorePublicationResult =
  | {
      outcome: "restored";
      key: string;
      publicationNumber: number;
    }
  | {
      outcome: "no_changes";
      key: string;
      publicationNumber: number;
    }
  | {
      outcome: "conflict";
      key: string;
      publicationNumber: number;
    }
  | { outcome: "not_found" };

function normalizePublishablePayload(
  type: PublishableEditorialType,
  payload: unknown
) {
  return normalizeEditorialPayload(
    parseEditorialPayload(type, payload)
  );
}

async function assertActor(
  actorUserId: string
) {
  const session = await verifyAdminSession();

  if (session.userId !== actorUserId) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }
}

export async function getPublishedGameImageReferences(
  key: string
) {
  await verifyAdminSession();

  const result = await adminQuery<PublishedGamePayloadRow>(
    `SELECT
       published_payload,
       public_visible
     FROM deuna_admin.editorial_items
     WHERE item_type = 'game'
       AND item_key = $1
     LIMIT 1`,
    [key]
  );
  const row = result.rows[0];

  if (!row?.public_visible) return [];

  try {
    return listGameImageReferences(
      parseEditorialPayload("game", row.published_payload)
    );
  } catch {
    return [];
  }
}

async function reconcilePublishedGameImageDeletions(
  key: string
) {
  try {
    const references = await getPublishedGameImageReferences(key);
    await reconcileEditorialImageDeletions(
      key,
      references,
      references
    );
  } catch {
    // La publicación ya fue confirmada en PostgreSQL. Una limpieza física
    // fallida queda pendiente y se reintentará al volver a abrir Multimedia.
  }
}

async function writePublicationAudit(
  client: PoolClient,
  actorUserId: string,
  type: PublishableEditorialType,
  key: string,
  action: "content_published" | "publication_restored",
  details: Record<string, unknown>
) {
  await client.query(
    `INSERT INTO deuna_admin.admin_audit_log
       (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      actorUserId,
      action,
      type,
      key,
      JSON.stringify(details),
    ]
  );
}

async function getPublicationState(
  type: PublishableEditorialType,
  key: string
): Promise<EditorialPublicationState | null> {
  await verifyAdminSession();

  const itemResult = await adminQuery<PublicationItemRow>(
    `SELECT
       id,
       item_key,
       draft_payload,
       revision,
       published_checksum,
       published_from_revision,
       publication_number,
       published_at,
       public_visible
     FROM deuna_admin.editorial_items
     WHERE item_type = $1
       AND item_key = $2
     LIMIT 1`,
    [type, key]
  );
  const item = itemResult.rows[0];

  if (!item) return null;

  const draft = normalizePublishablePayload(
    type,
    item.draft_payload
  );
  const draftChecksum = hashEditorialPayload(draft);
  const historyResult =
    await adminQuery<PublicationHistoryRow>(
      `SELECT
         id::text,
         publication_number,
         checksum,
         source_revision,
         action,
         created_at
       FROM deuna_admin.editorial_publications
       WHERE item_id = $1
       ORDER BY publication_number DESC
       LIMIT 12`,
      [item.id]
    );

  return {
    itemId: item.id,
    key: item.item_key,
    draftRevision: item.revision,
    publicationNumber: item.publication_number,
    publishedFromRevision:
      item.published_from_revision,
    publishedAt: item.published_at,
    publicVisible: item.public_visible,
    hasUnpublishedChanges:
      !item.public_visible ||
      draftChecksum !== item.published_checksum,
    publications: historyResult.rows.map(
      (publication) => ({
        id: publication.id,
        publicationNumber:
          publication.publication_number,
        checksum: publication.checksum,
        sourceRevision:
          publication.source_revision,
        action: publication.action,
        createdAt: publication.created_at,
      })
    ),
  };
}

async function publishEditorialDraft(
  type: PublishableEditorialType,
  key: string,
  expectedRevision: number,
  actorUserId: string
): Promise<PublishEditorialResult> {
  await assertActor(actorUserId);

  return withAdminTransaction(async (client) => {
    const result = await client.query<PublicationItemRow>(
      `SELECT
         id,
         item_key,
         draft_payload,
         revision,
         published_checksum,
         published_from_revision,
         publication_number,
         published_at,
         public_visible
       FROM deuna_admin.editorial_items
       WHERE item_type = $1
         AND item_key = $2
       LIMIT 1
       FOR UPDATE`,
      [type, key]
    );
    const item = result.rows[0];

    if (!item) return { outcome: "not_found" };

    if (item.revision !== expectedRevision) {
      return {
        outcome: "conflict",
        revision: item.revision,
      };
    }

    const normalized = normalizePublishablePayload(
      type,
      item.draft_payload
    );
    const digest = hashEditorialPayload(normalized);

    if (
      digest === item.published_checksum &&
      item.public_visible
    ) {
      return {
        outcome: "no_changes",
        publicationNumber: item.publication_number,
      };
    }

    const serialized = JSON.stringify(normalized);
    const nextPublication =
      item.publication_number + 1;

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
        item.revision,
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
        item.revision,
        actorUserId,
      ]
    );
    await writePublicationAudit(
      client,
      actorUserId,
      type,
      item.item_key,
      "content_published",
      {
        publicationNumber: nextPublication,
        revision: item.revision,
        firstVisibility: !item.public_visible,
      }
    );

    return {
      outcome: "published",
      publicationNumber: nextPublication,
    };
  });
}

async function restoreEditorialPublication(
  type: PublishableEditorialType,
  publicationId: string,
  expectedPublicationNumber: number,
  actorUserId: string
): Promise<RestorePublicationResult> {
  await assertActor(actorUserId);

  return withAdminTransaction(async (client) => {
    const result =
      await client.query<RestorePublicationRow>(
        `SELECT
           publication.id::text AS publication_id,
           publication.payload,
           publication.checksum,
           publication.source_revision,
           publication.publication_number AS target_publication_number,
           item.id AS item_id,
           item.item_key,
           item.publication_number AS current_publication_number,
           item.published_checksum AS current_published_checksum,
           item.public_visible AS current_public_visible
         FROM deuna_admin.editorial_publications AS publication
         INNER JOIN deuna_admin.editorial_items AS item
           ON item.id = publication.item_id
         WHERE publication.id = $1
           AND item.item_type = $2
         LIMIT 1
         FOR UPDATE OF item`,
        [publicationId, type]
      );
    const row = result.rows[0];

    if (!row) return { outcome: "not_found" };

    if (
      row.current_publication_number !==
      expectedPublicationNumber
    ) {
      return {
        outcome: "conflict",
        key: row.item_key,
        publicationNumber:
          row.current_publication_number,
      };
    }

    const normalized = normalizePublishablePayload(
      type,
      row.payload
    );
    const digest = hashEditorialPayload(normalized);

    if (digest !== row.checksum) {
      throw new Error(
        "La publicación histórica no supera la verificación de integridad."
      );
    }

    if (
      digest === row.current_published_checksum &&
      row.current_public_visible
    ) {
      return {
        outcome: "no_changes",
        key: row.item_key,
        publicationNumber:
          row.current_publication_number,
      };
    }

    const serialized = JSON.stringify(normalized);
    const nextPublication =
      row.current_publication_number + 1;

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
        row.item_id,
        serialized,
        digest,
        row.source_revision,
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
       VALUES ($1, $2, $3::jsonb, $4, $5, 'rollback', $6)`,
      [
        row.item_id,
        nextPublication,
        serialized,
        digest,
        row.source_revision,
        actorUserId,
      ]
    );
    await writePublicationAudit(
      client,
      actorUserId,
      type,
      row.item_key,
      "publication_restored",
      {
        publicationNumber: nextPublication,
        restoredFromPublication:
          row.target_publication_number,
        firstVisibility: !row.current_public_visible,
      }
    );

    return {
      outcome: "restored",
      key: row.item_key,
      publicationNumber: nextPublication,
    };
  });
}

export function getGamePublicationState(
  key: string
) {
  return getPublicationState("game", key);
}

export function getUpdatePublicationState(
  key: string
) {
  return getPublicationState("game_update", key);
}

export function getSiteConfigPublicationState() {
  return getPublicationState("site_config", "site");
}

export function getHomeConfigPublicationState() {
  return getPublicationState("home_config", "home");
}

export function getAboutConfigPublicationState() {
  return getPublicationState("about_config", "about");
}

export function getGameTaxonomyPublicationState() {
  return getPublicationState("game_taxonomy", "games");
}

export function getPublicPagesConfigPublicationState() {
  return getPublicationState(
    "public_pages_config",
    PUBLIC_PAGES_EDITORIAL_KEY
  );
}

export async function publishGameDraft(
  key: string,
  expectedRevision: number,
  actorUserId: string
) {
  const result = await publishEditorialDraft(
    "game",
    key,
    expectedRevision,
    actorUserId
  );

  if (
    result.outcome === "published" ||
    result.outcome === "no_changes"
  ) {
    await reconcilePublishedGameImageDeletions(key);
  }

  return result;
}

export function publishUpdateDraft(
  key: string,
  expectedRevision: number,
  actorUserId: string
) {
  return publishEditorialDraft(
    "game_update",
    key,
    expectedRevision,
    actorUserId
  );
}

export function publishSiteConfigDraft(
  expectedRevision: number,
  actorUserId: string
) {
  return publishEditorialDraft(
    "site_config",
    "site",
    expectedRevision,
    actorUserId
  );
}

export function publishHomeConfigDraft(
  expectedRevision: number,
  actorUserId: string
) {
  return publishEditorialDraft(
    "home_config",
    "home",
    expectedRevision,
    actorUserId
  );
}

export function publishAboutConfigDraft(
  expectedRevision: number,
  actorUserId: string
) {
  return publishEditorialDraft(
    "about_config",
    "about",
    expectedRevision,
    actorUserId
  );
}

export function publishGameTaxonomyDraft(
  expectedRevision: number,
  actorUserId: string
) {
  return publishEditorialDraft(
    "game_taxonomy",
    "games",
    expectedRevision,
    actorUserId
  );
}

export function publishPublicPagesConfigDraft(
  expectedRevision: number,
  actorUserId: string
) {
  return publishEditorialDraft(
    "public_pages_config",
    PUBLIC_PAGES_EDITORIAL_KEY,
    expectedRevision,
    actorUserId
  );
}

export function restoreGamePublication(
  publicationId: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return restoreEditorialPublication(
    "game",
    publicationId,
    expectedPublicationNumber,
    actorUserId
  );
}

export function restoreUpdatePublication(
  publicationId: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return restoreEditorialPublication(
    "game_update",
    publicationId,
    expectedPublicationNumber,
    actorUserId
  );
}

export function restoreSiteConfigPublication(
  publicationId: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return restoreEditorialPublication(
    "site_config",
    publicationId,
    expectedPublicationNumber,
    actorUserId
  );
}

export function restoreHomeConfigPublication(
  publicationId: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return restoreEditorialPublication(
    "home_config",
    publicationId,
    expectedPublicationNumber,
    actorUserId
  );
}

export function restoreAboutConfigPublication(
  publicationId: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return restoreEditorialPublication(
    "about_config",
    publicationId,
    expectedPublicationNumber,
    actorUserId
  );
}

export function restoreGameTaxonomyPublication(
  publicationId: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return restoreEditorialPublication(
    "game_taxonomy",
    publicationId,
    expectedPublicationNumber,
    actorUserId
  );
}

export function restorePublicPagesConfigPublication(
  publicationId: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return restoreEditorialPublication(
    "public_pages_config",
    publicationId,
    expectedPublicationNumber,
    actorUserId
  );
}
