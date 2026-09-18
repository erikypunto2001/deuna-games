import process from "node:process";

import { Pool } from "pg";

import {
  getAdminDatabaseConfig,
} from "../../src/lib/admin/database-config.ts";

const APPLY_FLAG = "--apply";
const apply = process.argv.includes(APPLY_FLAG);

type CountRow = {
  admin_sessions: number;
  account_sessions: number;
  used_recovery_codes: number;
};

async function main() {
  const pool = new Pool(getAdminDatabaseConfig("migration"));

  try {
    const counts = await pool.query<CountRow>(
      `SELECT
         (SELECT count(*)::integer
            FROM deuna_admin.admin_sessions
           WHERE revoked_at IS NOT NULL OR expires_at <= now()) AS admin_sessions,
         (SELECT count(*)::integer
            FROM deuna_accounts.sessions
           WHERE revoked_at IS NOT NULL OR expires_at <= now()) AS account_sessions,
         (SELECT count(*)::integer
            FROM deuna_accounts.recovery_codes
           WHERE used_at IS NOT NULL) AS used_recovery_codes`
    );

    const row = counts.rows[0] ?? {
      admin_sessions: 0,
      account_sessions: 0,
      used_recovery_codes: 0,
    };

    console.log(
      `Basura transitoria detectada: admin_sessions=${row.admin_sessions}, account_sessions=${row.account_sessions}, recovery_codes_usados=${row.used_recovery_codes}.`
    );

    if (!apply) {
      console.log(
        "Modo lectura. Usa --apply para eliminar únicamente estas filas transitorias."
      );
      return;
    }

    await pool.query("BEGIN");
    try {
      const adminSessions = await pool.query(
        `DELETE FROM deuna_admin.admin_sessions
          WHERE revoked_at IS NOT NULL OR expires_at <= now()`
      );
      const accountSessions = await pool.query(
        `DELETE FROM deuna_accounts.sessions
          WHERE revoked_at IS NOT NULL OR expires_at <= now()`
      );
      const recoveryCodes = await pool.query(
        `DELETE FROM deuna_accounts.recovery_codes
          WHERE used_at IS NOT NULL`
      );

      await pool.query("COMMIT");

      console.log(
        `Purga transitoria: OK (admin_sessions=${adminSessions.rowCount ?? 0}, account_sessions=${accountSessions.rowCount ?? 0}, recovery_codes_usados=${recoveryCodes.rowCount ?? 0}).`
      );
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "No se pudo completar la purga transitoria."
  );
  process.exitCode = 1;
});
