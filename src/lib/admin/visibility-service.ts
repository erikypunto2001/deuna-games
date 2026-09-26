import "server-only";

import {
  withAdminTransaction,
} from "./database";
import {
  validatePublishedGameHide,
  validatePublishedSoftwareHide,
} from "./managed-editorial-relations";
import {
  verifyAdminSession,
} from "./session";

type HideableEditorialType =
  | "game"
  | "game_update"
  | "software"
  | "game_collection";

type VisibilityItemRow = {
  id: string;
  item_key: string;
  publication_number: number;
  public_visible: boolean;
};

export type HideEditorialResult =
  | {
      outcome: "hidden";
      key: string;
      publicationNumber: number;
    }
  | {
      outcome: "already_hidden";
      key: string;
      publicationNumber: number;
    }
  | {
      outcome: "conflict";
      key: string;
      publicationNumber: number;
    }
  | {
      outcome: "in_use";
      key: string;
      publicationNumber: number;
    }
  | { outcome: "not_found" };

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

async function hideEditorialContent(
  type: HideableEditorialType,
  key: string,
  expectedPublicationNumber: number,
  actorUserId: string
): Promise<HideEditorialResult> {
  await assertActor(actorUserId);

  return withAdminTransaction(async (client) => {
    const result = await client.query<VisibilityItemRow>(
      `SELECT
         id,
         item_key,
         publication_number,
         public_visible
       FROM deuna_admin.editorial_items
       WHERE item_type = $1
         AND item_key = $2
       LIMIT 1
       FOR UPDATE`,
      [type, key]
    );
    const item = result.rows[0];

    if (!item) {
      return { outcome: "not_found" };
    }

    if (
      item.publication_number !==
      expectedPublicationNumber
    ) {
      return {
        outcome: "conflict",
        key: item.item_key,
        publicationNumber:
          item.publication_number,
      };
    }

    if (!item.public_visible) {
      return {
        outcome: "already_hidden",
        key: item.item_key,
        publicationNumber:
          item.publication_number,
      };
    }

    const dependencyState =
      type === "software"
        ? await validatePublishedSoftwareHide(
            client,
            key
          )
        : type === "game"
          ? await validatePublishedGameHide(
              client,
              key
            )
          : {
              ok: true as const,
            };

    if (!dependencyState.ok) {
      return {
        outcome: "in_use",
        key: item.item_key,
        publicationNumber:
          item.publication_number,
      };
    }

    await client.query(
      `UPDATE deuna_admin.editorial_items
       SET public_visible = false,
           updated_at = now(),
           updated_by = $2
       WHERE id = $1`,
      [item.id, actorUserId]
    );
    await client.query(
      `INSERT INTO deuna_admin.admin_audit_log
         (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'content_hidden', $2, $3, $4::jsonb)`,
      [
        actorUserId,
        type,
        item.item_key,
        JSON.stringify({
          publicationNumber:
            item.publication_number,
        }),
      ]
    );

    return {
      outcome: "hidden",
      key: item.item_key,
      publicationNumber:
        item.publication_number,
    };
  });
}

export function hideGamePublication(
  key: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return hideEditorialContent(
    "game",
    key,
    expectedPublicationNumber,
    actorUserId
  );
}

export function hideUpdatePublication(
  key: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return hideEditorialContent(
    "game_update",
    key,
    expectedPublicationNumber,
    actorUserId
  );
}

export function hideSoftwarePublication(
  key: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return hideEditorialContent(
    "software",
    key,
    expectedPublicationNumber,
    actorUserId
  );
}

export function hideGameCollectionPublication(
  key: string,
  expectedPublicationNumber: number,
  actorUserId: string
) {
  return hideEditorialContent(
    "game_collection",
    key,
    expectedPublicationNumber,
    actorUserId
  );
}
