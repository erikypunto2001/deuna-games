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
  expectedRevisionSchema,
} from "@/lib/admin/content-forms";
import {
  compactGamePublicationHistory,
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
  const target =
    `/admin/juegos/${encodeURIComponent(slug)}/publicacion`;

  if (
    !hasExactAdminFormFields(
      authorized.form,
      [
        "expectedPublications",
        "confirmSlug",
        "currentPassword",
      ]
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=solicitud`
    );
  }

  const expectedPublications =
    expectedRevisionSchema.safeParse(
      authorized.form.get("expectedPublications")
    );
  const currentPassword =
    adminCurrentPasswordSchema.safeParse(
      authorized.form.get("currentPassword")
    );

  if (
    !expectedPublications.success ||
    !currentPassword.success ||
    authorized.form.get("confirmSlug") !== slug
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=snapshots-confirmacion`
    );
  }

  try {
    if (!await reauthenticateAdmin(
      authorized.session.userId,
      currentPassword.data
    )) {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=reauth`
      );
    }

    const result =
      await compactGamePublicationHistory(
        slug,
        authorized.session.userId,
        expectedPublications.data
      );

    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=snapshots-conflicto`
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=snapshots-limpiados`
    );
  } catch {
    console.error(
      "No se pudo limpiar el historial de snapshots del juego."
    );
    return adminUnavailableResponse();
  }
}
