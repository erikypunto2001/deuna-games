import {
  createHash,
} from "node:crypto";
import {
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Pool } from "pg";

import {
  assertSafePostgresRole,
  getAdminDatabaseConfig,
  getAdminRuntimeDatabaseRole,
} from "../../src/lib/admin/database-config.ts";

const migrationsDirectory = path.join(
  process.cwd(),
  "database",
  "migrations"
);
const migrationLockKey = 1_926_042_786;

function checksum(content: string) {
  return createHash("sha256")
    .update(content, "utf8")
    .digest("hex");
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function ensureMigrationRegistry(
  pool: Pool
) {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS deuna_admin;
    REVOKE ALL ON SCHEMA deuna_admin FROM PUBLIC;

    CREATE TABLE IF NOT EXISTS deuna_admin.schema_migrations (
      name text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT schema_migrations_checksum_check CHECK (
        checksum ~ '^[0-9a-f]{64}$'
      )
    );
  `);
}

async function grantRuntimePrivileges(
  pool: Pool
) {
  const runtimeRole = assertSafePostgresRole(
    getAdminRuntimeDatabaseRole()
  );
  const role = quoteIdentifier(runtimeRole);

  await pool.query(`
    REVOKE ALL ON SCHEMA deuna_admin FROM PUBLIC;
    REVOKE ALL ON SCHEMA deuna_accounts FROM PUBLIC;
    REVOKE ALL ON SCHEMA deuna_admin FROM ${role};
    REVOKE ALL ON SCHEMA deuna_accounts FROM ${role};
    REVOKE ALL ON ALL TABLES IN SCHEMA deuna_admin FROM ${role};
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA deuna_admin FROM ${role};
    REVOKE ALL ON ALL TABLES IN SCHEMA deuna_accounts FROM ${role};
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA deuna_accounts FROM ${role};
    GRANT USAGE ON SCHEMA deuna_admin, deuna_accounts TO ${role};

    GRANT SELECT (
        id,
        username,
        username_key,
        role,
        password_hash,
        display_name,
        active,
        failed_login_count,
        locked_until,
        last_login_at,
        password_changed_at,
        created_at,
        updated_at,
        created_by_user_id
      )
      ON deuna_admin.admin_users
      TO ${role};

    GRANT INSERT (
        id,
        username,
        username_key,
        role,
        password_hash,
        display_name,
        active,
        created_by_user_id
      )
      ON deuna_admin.admin_users
      TO ${role};

    GRANT UPDATE (
        password_hash,
        active,
        failed_login_count,
        locked_until,
        last_login_at,
        password_changed_at,
        updated_at
      )
      ON deuna_admin.admin_users
      TO ${role};

    GRANT SELECT (
        id,
        user_id,
        token_hash,
        expires_at,
        revoked_at
      )
      ON deuna_admin.admin_sessions
      TO ${role};

    GRANT INSERT (
        id,
        user_id,
        token_hash,
        expires_at
      )
      ON deuna_admin.admin_sessions
      TO ${role};

    GRANT UPDATE (revoked_at)
      ON deuna_admin.admin_sessions
      TO ${role};

    GRANT SELECT (
        id,
        user_id,
        event_type,
        occurred_at
      )
      ON deuna_admin.admin_events
      TO ${role};

    GRANT INSERT (user_id, event_type)
      ON deuna_admin.admin_events
      TO ${role};

    GRANT SELECT (
        id,
        item_type,
        item_key,
        source_payload,
        source_checksum,
        source_present,
        draft_payload,
        draft_status,
        revision,
        published_payload,
        published_checksum,
        published_from_revision,
        publication_number,
        published_at,
        published_by,
        public_visible,
        source_imported_at,
        updated_at,
        updated_by
      )
      ON deuna_admin.editorial_items
      TO ${role};

    GRANT INSERT (
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
      ON deuna_admin.editorial_items
      TO ${role};

    GRANT UPDATE (
        draft_payload,
        draft_status,
        revision,
        published_payload,
        published_checksum,
        published_from_revision,
        publication_number,
        published_at,
        published_by,
        public_visible,
        updated_at,
        updated_by
      )
      ON deuna_admin.editorial_items
      TO ${role};

    GRANT INSERT (
        user_id,
        action,
        entity_type,
        entity_id,
        details
      )
      ON deuna_admin.admin_audit_log
      TO ${role};

    GRANT SELECT (
        game_slug,
        score,
        confidence,
        evidence_count,
        breakdown,
        calculated_by,
        calculated_at
      )
      ON deuna_admin.game_insight_scores
      TO ${role};

    GRANT INSERT (
        game_slug,
        score,
        confidence,
        evidence_count,
        breakdown,
        calculated_by,
        calculated_at
      )
      ON deuna_admin.game_insight_scores
      TO ${role};

    GRANT UPDATE (
        score,
        confidence,
        evidence_count,
        breakdown,
        calculated_by,
        calculated_at
      )
      ON deuna_admin.game_insight_scores
      TO ${role};

    GRANT SELECT (
        id,
        username,
        username_key,
        password_hash,
        display_name,
        email_encrypted,
        bio,
        active,
        failed_login_count,
        locked_until,
        last_login_at,
        password_changed_at,
        created_at,
        updated_at
      )
      ON deuna_accounts.users
      TO ${role};

    GRANT INSERT (
        id,
        username,
        username_key,
        password_hash,
        display_name,
        email_encrypted,
        bio
      )
      ON deuna_accounts.users
      TO ${role};

    GRANT UPDATE (
        password_hash,
        display_name,
        email_encrypted,
        bio,
        failed_login_count,
        locked_until,
        last_login_at,
        password_changed_at,
        updated_at
      )
      ON deuna_accounts.users
      TO ${role};

    GRANT DELETE
      ON deuna_accounts.users
      TO ${role};

    GRANT SELECT (
        user_id,
        digest,
        image_webp,
        width,
        height,
        updated_at
      )
      ON deuna_accounts.avatars
      TO ${role};

    GRANT INSERT (
        user_id,
        digest,
        image_webp,
        width,
        height,
        updated_at
      )
      ON deuna_accounts.avatars
      TO ${role};

    GRANT UPDATE (
        digest,
        image_webp,
        width,
        height,
        updated_at
      )
      ON deuna_accounts.avatars
      TO ${role};

    GRANT DELETE
      ON deuna_accounts.avatars
      TO ${role};

    GRANT SELECT (
        id,
        user_id,
        token_hash,
        expires_at,
        revoked_at
      )
      ON deuna_accounts.sessions
      TO ${role};

    GRANT INSERT (
        id,
        user_id,
        token_hash,
        expires_at
      )
      ON deuna_accounts.sessions
      TO ${role};

    GRANT UPDATE (revoked_at)
      ON deuna_accounts.sessions
      TO ${role};

    GRANT SELECT (
        id,
        user_id,
        code_hash,
        created_at,
        used_at
      )
      ON deuna_accounts.recovery_codes
      TO ${role};

    GRANT INSERT (
        id,
        user_id,
        code_hash
      )
      ON deuna_accounts.recovery_codes
      TO ${role};

    GRANT UPDATE (used_at)
      ON deuna_accounts.recovery_codes
      TO ${role};

    GRANT DELETE
      ON deuna_accounts.recovery_codes
      TO ${role};

    GRANT SELECT (
        user_id,
        game_slug,
        favorite,
        library_state,
        follow_updates,
        followed_at,
        updates_seen_through,
        updated_at
      )
      ON deuna_accounts.game_preferences
      TO ${role};

    GRANT INSERT (
        user_id,
        game_slug,
        favorite,
        library_state,
        follow_updates,
        followed_at,
        updates_seen_through,
        updated_at
      )
      ON deuna_accounts.game_preferences
      TO ${role};

    GRANT UPDATE (
        favorite,
        library_state,
        follow_updates,
        followed_at,
        updates_seen_through,
        updated_at
      )
      ON deuna_accounts.game_preferences
      TO ${role};

    GRANT DELETE
      ON deuna_accounts.game_preferences
      TO ${role};

    GRANT SELECT (
        user_id,
        game_slug,
        rating,
        updated_at
      )
      ON deuna_accounts.game_ratings
      TO ${role};

    GRANT INSERT (
        user_id,
        game_slug,
        rating,
        updated_at
      )
      ON deuna_accounts.game_ratings
      TO ${role};

    GRANT UPDATE (
        rating,
        updated_at
      )
      ON deuna_accounts.game_ratings
      TO ${role};

    GRANT SELECT (
        user_id,
        cpu_id,
        gpu_id,
        ram_gb,
        memory_mode,
        updated_at
      )
      ON deuna_accounts.hardware_profiles
      TO ${role};

    GRANT INSERT (
        user_id,
        cpu_id,
        gpu_id,
        ram_gb,
        memory_mode,
        updated_at
      )
      ON deuna_accounts.hardware_profiles
      TO ${role};

    GRANT UPDATE (
        cpu_id,
        gpu_id,
        ram_gb,
        memory_mode,
        updated_at
      )
      ON deuna_accounts.hardware_profiles
      TO ${role};

    GRANT DELETE
      ON deuna_accounts.hardware_profiles
      TO ${role};

    GRANT SELECT (
        user_id,
        xp_total,
        credits_balance,
        streak_days,
        best_streak,
        last_claim_at,
        created_at,
        updated_at
      )
      ON deuna_accounts.reward_profiles
      TO ${role};

    GRANT INSERT (user_id)
      ON deuna_accounts.reward_profiles
      TO ${role};

    GRANT UPDATE (
        xp_total,
        credits_balance,
        streak_days,
        best_streak,
        last_claim_at,
        updated_at
      )
      ON deuna_accounts.reward_profiles
      TO ${role};

    GRANT SELECT (
        id,
        user_id,
        event_type,
        event_key,
        xp_delta,
        credits_delta,
        created_at
      )
      ON deuna_accounts.reward_events
      TO ${role};

    GRANT INSERT (
        id,
        user_id,
        event_type,
        event_key,
        xp_delta,
        credits_delta,
        created_at
      )
      ON deuna_accounts.reward_events
      TO ${role};

    GRANT USAGE, SELECT
      ON SEQUENCE deuna_admin.admin_events_id_seq,
                  deuna_admin.admin_audit_log_id_seq
      TO ${role};

    GRANT EXECUTE
      ON FUNCTION deuna_admin.delete_panel_game(
        text, uuid, text, integer, integer
      )
      TO ${role};


    GRANT EXECUTE
      ON FUNCTION deuna_admin.list_source_game_retirements()
      TO ${role};

    GRANT EXECUTE
      ON FUNCTION deuna_admin.is_game_media_cleanup_pending(text)
      TO ${role};

    GRANT EXECUTE
      ON FUNCTION deuna_admin.list_game_media_cleanup_queue(uuid, text)
      TO ${role};

    GRANT EXECUTE
      ON FUNCTION deuna_admin.begin_game_media_cleanup(text, uuid, text)
      TO ${role};

    GRANT EXECUTE
      ON FUNCTION deuna_admin.complete_game_media_cleanup(text, uuid, text)
      TO ${role};

    GRANT EXECUTE
      ON FUNCTION deuna_admin.inspect_site_runtime_junk(uuid, text)
      TO ${role};

    GRANT EXECUTE
      ON FUNCTION deuna_admin.purge_site_runtime_junk(
        uuid, text, integer, integer, integer, integer,
        integer, integer, integer
      )
      TO ${role};

    REVOKE ALL
      ON deuna_admin.schema_migrations
      FROM ${role};
  `);
}

async function main() {
  const pool = new Pool(
    getAdminDatabaseConfig("migration")
  );

  try {
    await ensureMigrationRegistry(pool);
    await pool.query(
      "SELECT pg_advisory_lock($1)",
      [migrationLockKey]
    );

    const names = (
      await readdir(migrationsDirectory)
    )
      .filter((name) =>
        /^\d{3}_[a-z0-9_]+\.sql$/.test(name)
      )
      .sort();

    if (names.length === 0) {
      throw new Error(
        "No se encontraron migraciones administrativas."
      );
    }

    for (const name of names) {
      const sql = await readFile(
        path.join(migrationsDirectory, name),
        "utf8"
      );
      const digest = checksum(sql);
      const applied = await pool.query<{
        checksum: string;
      }>(
        `SELECT checksum
         FROM deuna_admin.schema_migrations
         WHERE name = $1`,
        [name]
      );

      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== digest) {
          throw new Error(
            `La migración aplicada ${name} fue modificada. Crea una migración nueva.`
          );
        }

        console.log(`Sin cambios: ${name}`);
        continue;
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO deuna_admin.schema_migrations
             (name, checksum)
           VALUES ($1, $2)`,
          [name, digest]
        );
        await client.query("COMMIT");
        console.log(`Aplicada: ${name}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }

    await grantRuntimePrivileges(pool);
    console.log(
      "Migraciones administrativas completas y permisos mínimos actualizados."
    );
  } finally {
    await pool
      .query("SELECT pg_advisory_unlock($1)", [
        migrationLockKey,
      ])
      .catch(() => {});
    await pool.end();
  }
}

main().catch(() => {
  console.error(
    "No se pudieron aplicar las migraciones administrativas. Revisa la conexión privada y los permisos del rol migrador."
  );
  process.exitCode = 1;
});
