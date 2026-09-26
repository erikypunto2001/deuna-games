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
    revision_table: string | null;
    publication_table: string | null;
    global_compactor: string | null;
    item_compactor: string | null;
    publication_compactor: string | null;
    can_begin_media_cleanup: boolean;
    can_complete_media_cleanup: boolean;
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
       to_regclass('deuna_admin.editorial_revisions')::text AS revision_table,
       to_regclass('deuna_admin.editorial_publications')::text AS publication_table,
       to_regprocedure(
         'deuna_admin.compact_editorial_history(uuid,text,integer,integer,integer)'
       )::text AS global_compactor,
       to_regprocedure(
         'deuna_admin.compact_editorial_item_history(text,text,uuid,text,integer,integer)'
       )::text AS item_compactor,
       to_regprocedure(
         'deuna_admin.compact_editorial_publication_history(text,text,uuid,text,integer)'
       )::text AS publication_compactor,
       has_function_privilege(
         current_user,
         'deuna_admin.begin_game_media_cleanup(text,uuid,text)',
         'EXECUTE'
       ) AS can_begin_media_cleanup,
       has_function_privilege(
         current_user,
         'deuna_admin.complete_game_media_cleanup(text,uuid,text)',
         'EXECUTE'
       ) AS can_complete_media_cleanup`
  );
  const privilegeRow = privilege.rows[0];
  assert(
    privilegeRow?.can_delete_items === false,
    'El rol runtime no debe recibir DELETE directo sobre editorial_items.'
  );
  assert(
    privilegeRow?.can_delete_panel_game === true &&
      privilegeRow?.can_begin_media_cleanup === true &&
      privilegeRow?.can_complete_media_cleanup === true,
    'El rol runtime debe ejecutar sólo las funciones de mantenimiento vigentes.'
  );
  assert(
    privilegeRow?.revision_table === null &&
      privilegeRow?.publication_table === null &&
      privilegeRow?.global_compactor === null &&
      privilegeRow?.item_compactor === null &&
      privilegeRow?.publication_compactor === null,
    'El almacenamiento y las funciones de historial restaurable deben estar retirados por completo.'
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

  const queuedCleanup = await client.query<{
    game_slug: string;
    attempts: number;
  }>(
    `SELECT game_slug, attempts
       FROM deuna_admin.list_game_media_cleanup_queue($1, $2)
      WHERE game_slug = $3`,
    [ownerId, sessionToken, slug]
  );
  assert(
    queuedCleanup.rows.length === 1 &&
      queuedCleanup.rows[0]?.attempts === 0,
    "El hard-delete debe crear la limpieza multimedia pendiente dentro de la misma transacción."
  );

  const pendingSlug = await client.query<{
    pending: boolean;
  }>(
    `SELECT deuna_admin.is_game_media_cleanup_pending($1) AS pending`,
    [slug]
  );
  assert(
    pendingSlug.rows[0]?.pending === true,
    "El slug eliminado debe permanecer bloqueado mientras exista limpieza multimedia pendiente."
  );

  await client.query("SAVEPOINT pending_slug_reuse");
  let pendingSlugBlocked = false;
  try {
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
         '{}'::jsonb,
         'modified',
         '{}'::jsonb,
         $3,
         false,
         $4
       )`,
      [
        randomUUID(),
        slug,
        "0".repeat(64),
        ownerId,
      ]
    );
  } catch {
    pendingSlugBlocked = true;
    await client.query(
      "ROLLBACK TO SAVEPOINT pending_slug_reuse"
    );
  }
  assert(
    pendingSlugBlocked,
    "La base debe impedir recrear un juego mientras su namespace anterior siga pendiente de limpieza."
  );
  await client.query(
    "RELEASE SAVEPOINT pending_slug_reuse"
  );

  const cleanupStarted = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.begin_game_media_cleanup(
       $1, $2, $3
     ) AS result`,
    [slug, ownerId, sessionToken]
  );
  assert(
    outcome(cleanupStarted.rows[0]?.result).outcome ===
      "pending",
    "El Owner debe poder iniciar un reintento de limpieza multimedia pendiente."
  );

  const cleanupCompleted = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.complete_game_media_cleanup(
       $1, $2, $3
     ) AS result`,
    [slug, ownerId, sessionToken]
  );
  assert(
    outcome(cleanupCompleted.rows[0]?.result).outcome ===
      "completed",
    "El Owner debe poder cerrar la cola sólo después del reintento físico."
  );

  const cleanupCleared = await client.query<{
    pending: boolean;
  }>(
    `SELECT deuna_admin.is_game_media_cleanup_pending($1) AS pending`,
    [slug]
  );
  assert(
    cleanupCleared.rows[0]?.pending === false,
    "Completar la limpieza debe liberar el slug para reutilización futura."
  );

  const currentOnlyState = await client.query<{
    revision_table: string | null;
    publication_table: string | null;
    restorable_functions: number;
  }>(
    `SELECT
       to_regclass('deuna_admin.editorial_revisions')::text AS revision_table,
       to_regclass('deuna_admin.editorial_publications')::text AS publication_table,
       (
         SELECT count(*)::int
           FROM pg_proc AS procedure
           INNER JOIN pg_namespace AS namespace
             ON namespace.oid = procedure.pronamespace
          WHERE namespace.nspname = 'deuna_admin'
            AND procedure.proname IN (
              'compact_editorial_history',
              'compact_editorial_item_history',
              'compact_editorial_publication_history',
              'reject_game_editorial_history'
            )
       ) AS restorable_functions`
  );
  const currentOnlyRow = currentOnlyState.rows[0];
  assert(
    currentOnlyRow?.revision_table === null &&
      currentOnlyRow?.publication_table === null &&
      currentOnlyRow?.restorable_functions === 0,
    'PostgreSQL no debe conservar tablas, compactadores ni guardas del antiguo historial restaurable.'
  );

  const currentSnapshots = await client.query<{
    total: number;
    invalid_revisions: number;
    invalid_publications: number;
  }>(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE revision < 1)::int AS invalid_revisions,
       count(*) FILTER (WHERE publication_number < 1)::int AS invalid_publications
       FROM deuna_admin.editorial_items`
  );
  assert(
    (currentSnapshots.rows[0]?.total ?? 0) > 0 &&
      currentSnapshots.rows[0]?.invalid_revisions === 0 &&
      currentSnapshots.rows[0]?.invalid_publications === 0,
    'El estado editorial vigente debe conservar sus contadores de concurrencia sin depender de snapshots anteriores.'
  );

  await client.query("ROLLBACK");

  console.log(
    "Higiene editorial PostgreSQL: OK (mínimo privilegio, borrado coordinado, cola multimedia durable y modelo editorial current-only sin tablas ni funciones de rollback)."
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
