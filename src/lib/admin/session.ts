import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
  notFound,
  redirect,
} from "next/navigation";

import {
  isAdminEnabled,
} from "./database-config";
import type {
  AdminSession,
} from "./session-store";
import {
  resolveAdminSession,
  revokeAdminSession,
} from "./session-store";

export type {
  AdminSession,
} from "./session-store";
export {
  createAdminSession,
  resolveAdminSession,
  revokeAdminSession,
} from "./session-store";

export function getAdminSessionCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Host-deuna_admin_session"
    : "deuna_admin_session";
}

function adminSessionUsesSecureTransport() {
  if (process.env.NODE_ENV === "production") {
    return true;
  }

  const configured =
    process.env.DEUNA_ADMIN_ORIGIN?.trim();

  if (!configured) return false;

  try {
    return new URL(configured).protocol === "https:";
  } catch {
    return false;
  }
}

export function getAdminSessionCookieOptions(
  expires: Date
) {
  return {
    httpOnly: true,
    secure: adminSessionUsesSecureTransport(),
    sameSite: "strict" as const,
    path: "/",
    expires,
    priority: "high" as const,
  };
}

export function getExpiredAdminCookieOptions() {
  return {
    httpOnly: true,
    secure: adminSessionUsesSecureTransport(),
    sameSite: "strict" as const,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
    priority: "high" as const,
  };
}

export async function readAdminSessionToken() {
  const cookieStore = await cookies();

  return cookieStore.get(
    getAdminSessionCookieName()
  )?.value;
}

export const verifyAdminSession = cache(
  async (): Promise<AdminSession> => {
    if (!isAdminEnabled()) {
      notFound();
    }

    const session = await resolveAdminSession(
      await readAdminSessionToken()
    );

    if (!session) {
      redirect("/admin/login");
    }

    return session;
  }
);

export const verifyAdminOwnerSession = cache(
  async () => {
    const session = await verifyAdminSession();

    if (session.role !== "owner") {
      notFound();
    }

    return session;
  }
);

void revokeAdminSession;
