import {
  randomUUID,
} from "node:crypto";

import { Pool } from "pg";

import {
  hashEditorialPayload,
  normalizeEditorialPayload,
} from "../src/lib/admin/content-hash.ts";
import {
  parseEditorialPayload,
} from "../src/lib/admin/content-validation.ts";
import {
  getAdminDatabaseConfig,
} from "../src/lib/admin/database-config.ts";
import { games } from "../src/data/games.ts";

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function outcome(value: unknown) {
  assert(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value),
    "La función de mantenimiento no devolvió un objeto JSON."
  );
  return value as Record<string, unknown>;
}

const pool = new Pool(
  getAdminDatabaseConfig("runtime")
);
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const owner = await client.query<{
    id: string;
  }>(
    `SELECT id
       FROM deuna_admin.admin_users
      WHERE role = 'owner'
        AND active = true
      LIMIT 1`
  );
  const ownerId = owner.rows[0]?.id;
  assert(ownerId, "Falta el Owner aislado de CI.");

  const privilege = await client.query<{
    can_delete_items: boolean;
    can_delete_panel_game: boolean;
    can_compact_history: boolean;
  }>(
    `SELECT
       has_table_privilege(
         current_user,
         'deuna_admin.editorial_items',
         'DELETE'
       ) AS can_delete_items,
       has_function_privilege(
         current_user,
         'deuna_admin.delete_panel_game(text,uuid,integer,integer)',
         'EXECUTE'
       ) AS can_delete_panel_game,
       has_function_privilege(
         current_user,
         'deuna_admin.compact_editorial_history(uuid)',
         'EXECUTE'
       ) AS can_compact_history`
  );
  assert(
    privilege.rows[0]?.can_delete_items === false,
    "El rol runtime no debe recibir DELETE directo sobre editorial_items."
  );
  assert(
    privilege.rows[0]?.can_delete_panel_game === true &&
      privilege.rows[0]?.can_compact_history === true,
    "El rol runtime debe ejecutar sólo las funciones de mantenimiento autorizadas."
  );

  const sourceItem = await client.query<{
    item_key: string;
    revision: number;
    publication_number: number;
  }>(
    `SELECT item_key, revision, publication_number
       FROM deuna_admin.editorial_items
      WHERE item_type = 'game'
        AND source_present = true
      ORDER BY item_key
      LIMIT 1`
  );
  const sourceGame = sourceItem.rows[0];
  assert(sourceGame, "Falta un juego fuente para probar el bloqueo.");

  const sourceDelete = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.delete_panel_game(
       $1, $2, $3, $4
     ) AS result`,
    [
      sourceGame.item_key,
      ownerId,
      sourceGame.revision,
      sourceGame.publication_number,
    ]
  );
  assert(
    outcome(sourceDelete.rows[0]?.result).outcome ===
      "source_managed",
    "Un juego fuente no debe poder eliminarse desde Admin."
  );

  const fixtureSource = games[0];
  assert(fixtureSource, "El catálogo fuente está vacío.");
  const slug = "ci-panel-cleanup-game";
  const game = normalizeEditorialPayload(
    parseEditorialPayload("game", {
      ...fixtureSource,
      id: slug,
      slug,
      title: "CI Panel Cleanup Game",
    })
  );
  const serializedGame = JSON.stringify(game);
  const gameDigest = hashEditorialPayload(game);
  const emptySource = {};
  const emptyDigest =
    hashEditorialPayload(emptySource);
  const gameId = randomUUID();

  await client.query(
    `INSERT INTO deuna_admin.editorial_items (
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
       'game',
       $2,
       '{}'::jsonb,
       $3,
       false,
       $4::jsonb,
       'modified',
       $4::jsonb,
       $5,
       false,
       $6
     )`,
    [
      gameId,
      slug,
      emptyDigest,
      serializedGame,
      gameDigest,
      ownerId,
    ]
  );
  await client.query(
    `INSERT INTO deuna_admin.editorial_revisions (
       item_id, revision, payload, action, actor_user_id
     )
     VALUES ($1, 1, $2::jsonb, 'draft_saved', $3)`,
    [gameId, serializedGame, ownerId]
  );
  await client.query(
    `INSERT INTO deuna_admin.editorial_publications (
       item_id,
       publication_number,
       payload,
       checksum,
       source_revision,
       action,
       actor_user_id
     )
     VALUES ($1, 1, $2::jsonb, $3, 1, 'bootstrap', $4)`,
    [gameId, serializedGame, gameDigest, ownerId]
  );

  const updateId = randomUUID();
  const updateKey = "ci-panel-cleanup-game-v2";
  const updatePayload = JSON.stringify({
    id: updateKey,
    gameSlug: slug,
    version: "v2",
    publishedAt: "2026-09-22T00:00:00.000Z",
    type: "update",
    summary: "Fixture de limpieza editorial.",
    featured: false,
  });
  const updateDigest = hashEditorialPayload(
    JSON.parse(updatePayload)
  );

  await client.query(
    `INSERT INTO deuna_admin.editorial_items (
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
       'game_update',
       $2,
       '{}'::jsonb,
       $3,
       false,
       $4::jsonb,
       'modified',
       $4::jsonb,
       $5,
       false,
       $6
     )`,
    [
      updateId,
      updateKey,
      emptyDigest,
      updatePayload,
      updateDigest,
      ownerId,
    ]
  );
  await client.query(
    `INSERT INTO deuna_admin.editorial_revisions (
       item_id, revision, payload, action, actor_user_id
     )
     VALUES ($1, 1, $2::jsonb, 'draft_saved', $3)`,
    [updateId, updatePayload, ownerId]
  );
  await client.query(
    `INSERT INTO deuna_admin.editorial_publications (
       item_id,
       publication_number,
       payload,
       checksum,
       source_revision,
       action,
       actor_user_id
     )
     VALUES ($1, 1, $2::jsonb, $3, 1, 'bootstrap', $4)`,
    [updateId, updatePayload, updateDigest, ownerId]
  );

  const accountId = randomUUID();
  await client.query(
    `INSERT INTO deuna_accounts.users (
       id, username, username_key, password_hash
     )
     VALUES ($1, $2, $2, 'ci-placeholder')`,
    [accountId, "ci_cleanup_account"]
  );
  await client.query(
    `INSERT INTO deuna_accounts.game_preferences (
       user_id,
       game_slug,
       favorite,
       library_state,
       follow_updates,
       followed_at
     )
     VALUES ($1, $2, true, 'playing', true, now())`,
    [accountId, slug]
  );
  await client.query(
    `INSERT INTO deuna_accounts.game_ratings (
       user_id, game_slug, rating
     )
     VALUES ($1, $2, 5)`,
    [accountId, slug]
  );
  await client.query(
    `INSERT INTO deuna_admin.game_insight_scores (
       game_slug,
       score,
       confidence,
       evidence_count,
       breakdown,
       calculated_by
     )
     VALUES (
       $1, 80, 'medium', 2, '{}'::jsonb, $2
     )`,
    [slug, ownerId]
  );

  const home = await client.query<{
    id: string;
    draft_payload: Record<string, unknown>;
  }>(
    `SELECT id, draft_payload
       FROM deuna_admin.editorial_items
      WHERE item_type = 'home_config'
        AND item_key = 'home'
      LIMIT 1
      FOR UPDATE`
  );
  const homeRow = home.rows[0];
  assert(homeRow, "Falta home_config para probar referencias.");

  const originalHomeDraft =
    structuredClone(homeRow.draft_payload);
  const heroSlugs = Array.isArray(
    originalHomeDraft.heroSlugs
  )
    ? originalHomeDraft.heroSlugs
    : [];

  await client.query(
    `UPDATE deuna_admin.editorial_items
        SET draft_payload = jsonb_set(
          draft_payload,
          '{heroSlugs}',
          $2::jsonb
        )
      WHERE id = $1`,
    [
      homeRow.id,
      JSON.stringify([
        ...heroSlugs,
        slug,
      ]),
    ]
  );

  const blocked = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.delete_panel_game(
       $1, $2, 1, 1
     ) AS result`,
    [slug, ownerId]
  );
  assert(
    outcome(blocked.rows[0]?.result).outcome ===
      "home_reference",
    "Una referencia actual de Home debe bloquear la eliminación."
  );

  await client.query(
    `UPDATE deuna_admin.editorial_items
        SET draft_payload = $2::jsonb
      WHERE id = $1`,
    [
      homeRow.id,
      JSON.stringify(originalHomeDraft),
    ]
  );

  const deleted = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.delete_panel_game(
       $1, $2, 1, 1
     ) AS result`,
    [slug, ownerId]
  );
  const deleteResult = outcome(
    deleted.rows[0]?.result
  );
  assert(
    deleteResult.outcome === "deleted",
    "El juego creado desde Admin y sin referencias debe eliminarse."
  );
  assert(
    Number(deleteResult.updatesDeleted) === 1 &&
      Number(deleteResult.preferencesDeleted) === 1 &&
      Number(deleteResult.ratingsDeleted) === 1 &&
      Number(deleteResult.insightSnapshotsDeleted) === 1,
    "La eliminación debe limpiar dependencias por slug."
  );

  const leftovers = await client.query<{
    editorial: number;
    preferences: number;
    ratings: number;
    insights: number;
  }>(
    `SELECT
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_items
          WHERE item_key IN ($1, $2)
       ) AS editorial,
       (
         SELECT count(*)::int
           FROM deuna_accounts.game_preferences
          WHERE game_slug = $1
       ) AS preferences,
       (
         SELECT count(*)::int
           FROM deuna_accounts.game_ratings
          WHERE game_slug = $1
       ) AS ratings,
       (
         SELECT count(*)::int
           FROM deuna_admin.game_insight_scores
          WHERE game_slug = $1
       ) AS insights`,
    [slug, updateKey]
  );
  assert(
    Object.values(leftovers.rows[0] ?? {})
      .every((value) => value === 0),
    "La eliminación dejó referencias huérfanas."
  );

  const audit = await client.query<{
    count: number;
  }>(
    `SELECT count(*)::int AS count
       FROM deuna_admin.admin_audit_log
      WHERE action = 'content_deleted'
        AND entity_type = 'game'
        AND entity_id = $1`,
    [slug]
  );
  assert(
    audit.rows[0]?.count === 1,
    "La eliminación debe conservar un evento de auditoría."
  );

  const compactionTarget = await client.query<{
    id: string;
    revision: number;
    publication_number: number;
    draft_payload: unknown;
    published_payload: unknown;
    public_visible: boolean;
  }>(
    `SELECT
       id,
       revision,
       publication_number,
       draft_payload,
       published_payload,
       public_visible
     FROM deuna_admin.editorial_items
     WHERE item_type = 'game'
       AND source_present = true
     ORDER BY item_key
     LIMIT 1
     FOR UPDATE`
  );
  const target = compactionTarget.rows[0];
  assert(target, "Falta registro para probar compactación.");

  const nextRevision = target.revision + 1;
  const nextPublication =
    target.publication_number + 1;
  const targetDraft = JSON.stringify(
    target.draft_payload
  );
  const targetPublished = JSON.stringify(
    target.published_payload
  );
  const targetDigest = hashEditorialPayload(
    target.published_payload
  );

  await client.query(
    `UPDATE deuna_admin.editorial_items
        SET revision = $2,
            publication_number = $3,
            published_from_revision = $2
      WHERE id = $1`,
    [
      target.id,
      nextRevision,
      nextPublication,
    ]
  );
  await client.query(
    `INSERT INTO deuna_admin.editorial_revisions (
       item_id, revision, payload, action
     )
     VALUES (
       $1, $2, $3::jsonb, 'source_refreshed'
     )`,
    [
      target.id,
      nextRevision,
      targetDraft,
    ]
  );
  await client.query(
    `INSERT INTO deuna_admin.editorial_publications (
       item_id,
       publication_number,
       payload,
       checksum,
       source_revision,
       action
     )
     VALUES (
       $1, $2, $3::jsonb, $4, $5, 'published'
     )`,
    [
      target.id,
      nextPublication,
      targetPublished,
      targetDigest,
      nextRevision,
    ]
  );

  const before = await client.query<{
    items: number;
    revisions: number;
    publications: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM deuna_admin.editorial_items) AS items,
       (SELECT count(*)::int FROM deuna_admin.editorial_revisions) AS revisions,
       (SELECT count(*)::int FROM deuna_admin.editorial_publications) AS publications`
  );
  const beforeCounts = before.rows[0];
  assert(
    beforeCounts &&
      beforeCounts.revisions > beforeCounts.items &&
      beforeCounts.publications > beforeCounts.items,
    "El fixture no generó historial antiguo para compactar."
  );

  const compacted = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.compact_editorial_history(
       $1
     ) AS result`,
    [ownerId]
  );
  assert(
    outcome(compacted.rows[0]?.result).outcome ===
      "compacted",
    "La compactación fue rechazada."
  );

  const after = await client.query<{
    items: number;
    revisions: number;
    publications: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM deuna_admin.editorial_items) AS items,
       (SELECT count(*)::int FROM deuna_admin.editorial_revisions) AS revisions,
       (SELECT count(*)::int FROM deuna_admin.editorial_publications) AS publications`
  );
  const afterCounts = after.rows[0];
  assert(
    afterCounts &&
      afterCounts.revisions === afterCounts.items &&
      afterCounts.publications === afterCounts.items,
    "La compactación debe conservar exactamente un baseline por registro."
  );

  const preserved = await client.query<{
    draft_payload: unknown;
    published_payload: unknown;
    public_visible: boolean;
    revision: number;
    publication_number: number;
    published_from_revision: number | null;
  }>(
    `SELECT
       draft_payload,
       published_payload,
       public_visible,
       revision,
       publication_number,
       published_from_revision
     FROM deuna_admin.editorial_items
     WHERE id = $1`,
    [target.id]
  );
  const preservedRow = preserved.rows[0];
  assert(
    preservedRow &&
      JSON.stringify(preservedRow.draft_payload) === targetDraft &&
      JSON.stringify(preservedRow.published_payload) === targetPublished &&
      preservedRow.public_visible === target.public_visible &&
      preservedRow.revision === nextRevision &&
      preservedRow.publication_number === nextPublication &&
      preservedRow.published_from_revision === null,
    "La compactación alteró estado editorial actual o dejó una revisión histórica colgante."
  );

  const compactionAudit = await client.query<{
    count: number;
  }>(
    `SELECT count(*)::int AS count
       FROM deuna_admin.admin_audit_log
      WHERE action = 'editorial_history_compacted'
        AND user_id = $1`,
    [ownerId]
  );
  assert(
    compactionAudit.rows[0]?.count === 1,
    "La compactación debe quedar auditada."
  );

  await client.query("ROLLBACK");

  console.log(
    "Higiene editorial PostgreSQL: OK (mínimo privilegio, bloqueo de fuente/Home, borrado coordinado y compactación preservando estado actual)."
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
