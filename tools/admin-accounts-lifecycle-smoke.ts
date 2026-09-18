import { randomBytes } from "node:crypto";
import { Pool } from "pg";

import {
  createAdministrator,
  resetAdministratorPassword,
  setAdministratorActive,
} from "../src/lib/admin/account-service.ts";
import {
  authenticateAdmin,
  reauthenticateAdmin,
} from "../src/lib/admin/auth-service.ts";
import {
  adminQuery,
  getAdminPool,
} from "../src/lib/admin/database.ts";
import {
  getAdminDatabaseConfig,
} from "../src/lib/admin/database-config.ts";
import {
  resolveAdminSession,
} from "../src/lib/admin/session-store.ts";

const ownerUsername =
  process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const ownerPassword =
  process.env.DEUNA_VISUAL_ADMIN_PASSWORD;

if (!ownerUsername || !ownerPassword) {
  throw new Error(
    "El lifecycle de cuentas Admin requiere el Owner efímero del visual-smoke."
  );
}

type OwnerRow = {
  id: string;
};

type AuditRow = {
  action: string;
};

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

const suffix = randomBytes(7).toString("hex");
const username = `visual_admin_${suffix}`.slice(0, 40);
const initialPassword =
  `Initial-${randomBytes(18).toString("base64url")}-Aa9!`;
const nextPassword =
  `Reset-${randomBytes(18).toString("base64url")}-Bb8!`;
const migrationPool = new Pool(
  getAdminDatabaseConfig("migration")
);

try {
  const ownerResult = await adminQuery<OwnerRow>(
    `SELECT id::text
     FROM deuna_admin.admin_users
     WHERE username_key = lower($1)
       AND role = 'owner'
       AND active = true
     LIMIT 1`,
    [ownerUsername]
  );
  const ownerId = ownerResult.rows[0]?.id;

  assert(ownerId, "No se encontró el Owner visual activo.");
  assert(
    await reauthenticateAdmin(ownerId, ownerPassword),
    "La reautenticación real del Owner visual fue rechazada."
  );

  const creation = await createAdministrator(
    ownerId,
    {
      username,
      password: initialPassword,
      displayName: "Administrador lifecycle CI",
    }
  );
  assert(
    creation.created,
    "No se pudo crear el administrador efímero."
  );
  const adminId = creation.id;

  const initialLogin =
    await authenticateAdmin(username, initialPassword);
  assert(
    initialLogin.authenticated,
    "El administrador recién creado no pudo iniciar sesión."
  );
  assert(
    (await resolveAdminSession(initialLogin.token))?.userId === adminId,
    "La sesión creada no pertenece al administrador efímero."
  );

  assert(
    await resetAdministratorPassword(
      ownerId,
      adminId,
      nextPassword
    ),
    "No se pudo restablecer la contraseña del administrador."
  );
  assert(
    await resolveAdminSession(initialLogin.token) === null,
    "Restablecer contraseña debe revocar las sesiones anteriores."
  );
  assert(
    !(await authenticateAdmin(username, initialPassword)).authenticated,
    "La contraseña anterior siguió autenticando después del reset."
  );

  const resetLogin =
    await authenticateAdmin(username, nextPassword);
  assert(
    resetLogin.authenticated,
    "La contraseña restablecida no autenticó."
  );

  assert(
    await setAdministratorActive(ownerId, adminId, false),
    "No se pudo desactivar el administrador."
  );
  assert(
    await resolveAdminSession(resetLogin.token) === null,
    "Desactivar debe revocar inmediatamente la sesión activa."
  );
  assert(
    !(await authenticateAdmin(username, nextPassword)).authenticated,
    "Una cuenta administrativa desactivada pudo iniciar sesión."
  );

  assert(
    await setAdministratorActive(ownerId, adminId, true),
    "No se pudo reactivar el administrador."
  );
  const reactivatedLogin =
    await authenticateAdmin(username, nextPassword);
  assert(
    reactivatedLogin.authenticated,
    "La cuenta reactivada no pudo volver a iniciar sesión."
  );

  const audit = await migrationPool.query<AuditRow>(
    `SELECT action
     FROM deuna_admin.admin_audit_log
     WHERE user_id = $1
       AND entity_type = 'admin_account'
       AND entity_id = $2
     ORDER BY occurred_at ASC`,
    [ownerId, adminId]
  );
  const actions = audit.rows.map((row) => row.action);

  for (const required of [
    "admin_account.create",
    "admin_account.password_reset",
    "admin_account.deactivate",
    "admin_account.activate",
  ]) {
    assert(
      actions.includes(required),
      `Falta auditoría real para ${required}.`
    );
  }

  console.log(
    "Cuentas administrativas lifecycle: OK (crear, reautenticar Owner, login, reset con revocación, desactivar, rechazo, reactivar y auditoría PostgreSQL)."
  );
} finally {
  await Promise.all([
    getAdminPool().end(),
    migrationPool.end(),
  ]);
}
