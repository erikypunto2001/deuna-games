import "server-only";

import type { PoolClient } from "pg";

import {
  withAdminTransaction,
} from "./database";
import {
  consumeDummyPasswordWork,
  verifyAdminPassword,
} from "./password";
import type { AdminRole } from "./roles";
import {
  createAdminSession,
} from "./session-store";
import {
  normalizeAdminUsername,
} from "./validation";

type AdminUserRow = {
  id: string;
  role: AdminRole;
  password_hash: string;
  failed_login_count: number;
  locked_until: Date | null;
};

export type AdminAuthenticationResult =
  | {
      authenticated: true;
      token: string;
      expiresAt: Date;
      role: AdminRole;
    }
  | {
      authenticated: false;
    };

export async function reauthenticateAdmin(
  userId: string,
  password: string
) {
  return withAdminTransaction(async (client) => {
    const result = await client.query<AdminUserRow>(
      `SELECT
         id,
         role,
         password_hash,
         failed_login_count,
         locked_until
       FROM deuna_admin.admin_users
       WHERE id = $1
         AND active = true
         AND role = 'owner'
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );
    const user = result.rows[0];

    if (!user) {
      await consumeDummyPasswordWork(password);
      return false;
    }

    const passwordMatches = await verifyAdminPassword(
      password,
      user.password_hash
    );
    const currentlyLocked = Boolean(
      user.locked_until && user.locked_until.getTime() > Date.now()
    );

    if (!passwordMatches || currentlyLocked) {
      if (!currentlyLocked) {
        await recordFailedLogin(client, user);
      }
      return false;
    }

    await client.query(
      `UPDATE deuna_admin.admin_users
       SET failed_login_count = 0,
           locked_until = NULL,
           updated_at = now()
       WHERE id = $1`,
      [user.id]
    );
    await client.query(
      `INSERT INTO deuna_admin.admin_events
         (user_id, event_type)
       VALUES ($1, 'critical_action_reauthenticated')`,
      [user.id]
    );

    return true;
  });
}

function lockDurationSeconds(
  failureCount: number
) {
  if (failureCount < 5) return 0;

  return Math.min(
    15 * 60,
    30 * 2 ** Math.min(failureCount - 5, 5)
  );
}

async function recordFailedLogin(
  client: PoolClient,
  user: AdminUserRow
) {
  const failures = Math.min(
    user.failed_login_count + 1,
    1000
  );
  const lockSeconds =
    lockDurationSeconds(failures);
  const lockedUntil = lockSeconds
    ? new Date(Date.now() + lockSeconds * 1000)
    : null;

  await client.query(
    `UPDATE deuna_admin.admin_users
     SET failed_login_count = $2,
         locked_until = $3,
         updated_at = now()
     WHERE id = $1`,
    [user.id, failures, lockedUntil]
  );
  await client.query(
    `INSERT INTO deuna_admin.admin_events
       (user_id, event_type)
     VALUES ($1, 'login_failed')`,
    [user.id]
  );
}

export async function authenticateAdmin(
  username: string,
  password: string
): Promise<AdminAuthenticationResult> {
  const usernameKey =
    normalizeAdminUsername(username);

  return withAdminTransaction(
    async (client) => {
      const locked = await client.query<AdminUserRow>(
        `SELECT
           id,
           role,
           password_hash,
           failed_login_count,
           locked_until
         FROM deuna_admin.admin_users
         WHERE username_key = $1
           AND active = true
           AND role IN ('owner', 'admin')
         LIMIT 1
         FOR UPDATE`,
        [usernameKey]
      );
      const user = locked.rows[0];

      if (!user) {
        await consumeDummyPasswordWork(password);
        return { authenticated: false };
      }

      const passwordMatches =
        await verifyAdminPassword(
          password,
          user.password_hash
        );
      const currentlyLocked = Boolean(
        user.locked_until &&
          user.locked_until.getTime() > Date.now()
      );

      if (!passwordMatches || currentlyLocked) {
        if (!currentlyLocked) {
          await recordFailedLogin(client, user);
        } else {
          await client.query(
            `INSERT INTO deuna_admin.admin_events
               (user_id, event_type)
             VALUES ($1, 'login_blocked')`,
            [user.id]
          );
        }

        return { authenticated: false };
      }

      await client.query(
        `UPDATE deuna_admin.admin_users
         SET failed_login_count = 0,
             locked_until = NULL,
             last_login_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [user.id]
      );
      await client.query(
        `UPDATE deuna_admin.admin_sessions
         SET revoked_at = COALESCE(revoked_at, now())
         WHERE user_id = $1
           AND expires_at <= now()`,
        [user.id]
      );

      const session = await createAdminSession(
        client,
        user.id
      );

      await client.query(
        `INSERT INTO deuna_admin.admin_events
           (user_id, event_type)
         VALUES ($1, 'login_succeeded')`,
        [user.id]
      );

      return {
        authenticated: true,
        token: session.token,
        expiresAt: session.expiresAt,
        role: user.role,
      };
    }
  );
}
