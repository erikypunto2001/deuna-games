import type { NextRequest } from "next/server";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  compactEditorialHistory,
} from "@/lib/admin/editorial-maintenance-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";

const CONFIRMATION = "REINICIAR HISTORIAL";

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
      ["confirmation"]
    ) ||
    authorized.form.get("confirmation") !==
      CONFIRMATION
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      "/admin/mantenimiento?estado=mantenimiento-confirmacion"
    );
  }

  try {
    await compactEditorialHistory(
      authorized.session.userId
    );

    return adminRedirect(
      authorized.adminOrigin,
      "/admin/mantenimiento?estado=historial-compactado"
    );
  } catch {
    console.error(
      "No se pudo compactar el historial editorial."
    );
    return adminUnavailableResponse();
  }
}
