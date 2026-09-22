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
  compactHomeEditorialHistory,
} from "@/lib/admin/editorial-maintenance-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";
import {
  adminCurrentPasswordSchema,
} from "@/lib/admin/validation";

const CONFIRMATION = "REINICIAR INICIO";
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
  const expectedRevisions = countSchema.safeParse(
    authorized.form.get("expectedRevisions")
  );
  const expectedPublications = countSchema.safeParse(
    authorized.form.get("expectedPublications")
  );

  if (
    authorized.form.get("confirmation") !== CONFIRMATION ||
    !currentPassword.success ||
    !expectedRevisions.success ||
    !expectedPublications.success
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      "/admin/mantenimiento?estado=inicio-mantenimiento-confirmacion"
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

    const result = await compactHomeEditorialHistory(
      authorized.session.userId,
      {
        revisions: expectedRevisions.data,
        publications: expectedPublications.data,
      }
    );

    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/mantenimiento?estado=inicio-mantenimiento-conflicto"
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      "/admin/mantenimiento?estado=inicio-historial-compactado"
    );
  } catch {
    console.error(
      "No se pudo compactar el historial de Inicio."
    );
    return adminUnavailableResponse();
  }
}
