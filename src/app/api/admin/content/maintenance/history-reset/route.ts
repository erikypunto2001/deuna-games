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
  compactEditorialHistory,
} from "@/lib/admin/editorial-maintenance-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";
import {
  adminCurrentPasswordSchema,
} from "@/lib/admin/validation";

const CONFIRMATION = "REINICIAR HISTORIAL";
const countSchema = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative());

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
        "expectedItems",
        "expectedRevisions",
        "expectedPublications",
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
  const expectedItems = countSchema.safeParse(
    authorized.form.get("expectedItems")
  );
  const expectedRevisions = countSchema.safeParse(
    authorized.form.get("expectedRevisions")
  );
  const expectedPublications = countSchema.safeParse(
    authorized.form.get("expectedPublications")
  );

  if (
    authorized.form.get("confirmation") !== CONFIRMATION ||
    !currentPassword.success ||
    !expectedItems.success ||
    !expectedRevisions.success ||
    !expectedPublications.success
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      "/admin/mantenimiento?estado=mantenimiento-confirmacion"
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

    const result = await compactEditorialHistory(
      authorized.session.userId,
      {
        items: expectedItems.data,
        revisions: expectedRevisions.data,
        publications: expectedPublications.data,
      }
    );

    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/mantenimiento?estado=mantenimiento-conflicto"
      );
    }

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
