import "server-only";

import {
  adminQuery,
} from "./database";
import {
  verifyAdminSession,
} from "./session";

const publishableTypes = [
  "game",
  "game_update",
  "site_config",
  "home_config",
  "about_config",
  "game_taxonomy",
  "public_pages_config",
  "platform_catalog",
  "software",
  "game_collection",
] as const;

type PublishableType = (typeof publishableTypes)[number];

type EditorialTableRow = {
  editorial_table: string | null;
};

type PublicationCountsRow = {
  games: number;
  updates: number;
  pending: number;
};

type PendingPublicationRow = {
  item_type: PublishableType;
  item_key: string;
  label: string;
  publication_number: number;
  public_visible: boolean;
  draft_differs: boolean;
  ever_published: boolean;
};

type ItemPublicationStateRow = {
  item_key: string;
  publication_number: number;
  public_visible: boolean;
  has_unpublished_changes: boolean;
  panel_created: boolean;
  ever_published: boolean;
};

type ItemPublicationIdentityRow = {
  publication_number: number;
  public_visible: boolean;
  has_unpublished_changes: boolean;
  panel_created: boolean;
  ever_published: boolean;
};

export type PendingPublication = {
  type: PublishableType;
  key: string;
  label: string;
  publicationNumber: number;
  status: "pending" | "hidden" | "unpublished";
};

export type PublicationOverview = {
  available: boolean;
  games: number;
  updates: number;
  pending: number;
  pendingItems: PendingPublication[];
};

export type ItemPublicationState = {
  key: string;
  publicationNumber: number;
  publicVisible: boolean;
  hasUnpublishedChanges: boolean;
  panelCreated: boolean;
  everPublished: boolean;
};

export type ItemPublicationIdentity = {
  publicationNumber: number;
  publicVisible: boolean;
  hasUnpublishedChanges: boolean;
  panelCreated: boolean;
  everPublished: boolean;
};

const unavailableOverview: PublicationOverview = {
  available: false,
  games: 0,
  updates: 0,
  pending: 0,
  pendingItems: [],
};

async function editorialWorkspaceAvailable() {
  const workspace = await adminQuery<EditorialTableRow>(
    `SELECT to_regclass('deuna_admin.editorial_items')::text AS editorial_table`
  );
  return Boolean(workspace.rows[0]?.editorial_table);
}

function pendingStatus(
  row: PendingPublicationRow
): PendingPublication["status"] {
  if (row.public_visible && row.draft_differs) return "pending";
  return row.ever_published ? "hidden" : "unpublished";
}

const everPublishedSql = `NOT (
  item.source_present = false
  AND item.source_payload = '{}'::jsonb
  AND item.publication_number = 1
)`;

export async function getPublicationOverview(): Promise<PublicationOverview> {
  await verifyAdminSession();

  if (!(await editorialWorkspaceAvailable())) return unavailableOverview;

  const [countsResult, pendingResult] = await Promise.all([
    adminQuery<PublicationCountsRow>(
      `SELECT
         COUNT(*) FILTER (
           WHERE item_type = 'game' AND public_visible = true
         )::int AS games,
         COUNT(*) FILTER (
           WHERE item_type = 'game_update' AND public_visible = true
         )::int AS updates,
         COUNT(*) FILTER (
           WHERE item_type = ANY($1::text[])
             AND (
               public_visible = false OR
               draft_payload IS DISTINCT FROM published_payload
             )
         )::int AS pending
       FROM deuna_admin.editorial_items`,
      [publishableTypes]
    ),
    adminQuery<PendingPublicationRow>(
      `SELECT
         item.item_type,
         item.item_key,
         COALESCE(
           NULLIF(item.draft_payload ->> 'title', ''),
           NULLIF(item.draft_payload ->> 'name', ''),
           CASE item.item_type
             WHEN 'home_config' THEN 'Portada'
             WHEN 'about_config' THEN 'Quiénes somos'
             WHEN 'site_config' THEN 'Identidad pública'
             WHEN 'game_taxonomy' THEN 'Catálogos de juegos'
             WHEN 'public_pages_config' THEN 'Presentación pública'
             WHEN 'platform_catalog' THEN 'Plataformas'
             WHEN 'software' THEN 'Programa'
             WHEN 'game_collection' THEN 'Colección'
             ELSE item.item_key
           END
         ) AS label,
         item.publication_number,
         item.public_visible,
         item.draft_payload IS DISTINCT FROM item.published_payload AS draft_differs,
         ${everPublishedSql} AS ever_published
       FROM deuna_admin.editorial_items AS item
       WHERE item.item_type = ANY($1::text[])
         AND (
           item.public_visible = false OR
           item.draft_payload IS DISTINCT FROM item.published_payload
         )
       ORDER BY item.public_visible ASC, item.updated_at DESC, item.item_key ASC
       LIMIT 10`,
      [publishableTypes]
    ),
  ]);
  const counts = countsResult.rows[0];

  return {
    available: true,
    games: counts?.games ?? 0,
    updates: counts?.updates ?? 0,
    pending: counts?.pending ?? 0,
    pendingItems: pendingResult.rows.map((item) => ({
      type: item.item_type,
      key: item.item_key,
      label: item.label,
      publicationNumber: item.publication_number,
      status: pendingStatus(item),
    })),
  };
}

export async function listPublicationStates(
  type: PublishableType
): Promise<ItemPublicationState[] | null> {
  await verifyAdminSession();
  if (!(await editorialWorkspaceAvailable())) return null;

  const result = await adminQuery<ItemPublicationStateRow>(
    `SELECT
       item.item_key,
       item.publication_number,
       item.public_visible,
       (
         item.public_visible = false OR
         item.draft_payload IS DISTINCT FROM item.published_payload
       ) AS has_unpublished_changes,
       (
         item.source_present = false
         AND item.source_payload = '{}'::jsonb
       ) AS panel_created,
       ${everPublishedSql} AS ever_published
     FROM deuna_admin.editorial_items AS item
     WHERE item.item_type = $1
     ORDER BY item.item_key ASC`,
    [type]
  );

  return result.rows.map((item) => ({
    key: item.item_key,
    publicationNumber: item.publication_number,
    publicVisible: item.public_visible,
    hasUnpublishedChanges: item.has_unpublished_changes,
    panelCreated: item.panel_created,
    everPublished: item.ever_published,
  }));
}

export async function getGamePublicationIdentity(
  key: string
): Promise<ItemPublicationIdentity | null> {
  await verifyAdminSession();
  if (!(await editorialWorkspaceAvailable())) return null;

  const result = await adminQuery<ItemPublicationIdentityRow>(
    `SELECT
       item.publication_number,
       item.public_visible,
       (
         item.public_visible = false OR
         item.draft_payload IS DISTINCT FROM item.published_payload
       ) AS has_unpublished_changes,
       (
         item.source_present = false
         AND item.source_payload = '{}'::jsonb
       ) AS panel_created,
       ${everPublishedSql} AS ever_published
     FROM deuna_admin.editorial_items AS item
     WHERE item.item_type = 'game'
       AND item.item_key = $1
     LIMIT 1`,
    [key]
  );
  const identity = result.rows[0];
  if (!identity) return null;

  return {
    publicationNumber: identity.publication_number,
    publicVisible: identity.public_visible,
    hasUnpublishedChanges: identity.has_unpublished_changes,
    panelCreated: identity.panel_created,
    everPublished: identity.ever_published,
  };
}
