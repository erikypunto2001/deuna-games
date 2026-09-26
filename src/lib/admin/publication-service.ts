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
  validatePublishedCollectionSlugNamespace,
  validatePublishedGameCollectionRelations,
  validatePublishedGameRelations,
  validatePublishedPlatformCatalogRemoval,
  validatePublishedPlatformCollectionNamespace,
  validatePublishedSoftwareRelations,
} from "./managed-editorial-relations";
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
  | "public_pages_config"
  | "platform_catalog"
  | "software"
  | "game_collection";

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



export type EditorialPublicationState = {
  itemId: string;
  key: string;
  draftRevision: number;
  publicationNumber: number;
  publishedFromRevision: number | null;
  publishedAt: Date;
  publicVisible: boolean;
  hasUnpublishedChanges: boolean;
};

export type GamePublicationState = EditorialPublicationState;
export type UpdatePublicationState = EditorialPublicationState;
export type SiteConfigPublicationState = EditorialPublicationState;
export type HomeConfigPublicationState = EditorialPublicationState;
export type AboutConfigPublicationState = EditorialPublicationState;
export type GameTaxonomyPublicationState = EditorialPublicationState;
export type PublicPagesConfigPublicationState = EditorialPublicationState;
export type PlatformCatalogPublicationState = EditorialPublicationState;
export type SoftwarePublicationState = EditorialPublicationState;
export type GameCollectionPublicationState = EditorialPublicationState;

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
  | {
      outcome: "invalid_relations";
    }
  | { outcome: "not_found" };

export type PublishGameResult = PublishEditorialResult;
export type PublishUpdateResult = PublishEditorialResult;
export type PublishSiteConfigResult = PublishEditorialResult;
export type PublishHomeConfigResult = PublishEditorialResult;
export type PublishAboutConfigResult = PublishEditorialResult;
export type PublishGameTaxonomyResult = PublishEditorialResult;
export type PublishPublicPagesConfigResult = PublishEditorialResult;
export type PublishPlatformCatalogResult = PublishEditorialResult;
export type PublishSoftwareResult = PublishEditorialResult;
export type PublishGameCollectionResult = PublishEditorialResult;

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

async function validatePublicationRelations(
  client: PoolClient,
  type: PublishableEditorialType,
  payload: unknown
) {
  if (type === "game") {
    return validatePublishedGameRelations(
      client,
      parseEditorialPayload(
        "game",
        payload
      )
    );
  }

  if (type === "software") {
    return validatePublishedSoftwareRelations(
      client,
      parseEditorialPayload(
        "software",
        payload
      )
    );
  }

  if (type === "game_collection") {
    const collection =
      parseEditorialPayload(
        "game_collection",
        payload
      );
    const [
      namespace,
      games,
    ] = await Promise.all([
      validatePublishedCollectionSlugNamespace(
        client,
        collection.slug
      ),
      validatePublishedGameCollectionRelations(
        client,
        collection.gameSlugs
      ),
    ]);

    return {
      ok:
        namespace.ok &&
        games.ok,
    };
  }

  if (type === "platform_catalog") {
    const catalog =
      parseEditorialPayload(
        "platform_catalog",
        payload
      );
    const [
      namespace,
      references,
    ] = await Promise.all([
      validatePublishedPlatformCollectionNamespace(
        client,
        catalog
      ),
      validatePublishedPlatformCatalogRemoval(
        client,
        catalog
      ),
    ]);

    return {
      ok:
        namespace.ok &&
        references.ok,
    };
  }

  return {
    ok: true as const,
  };
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
  action: "content_published",
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
      draftChecksum !== item.published_checksum
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

    const relations =
      await validatePublicationRelations(
        client,
        type,
        item.draft_payload
      );

    if (!relations.ok) {
      return {
        outcome:
          "invalid_relations",
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

export function getPlatformCatalogPublicationState() {
  return getPublicationState(
    "platform_catalog",
    "platforms"
  );
}

export function getSoftwarePublicationState(
  key: string
) {
  return getPublicationState(
    "software",
    key
  );
}

export function getGameCollectionPublicationState(
  key: string
) {
  return getPublicationState(
    "game_collection",
    key
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

export function publishPlatformCatalogDraft(
  expectedRevision: number,
  actorUserId: string
) {
  return publishEditorialDraft(
    "platform_catalog",
    "platforms",
    expectedRevision,
    actorUserId
  );
}

export function publishSoftwareDraft(
  key: string,
  expectedRevision: number,
  actorUserId: string
) {
  return publishEditorialDraft(
    "software",
    key,
    expectedRevision,
    actorUserId
  );
}

export function publishGameCollectionDraft(
  key: string,
  expectedRevision: number,
  actorUserId: string
) {
  return publishEditorialDraft(
    "game_collection",
    key,
    expectedRevision,
    actorUserId
  );
}
