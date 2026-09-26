import {
  spawnSync,
} from "node:child_process";
import {
  randomUUID,
} from "node:crypto";

import { Pool } from "pg";

import {
  sourceHomeConfig,
} from "../src/data/home-config.ts";
import {
  hashEditorialPayload,
} from "../src/lib/admin/content-hash.ts";
import {
  getAdminDatabaseConfig,
} from "../src/lib/admin/database-config.ts";
import {
  createAdminSessionToken,
  hashAdminSessionToken,
} from "../src/lib/admin/session-token.ts";

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

function asRecord(value: unknown) {
  assert(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value),
    "La función de retiro no devolvió un objeto JSON."
  );
  return value as Record<string, unknown>;
}

function removeSlug(
  payload: unknown,
  slug: string
) {
  assert(
    payload !== null &&
      typeof payload === "object" &&
      !Array.isArray(payload),
    "Inicio no contiene un payload válido."
  );
  const next = structuredClone(
    payload as Record<string, unknown>
  );

  for (const key of [
    "heroSlugs",
    "popularSlugs",
    "lowSpecSlugs",
    "recommendedSlugs",
  ] as const) {
    const value = next[key];
    if (Array.isArray(value)) {
      next[key] = value.filter(
        (entry) => entry !== slug
      );
    }
  }

  return next;
}

function runNode(
  args: string[],
  label: string
) {
  const result = spawnSync(
    process.execPath,
    args,
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    }
  );

  assert(
    result.status === 0,
    `${label} falló.\n${result.stdout}\n${result.stderr}`
  );
}

if (
  process.env.CI !== "true" ||
  process.env.GITHUB_ACTIONS !== "true"
) {
  console.log(
    "Retiro de juegos fuente PostgreSQL: omitido fuera de GitHub Actions."
  );
  process.exit(0);
}

const pool = new Pool(
  getAdminDatabaseConfig("runtime")
);
const client = await pool.connect();

let retiredSlug = "";

try {
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

  retiredSlug = sourceHomeConfig.heroSlugs[0] ?? "";
  assert(
    retiredSlug.length > 0,
    "La fuente de Inicio no ofrece un juego para probar el retiro."
  );

  const game = await client.query<{
    revision: number;
    publication_number: number;
    source_present: boolean;
  }>(
    `SELECT revision, publication_number, source_present
       FROM deuna_admin.editorial_items
      WHERE item_type = 'game'
        AND item_key = $1
      LIMIT 1`,
    [retiredSlug]
  );
  const gameRow = game.rows[0];
  assert(
    gameRow?.source_present === true,
    "El fixture elegido no es un juego fuente importado."
  );

  const home = await client.query<{
    id: string;
    draft_payload: unknown;
    published_payload: unknown;
  }>(
    `SELECT id, draft_payload, published_payload
       FROM deuna_admin.editorial_items
      WHERE item_type = 'home_config'
        AND item_key = 'home'
      LIMIT 1`
  );
  const homeRow = home.rows[0];
  assert(homeRow, "Falta Inicio en la base aislada.");

  const nextDraft = removeSlug(
    homeRow.draft_payload,
    retiredSlug
  );
  const nextPublished = removeSlug(
    homeRow.published_payload,
    retiredSlug
  );

  await client.query(
    `UPDATE deuna_admin.editorial_items
        SET draft_payload = $2::jsonb,
            draft_status = 'modified',
            revision = revision + 1,
            published_payload = $3::jsonb,
            published_checksum = $4,
            published_from_revision = revision + 1,
            publication_number = publication_number + 1,
            published_at = now(),
            updated_at = now()
      WHERE id = $1`,
    [
      homeRow.id,
      JSON.stringify(nextDraft),
      JSON.stringify(nextPublished),
      hashEditorialPayload(nextPublished),
    ]
  );

  const hidden = await client.query<{
    revision: number;
    publication_number: number;
  }>(
    `UPDATE deuna_admin.editorial_items
        SET public_visible = false
      WHERE item_type = 'game'
        AND item_key = $1
      RETURNING revision, publication_number`,
    [retiredSlug]
  );
  const hiddenGame = hidden.rows[0];
  assert(hiddenGame, "No se pudo ocultar el juego fuente de CI.");

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

  const deleted = await client.query<{
    result: unknown;
  }>(
    `SELECT deuna_admin.delete_panel_game(
       $1, $2, $3, $4, $5
     ) AS result`,
    [
      retiredSlug,
      ownerId,
      sessionToken,
      hiddenGame.revision,
      hiddenGame.publication_number,
    ]
  );
  const deleteResult = asRecord(
    deleted.rows[0]?.result
  );
  assert(
    deleteResult.outcome === "deleted" &&
      deleteResult.sourceRetired === true,
    "El juego fuente no se eliminó con retiro persistente."
  );

  const retired = await client.query<{
    game_slug: string;
  }>(
    `SELECT game_slug
       FROM deuna_admin.list_source_game_retirements()
      WHERE game_slug = $1`,
    [retiredSlug]
  );
  assert(
    retired.rows[0]?.game_slug === retiredSlug,
    "La base no conservó la marca de retiro del juego fuente."
  );

  await client.query(
    `SELECT deuna_admin.begin_game_media_cleanup($1, $2, $3)`,
    [retiredSlug, ownerId, sessionToken]
  );
  await client.query(
    `SELECT deuna_admin.complete_game_media_cleanup($1, $2, $3)`,
    [retiredSlug, ownerId, sessionToken]
  );
} finally {
  client.release();
  await pool.end();
}

runNode(
  ["./tools/admin/import-content.ts"],
  "Reimportación editorial"
);
runNode(
  ["./tools/admin/preflight.ts", "--purpose=migration"],
  "Preflight posterior al retiro"
);

const verifyPool = new Pool(
  getAdminDatabaseConfig("runtime")
);

try {
  const verification = await verifyPool.query<{
    games: number;
    updates: number;
    home_refs: number;
    retirements: number;
  }>(
    `SELECT
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_items
          WHERE item_type = 'game'
            AND item_key = $1
       ) AS games,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_items
          WHERE item_type = 'game_update'
            AND (
              source_payload ->> 'gameSlug' = $1
              OR draft_payload ->> 'gameSlug' = $1
              OR published_payload ->> 'gameSlug' = $1
            )
       ) AS updates,
       (
         SELECT count(*)::int
           FROM deuna_admin.editorial_items AS home
          WHERE home.item_type = 'home_config'
            AND home.item_key = 'home'
            AND (
              COALESCE(home.source_payload -> 'heroSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.source_payload -> 'popularSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.source_payload -> 'lowSpecSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.source_payload -> 'recommendedSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.draft_payload -> 'heroSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.draft_payload -> 'popularSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.draft_payload -> 'lowSpecSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.draft_payload -> 'recommendedSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.published_payload -> 'heroSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.published_payload -> 'popularSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.published_payload -> 'lowSpecSlugs', '[]'::jsonb) ? $1
              OR COALESCE(home.published_payload -> 'recommendedSlugs', '[]'::jsonb) ? $1
            )
       ) AS home_refs,
       (
         SELECT count(*)::int
           FROM deuna_admin.list_source_game_retirements()
          WHERE game_slug = $1
       ) AS retirements`,
    [retiredSlug]
  );
  const row = verification.rows[0];

  assert(
    row?.games === 0 &&
      row.updates === 0 &&
      row.home_refs === 0 &&
      row.retirements === 1,
    "El importador recreó el juego retirado o alguna de sus referencias."
  );
} finally {
  await verifyPool.end();
}

console.log(
  `Retiro de juegos fuente PostgreSQL: OK (slug=${retiredSlug}; hard-delete, reimportación, Inicio y preflight respetan el retiro persistente).`
);
