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
import {
  PUBLIC_EXPOSURE_PUBLICATION_SQL,
} from "../src/lib/admin/publication-history.ts";
import {
  createAdminSessionToken,
  hashAdminSessionToken,
} from "../src/lib/admin/session-token.ts";
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

  const sessionToken = createAdminSessionToken();
  await client.query(
    `INSERT INTO deuna_admin.admin_sessions (
       id, user_id, token_hash, expires_at
     )
     VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [
      randomUUID(),
      ownerId,
      hashAdminSessionToken(sessionToken),
    ]
  );

  const privilege = await client.query<{
    can_delete_items: boolean;
    can_delete_panel_game: boolean;
    can_compact_history: boolean;
    can_compact_item_history: boolean;
    can_compact_publication_history: boolean;
  }>(
    `SELECT
       has_table_privilege(
         current_user,
         'deuna_admin.editorial_items',
         'DELETE'
       ) AS can_delete_items,
       has_function_privilege(
         current_user,
         'deuna_admin.delete_panel_game(text,uuid,text,integer,integer)',
         'EXECUTE'
       ) AS can_delete_panel_game,
       has_function_privilege(
         current_user,
         'deuna_admin.compact_editorial_history(uuid,text,integer,integer,integer)',
         'EXECUTE'
       ) AS can_compact_history,
       has_function_privilege(
         current_user,
         'deuna_admin.compact_editorial_item_history(text,text,uuid,text,integer,integer)',
         'EXECUTE'
       ) AS can_compact_item_history,
       has_function_privilege(
         current_user,
         'deuna_admin.compact_editorial_publication_history(text,text,uuid,text,integer)',
         'EXECUTE'
       ) AS can_compact_publication_history`
  );
  assert(
    privilege.rows[0]?.can_delete_items === false,
    "El rol runtime no debe recibir DELETE directo sobre editorial_items."
  );
  assert(
    privilege.rows[0]?.can_delete_panel_game === true &&
      privilege.rows[0]?.can_compact_history === true &&
      privilege.rows[0]?.can_compact_item_history === true &&
      privilege.rows[0]?.can_compact_publication_history === true,
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
       $1, $2, $3, $4, $5
     ) AS result`,
    [
      sourceGame.item_key,
      ownerId,
      sessionToken,
      sourceGame.revision,
      sourceGame.publication_number,
    ]
  );
  assert(
    outcome(sourceDelete.rows[0]?.result).outcome ===
      "source_managed",
    "Un juego fuente no debe poder eliminarse desde Admin."
  );

  const forgedSessionDelete = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.delete_panel_game(
       $1, $2, $3, $4, $5
     ) AS result`,
    [
      sourceGame.item_key,
      ownerId,
      createAdminSessionToken(),
      sourceGame.revision,
      sourceGame.publication_number,
    ]
  );
  assert(
    outcome(
      forgedSessionDelete.rows[0]?.result
    ).outcome === "forbidden",
    "Conocer el UUID del Owner no debe permitir mantenimiento sin su sesión opaca válida."
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

  await client.query(
    `UPDATE deuna_admin.editorial_items
        SET public_visible = true
      WHERE id = $1`,
    [gameId]
  );

  const visibleDelete = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.delete_panel_game(
       $1, $2, $3, 1, 1
     ) AS result`,
    [slug, ownerId, sessionToken]
  );
  assert(
    outcome(visibleDelete.rows[0]?.result).outcome ===
      "still_public",
    "Un juego todavía visible debe ocultarse antes del hard-delete."
  );

  await client.query(
    `UPDATE deuna_admin.editorial_items
        SET public_visible = false
      WHERE id = $1`,
    [gameId]
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
       $1, $2, $3, 1, 1
     ) AS result`,
    [slug, ownerId, sessionToken]
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
       $1, $2, $3, 1, 1
     ) AS result`,
    [slug, ownerId, sessionToken]
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

  const privateBaselineSlug =
    "ci-private-baseline-game";
  const privateBaselineId = randomUUID();
  const privateGame = normalizeEditorialPayload(
    parseEditorialPayload("game", {
      ...fixtureSource,
      id: privateBaselineSlug,
      slug: privateBaselineSlug,
      title: "CI Private Baseline Game",
    })
  );
  const privateSerialized =
    JSON.stringify(privateGame);
  const privateDigest =
    hashEditorialPayload(privateGame);

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
      privateBaselineId,
      privateBaselineSlug,
      emptyDigest,
      privateSerialized,
      privateDigest,
      ownerId,
    ]
  );
  await client.query(
    `INSERT INTO deuna_admin.editorial_revisions (
       item_id, revision, payload, action, actor_user_id
     )
     VALUES ($1, 1, $2::jsonb, 'draft_saved', $3)`,
    [
      privateBaselineId,
      privateSerialized,
      ownerId,
    ]
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
    [
      privateBaselineId,
      privateSerialized,
      privateDigest,
      ownerId,
    ]
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

  const targetHistoryBefore = await client.query<{
    revisions: number;
    publications: number;
  }>(
    `SELECT
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_revisions
          WHERE item_id = $1
       ) AS revisions,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_publications
          WHERE item_id = $1
       ) AS publications`,
    [target.id]
  );
  const targetHistoryCounts =
    targetHistoryBefore.rows[0];
  assert(
    targetHistoryCounts &&
      targetHistoryCounts.revisions > 1 &&
      targetHistoryCounts.publications > 1,
    "El fixture por juego no generó respaldos suficientes para limpiar."
  );

  const snapshotCompacted = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.compact_editorial_publication_history(
       'game',
       $1,
       $2,
       $3,
       $4
     ) AS result`,
    [
      sourceGame.item_key,
      ownerId,
      sessionToken,
      targetHistoryCounts.publications,
    ]
  );
  assert(
    outcome(snapshotCompacted.rows[0]?.result).outcome ===
      "compacted",
    "La limpieza exclusiva de snapshots fue rechazada."
  );

  const afterSnapshotCleanup = await client.query<{
    revisions: number;
    publications: number;
    revision: number;
    publication_number: number;
    published_from_revision: number | null;
    draft_payload: unknown;
    published_payload: unknown;
    public_visible: boolean;
  }>(
    `SELECT
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_revisions
          WHERE item_id = item.id
       ) AS revisions,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_publications
          WHERE item_id = item.id
       ) AS publications,
       item.revision,
       item.publication_number,
       item.published_from_revision,
       item.draft_payload,
       item.published_payload,
       item.public_visible
     FROM deuna_admin.editorial_items AS item
     WHERE item.id = $1`,
    [target.id]
  );
  const snapshotRow = afterSnapshotCleanup.rows[0];
  assert(
    snapshotRow &&
      snapshotRow.revisions === targetHistoryCounts.revisions &&
      snapshotRow.publications === 1 &&
      snapshotRow.revision === nextRevision &&
      snapshotRow.publication_number === nextPublication &&
      snapshotRow.published_from_revision === nextRevision &&
      JSON.stringify(snapshotRow.draft_payload) === targetDraft &&
      JSON.stringify(snapshotRow.published_payload) === targetPublished &&
      snapshotRow.public_visible === target.public_visible,
    "Limpiar snapshots alteró revisiones o el estado editorial actual."
  );

  const itemCompacted = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.compact_editorial_item_history(
       'game',
       $1,
       $2,
       $3,
       $4,
       $5
     ) AS result`,
    [
      sourceGame.item_key,
      ownerId,
      sessionToken,
      snapshotRow.revisions,
      snapshotRow.publications,
    ]
  );
  assert(
    outcome(itemCompacted.rows[0]?.result).outcome ===
      "compacted",
    "La limpieza completa del historial del juego fue rechazada."
  );

  const afterItemCleanup = await client.query<{
    revisions: number;
    publications: number;
    revision: number;
    publication_number: number;
    published_from_revision: number | null;
    draft_payload: unknown;
    published_payload: unknown;
    public_visible: boolean;
  }>(
    `SELECT
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_revisions
          WHERE item_id = item.id
       ) AS revisions,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_publications
          WHERE item_id = item.id
       ) AS publications,
       item.revision,
       item.publication_number,
       item.published_from_revision,
       item.draft_payload,
       item.published_payload,
       item.public_visible
     FROM deuna_admin.editorial_items AS item
     WHERE item.id = $1`,
    [target.id]
  );
  const itemCleanupRow = afterItemCleanup.rows[0];
  assert(
    itemCleanupRow &&
      itemCleanupRow.revisions === 1 &&
      itemCleanupRow.publications === 1 &&
      itemCleanupRow.revision === nextRevision &&
      itemCleanupRow.publication_number === nextPublication &&
      itemCleanupRow.published_from_revision === null &&
      JSON.stringify(itemCleanupRow.draft_payload) === targetDraft &&
      JSON.stringify(itemCleanupRow.published_payload) === targetPublished &&
      itemCleanupRow.public_visible === target.public_visible,
    "Limpiar el historial del juego alteró el estado editorial actual."
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
      (
        beforeCounts.revisions > beforeCounts.items ||
        beforeCounts.publications > beforeCounts.items
      ),
    "El fixture no generó historial antiguo para compactar."
  );

  const compacted = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.compact_editorial_history(
       $1, $2, $3, $4, $5
     ) AS result`,
    [
      ownerId,
      sessionToken,
      beforeCounts.items,
      beforeCounts.revisions,
      beforeCounts.publications,
    ]
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

  const baselineActions = await client.query<{
    revision_baselines: number;
    publication_baselines: number;
  }>(
    `SELECT
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_revisions
          WHERE action = 'baseline'
       ) AS revision_baselines,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_publications
          WHERE action = 'baseline'
       ) AS publication_baselines`
  );
  assert(
    (baselineActions.rows[0]?.revision_baselines ?? 0) > 0 &&
      (baselineActions.rows[0]?.publication_baselines ?? 0) > 0,
    "La compactación debe identificar explícitamente el baseline de mantenimiento."
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

  const homeCounts = await client.query<{
    revisions: number;
    publications: number;
  }>(
    `SELECT
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_revisions
          WHERE item_id = $1
       ) AS revisions,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_publications
          WHERE item_id = $1
       ) AS publications`,
    [homeRow.id]
  );
  const homeCountRow = homeCounts.rows[0];
  assert(homeCountRow, "Faltan conteos de historial de Inicio.");

  const homeCompacted = await client.query<{
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
      ownerId,
      sessionToken,
      homeCountRow.revisions,
      homeCountRow.publications,
    ]
  );
  assert(
    outcome(homeCompacted.rows[0]?.result).outcome ===
      "compacted",
    "La compactación acotada de Inicio fue rechazada."
  );

  const privateExposure = await client.query<{
    count: number;
  }>(
    `SELECT count(*)::int AS count
       FROM deuna_admin.editorial_publications AS publication
      WHERE publication.item_id = $1
        AND ${PUBLIC_EXPOSURE_PUBLICATION_SQL}`,
    [privateBaselineId]
  );
  assert(
    privateExposure.rows[0]?.count === 0,
    "Compactar historial no debe convertir el bootstrap privado de un juego Admin en exposición pública."
  );

  await client.query("ROLLBACK");

  console.log(
    "Higiene editorial PostgreSQL: OK (mínimo privilegio, bloqueo de fuente/visibilidad/Home, borrado coordinado, limpieza de snapshots, historial por juego y compactación global/acotada preservando estado actual)."
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
