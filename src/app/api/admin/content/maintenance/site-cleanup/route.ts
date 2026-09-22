import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  reauthenticateAdmin,
} from "@/lib/admin/auth-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";
import {
  purgeSiteMaintenance,
} from "@/lib/admin/site-maintenance-service";
import {
  adminCurrentPasswordSchema,
} from "@/lib/admin/validation";

const CONFIRMATION = "LIMPIAR BASURA SEGURA";
const fingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest
) {
  const authorized =
    await authorizeAdminFormRequest(request);

  if (!authorized.authorized) {
    return authorized.response;
  }

  if (authorized.session.role !== "owner") {
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  if (
    !hasExactAdminFormFields(
      authorized.form,
      [
        "confirmation",
        "currentPassword",
        "snapshotFingerprint",
      ]
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      "/admin/mantenimiento?estado=solicitud"
    );
  }

  const currentPassword =
    adminCurrentPasswordSchema.safeParse(
      authorized.form.get("currentPassword")
    );
  const snapshotFingerprint =
    fingerprintSchema.safeParse(
      authorized.form.get("snapshotFingerprint")
    );

  if (
    authorized.form.get("confirmation") !==
      CONFIRMATION ||
    !currentPassword.success ||
    !snapshotFingerprint.success
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      "/admin/mantenimiento?estado=limpieza-general-confirmacion"
    );
  }

  try {
    if (!await reauthenticateAdmin(
      authorized.session.userId,
      currentPassword.data
    )) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/mantenimiento?estado=reauth"
      );
    }

    const result = await purgeSiteMaintenance(
      authorized.session.userId,
      snapshotFingerprint.data
    );

    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/mantenimiento?estado=limpieza-general-conflicto"
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      result.outcome === "partial"
        ? "/admin/mantenimiento?estado=limpieza-general-parcial"
        : "/admin/mantenimiento?estado=limpieza-general-completa"
    );
  } catch {
    console.error(
      "No se pudo completar la limpieza general segura."
    );
    return adminUnavailableResponse();
  }
}
