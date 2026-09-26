import "server-only";

import type {
  PoolClient,
} from "pg";

import {
  adminQuery,
  withAdminTransaction,
} from "./database";
import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "./content-hash";
import {
  parseEditorialPayload,
  type EditorialAboutConfig,
  type EditorialHomeConfig,
  type EditorialItemType,
  type EditorialPayloadByType,
  type EditorialPublicPagesConfig,
  type EditorialSiteConfig,
} from "./content-validation";
import {
  verifyAdminSession,
} from "./session";

import type {
  Game,
} from "@/types/game";
import type { GameUpdate } from "@/types/update";

type EditorialStatus = "synced" | "modified";

type EditorialListRow = {
  item_key: string;
  draft_payload: unknown;
  draft_status: EditorialStatus;
  revision: number;
  source_present: boolean;
  updated_at: Date;
};

type EditorialItemRow = EditorialListRow & {
  id: string;
  item_type: EditorialItemType;
  source_checksum: string;
};


type EditorialOverviewRow = {
  games: string;
  updates: string;
  modified: string;
};

export type EditorialListItem<
  Type extends EditorialItemType,
> = {
  key: string;
  payload: EditorialPayloadByType[Type];
  status: EditorialStatus;
  revision: number;
  sourcePresent: boolean;
  updatedAt: Date;
};


export type EditorialItem<
  Type extends EditorialItemType,
> = EditorialListItem<Type> & {
  id: string;
  type: Type;
};

export type EditorialMutationResult =
  | { outcome: "saved"; revision: number }
  | { outcome: "conflict"; revision: number }
  | { outcome: "not_found" };

export type GameMediaDraftInput = Pick<
  Game,
  | "coverArtworkSource"
  | "coverImage"
  | "heroImage"
  | "cardImage"
  | "detailImage"
  | "backgroundImage"
  | "screenshots"
  | "galleryMedia"
  | "imageMedia"
  | "mediaModes"
  | "videoMedia"
  | "previewClip"
>;

export type UpdateDraftInput = Pick<
  GameUpdate,
  | "version"
  | "publishedAt"
  | "type"
  | "summary"
  | "featured"
>;

export type AboutHeroDraftInput =
  EditorialAboutConfig["hero"];

export type AboutPrinciplesDraftInput = Pick<
  EditorialAboutConfig,
  "intro" | "principles"
>;

export type AboutReasonDraftInput = Pick<
  EditorialAboutConfig,
  "reason" | "ecosystem"
>;

export type AboutManifestoDraftInput = Pick<
  EditorialAboutConfig,
  "manifesto" | "ctaTitle"
>;

function mapListRow<Type extends EditorialItemType>(
  type: Type,
  row: EditorialListRow
): EditorialListItem<Type> {
  return {
    key: row.item_key,
    payload: parseEditorialPayload(
      type,
      row.draft_payload
    ),
    status: row.draft_status,
    revision: row.revision,
    sourcePresent: row.source_present,
    updatedAt: row.updated_at,
  };
}

export async function listEditorialItems<
  Type extends EditorialItemType,
>(type: Type) {
  await verifyAdminSession();

  const result = await adminQuery<EditorialListRow>(
    `SELECT
       item_key,
       draft_payload,
       draft_status,
       revision,
       source_present,
       updated_at
     FROM deuna_admin.editorial_items
     WHERE item_type = $1
     ORDER BY lower(
       COALESCE(
         draft_payload ->> 'title',
         draft_payload ->> 'name',
         item_key
       )
     ) ASC`,
    [type]
  );

  return result.rows.map((row) =>
    mapListRow(type, row)
  );
}

export async function getEditorialOverview() {
  await verifyAdminSession();

  const result = await adminQuery<EditorialOverviewRow>(
    `SELECT
       count(*) FILTER (
         WHERE item_type = 'game'
           AND source_present = true
       )::text AS games,
       count(*) FILTER (
         WHERE item_type = 'game_update'
           AND source_present = true
       )::text AS updates,
       count(*) FILTER (
         WHERE draft_status = 'modified'
       )::text AS modified
     FROM deuna_admin.editorial_items`
  );
  const row = result.rows[0];

  return {
    games: Number(row?.games ?? 0),
    updates: Number(row?.updates ?? 0),
    modified: Number(row?.modified ?? 0),
  };
}

export async function getEditorialItem<
  Type extends EditorialItemType,
>(type: Type, key: string): Promise<EditorialItem<Type> | null> {
  await verifyAdminSession();

  const result = await adminQuery<EditorialItemRow>(
    `SELECT
       id,
       item_type,
       item_key,
       draft_payload,
       draft_status,
       revision,
       source_checksum,
       source_present,
       updated_at
     FROM deuna_admin.editorial_items
     WHERE item_type = $1
       AND item_key = $2
     LIMIT 1`,
    [type, key]
  );
  const row = result.rows[0];

  if (!row) return null;

  return {
    id: row.id,
    type,
    ...mapListRow(type, row),
  };
}

async function writeRevision(
  client: PoolClient,
  item: EditorialItemRow,
  payload: EditorialPayloadByType[EditorialItemType],
  actorUserId: string,
  action: "draft_saved",
  details: Record<string, unknown>
) {
  const nextRevision = item.revision + 1;
  const normalized = normalizeEditorialPayload(
    parseEditorialPayload(item.item_type, payload)
  );
  const serialized = JSON.stringify(normalized);
  const status: EditorialStatus =
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
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      actorUserId,
      action,
      item.item_type,
      item.item_key,
      JSON.stringify({
        revision: nextRevision,
        ...details,
      }),
    ]
  );

  return nextRevision;
}

async function updateEditorialDraft<
  Type extends EditorialItemType,
>(
  type: Type,
  key: string,
  expectedRevision: number,
  actorUserId: string,
  update: (
    current: EditorialPayloadByType[Type]
  ) => EditorialPayloadByType[Type]
): Promise<EditorialMutationResult> {
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
         item_type,
         item_key,
         draft_payload,
         draft_status,
         revision,
         source_checksum,
         source_present,
         updated_at
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

    const current = parseEditorialPayload(
      type,
      item.draft_payload
    );
    const next = update(current);
    const revision = await writeRevision(
      client,
      item,
      next,
      actorUserId,
      "draft_saved",
      {}
    );

    return { outcome: "saved", revision };
  });
}

export function saveGameMediaDraft(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  input: GameMediaDraftInput
) {
  return updateEditorialDraft(
    "game",
    key,
    expectedRevision,
    actorUserId,
    (current) => ({
      ...current,
      ...input,
    })
  );
}

export function saveUpdateDraft(
  key: string,
  expectedRevision: number,
  actorUserId: string,
  input: UpdateDraftInput
) {
  return updateEditorialDraft(
    "game_update",
    key,
    expectedRevision,
    actorUserId,
    (current) => ({
      ...current,
      ...input,
    })
  );
}

export function saveSiteConfigDraft(
  expectedRevision: number,
  actorUserId: string,
  input: EditorialSiteConfig
) {
  return updateEditorialDraft(
    "site_config",
    "site",
    expectedRevision,
    actorUserId,
    () => input
  );
}

export function saveHomeConfigDraft(
  expectedRevision: number,
  actorUserId: string,
  input: EditorialHomeConfig
) {
  return updateEditorialDraft(
    "home_config",
    "home",
    expectedRevision,
    actorUserId,
    () => input
  );
}

export function savePublicPagesConfigDraft(
  expectedRevision: number,
  actorUserId: string,
  update: (
    current: EditorialPublicPagesConfig
  ) => EditorialPublicPagesConfig
) {
  return updateEditorialDraft(
    "public_pages_config",
    "public-pages",
    expectedRevision,
    actorUserId,
    update
  );
}

export function saveAboutHeroDraft(
  expectedRevision: number,
  actorUserId: string,
  input: AboutHeroDraftInput
) {
  return updateEditorialDraft(
    "about_config",
    "about",
    expectedRevision,
    actorUserId,
    (current) => ({
      ...current,
      hero: input,
    })
  );
}

export function saveAboutPrinciplesDraft(
  expectedRevision: number,
  actorUserId: string,
  input: AboutPrinciplesDraftInput
) {
  return updateEditorialDraft(
    "about_config",
    "about",
    expectedRevision,
    actorUserId,
    (current) => ({
      ...current,
      ...input,
    })
  );
}

export function saveAboutReasonDraft(
  expectedRevision: number,
  actorUserId: string,
  input: AboutReasonDraftInput
) {
  return updateEditorialDraft(
    "about_config",
    "about",
    expectedRevision,
    actorUserId,
    (current) => ({
      ...current,
      ...input,
    })
  );
}

export function saveAboutManifestoDraft(
  expectedRevision: number,
  actorUserId: string,
  input: AboutManifestoDraftInput
) {
  return updateEditorialDraft(
    "about_config",
    "about",
    expectedRevision,
    actorUserId,
    (current) => ({
      ...current,
      ...input,
    })
  );
}
