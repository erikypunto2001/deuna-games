import type { NextRequest } from "next/server";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  reauthenticateAdmin,
} from "@/lib/admin/auth-service";
import {
  retryPendingGameMediaCleanup,
} from "@/lib/admin/editorial-maintenance-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";
import {
  adminCurrentPasswordSchema,
} from "@/lib/admin/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ slug: string }>;
  }
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

  const { slug } = await context.params;

  if (
    !hasExactAdminFormFields(
      authorized.form,
      ["confirmSlug", "currentPassword"]
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

  if (
    !currentPassword.success ||
    authorized.form.get("confirmSlug") !== slug
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      "/admin/mantenimiento?estado=limpieza-media-confirmacion"
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

    const result =
      await retryPendingGameMediaCleanup(
        slug,
        authorized.session.userId
      );

    return adminRedirect(
      authorized.adminOrigin,
      result.outcome === "completed" ||
        result.outcome === "not_found"
        ? "/admin/mantenimiento?estado=limpieza-media-completa"
        : "/admin/mantenimiento?estado=limpieza-media-pendiente"
    );
  } catch {
    console.error(
      "No se pudo reintentar la limpieza multimedia pendiente."
    );
    return adminUnavailableResponse();
  }
}
