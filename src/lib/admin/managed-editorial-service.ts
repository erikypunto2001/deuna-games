import "server-only";

import {
  randomUUID,
} from "node:crypto";
import type {
  PoolClient,
} from "pg";

import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "./content-hash";
import {
  parseEditorialPayload,
  type EditorialItemType,
  type EditorialPayloadByType,
} from "./content-validation";
import {
  withAdminTransaction,
} from "./database";
import {
  verifyAdminSession,
} from "./session";

type ManagedType =
  | "software"
  | "game_collection"
  | "platform_catalog";

type EditorialRow = {
  id: string;
  item_key: string;
  source_checksum: string;
  draft_payload: unknown;
  revision: number;
};

export type ManagedEditorialResult =
  | {
      outcome: "saved";
      revision: number;
    }
  | {
      outcome: "conflict";
      revision: number;
    }
  | {
      outcome: "not_found";
    };

export type CreateManagedEditorialResult =
  | {
      outcome: "created";
      key: string;
    }
  | {
      outcome: "exists";
      key: string;
    };

async function assertActor(
  actorUserId: string
) {
  const session =
    await verifyAdminSession();

  if (
    session.userId !==
    actorUserId
  ) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }
}

async function writeAudit(
  client: PoolClient,
  actorUserId: string,
  action:
    | "content_created"
    | "draft_saved",
  type: ManagedType,
  key: string,
  details: Record<
    string,
    unknown
  >
) {
  await client.query(
    `INSERT INTO deuna_admin.admin_audit_log
       (
         user_id,
         action,
         entity_type,
         entity_id,
         details
       )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5::jsonb
     )`,
    [
      actorUserId,
      action,
      type,
      key,
      JSON.stringify(details),
    ]
  );
}

export async function createManagedEditorialDraft<
  Type extends Extract<
    EditorialItemType,
    ManagedType
  >,
>(
  type: Type,
  key: string,
  payload:
    EditorialPayloadByType[Type],
  actorUserId: string
): Promise<CreateManagedEditorialResult> {
  await assertActor(
    actorUserId
  );

  const normalized =
    normalizeEditorialPayload(
      parseEditorialPayload(
        type,
        payload
      )
    );
  const serialized =
    JSON.stringify(normalized);
  const digest =
    hashEditorialPayload(
      normalized
    );
  const source = {};
  const sourceSerialized =
    JSON.stringify(source);
  const sourceDigest =
    hashEditorialPayload(
      source
    );

  return withAdminTransaction(
    async (client) => {
      const inserted =
        await client.query<{
          id: string;
        }>(
          `INSERT INTO deuna_admin.editorial_items
             (
               id,
               item_type,
               item_key,
               source_payload,
               source_checksum,
               source_present,
               draft_payload,
               draft_status,
               published_payload,
               published_checksum,
               public_visible,
               updated_by
             )
           VALUES (
             $1,
             $2,
             $3,
             $4::jsonb,
             $5,
             false,
             $6::jsonb,
             'modified',
             $6::jsonb,
             $7,
             false,
             $8
           )
           ON CONFLICT (
             item_type,
             item_key
           )
           DO NOTHING
           RETURNING id`,
          [
            randomUUID(),
            type,
            key,
            sourceSerialized,
            sourceDigest,
            serialized,
            digest,
            actorUserId,
          ]
        );

      if (!inserted.rows[0]) {
        return {
          outcome:
            "exists" as const,
          key,
        };
      }

      await writeAudit(
        client,
        actorUserId,
        "content_created",
        type,
        key,
        {
          revision: 1,
          publicationNumber: 1,
          publicVisible: false,
        }
      );

      return {
        outcome:
          "created" as const,
        key,
      };
    }
  );
}

export async function saveManagedEditorialDraft<
  Type extends Extract<
    EditorialItemType,
    ManagedType
  >,
>(
  type: Type,
  key: string,
  expectedRevision: number,
  payload:
    EditorialPayloadByType[Type],
  actorUserId: string
): Promise<ManagedEditorialResult> {
  await assertActor(
    actorUserId
  );

  return withAdminTransaction(
    async (client) => {
      const result =
        await client.query<EditorialRow>(
          `SELECT
             id,
             item_key,
             source_checksum,
             draft_payload,
             revision
           FROM deuna_admin.editorial_items
           WHERE item_type = $1
             AND item_key = $2
           LIMIT 1
           FOR UPDATE`,
          [
            type,
            key,
          ]
        );
      const row =
        result.rows[0];

      if (!row) {
        return {
          outcome:
            "not_found" as const,
        };
      }

      if (
        row.revision !==
        expectedRevision
      ) {
        return {
          outcome:
            "conflict" as const,
          revision:
            row.revision,
        };
      }

      const normalized =
        normalizeEditorialPayload(
          parseEditorialPayload(
            type,
            payload
          )
        );
      const serialized =
        JSON.stringify(
          normalized
        );
      const digest =
        hashEditorialPayload(
          normalized
        );
      const nextRevision =
        row.revision + 1;
      const draftStatus =
        digest ===
        row.source_checksum
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
          row.id,
          serialized,
          draftStatus,
          nextRevision,
          actorUserId,
        ]
      );

      await writeAudit(
        client,
        actorUserId,
        "draft_saved",
        type,
        key,
        {
          revision:
            nextRevision,
        }
      );

      return {
        outcome:
          "saved" as const,
        revision:
          nextRevision,
      };
    }
  );
}
