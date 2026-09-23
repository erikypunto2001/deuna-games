import type { NextRequest } from "next/server";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  expectedRevisionSchema,
  revisionIdSchema,
} from "@/lib/admin/content-forms";
import {
  restoreEditorialRevision,
} from "@/lib/admin/content-service";
import type {
  EditorialItemType,
} from "@/lib/admin/content-validation";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function itemPath(
  type: EditorialItemType,
  key: string,
  state: string
) {
  if (type === "game_update") {
    return `/admin/actualizaciones/${encodeURIComponent(key)}?estado=${state}&seccion=historial`;
  }

  if (type === "home_config") {
    return `/admin/portada?seccion=historial&estado=${state}`;
  }

  if (type === "about_config") {
    return `/admin/paginas/quienes-somos?seccion=historial&estado=${state}`;
  }

  return `/admin/configuracion?seccion=historial&estado=${state}`;
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ revisionId: string }>;
  }
) {
  const authorized =
    await authorizeAdminFormRequest(request);

  if (!authorized.authorized) {
    return authorized.response;
  }

  const { revisionId } = await context.params;
  const parsedRevisionId =
    revisionIdSchema.safeParse(revisionId);

  if (
    !parsedRevisionId.success ||
    !hasExactAdminFormFields(
      authorized.form,
      ["expectedRevision"]
    )
  ) {
    return new Response("Solicitud rechazada.", {
      status: 400,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const expected = expectedRevisionSchema.safeParse(
    authorized.form.get("expectedRevision")
  );

  if (!expected.success) {
    return new Response("Solicitud rechazada.", {
      status: 400,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  try {
    const result = await restoreEditorialRevision(
      parsedRevisionId.data,
      expected.data,
      authorized.session.userId
    );

    if (
      result.outcome === "not_found" ||
      !result.type ||
      !result.key
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin?estado=no-encontrado"
      );
    }

    const state =
      result.outcome === "conflict"
        ? "conflicto"
        : "restaurado";

    return adminRedirect(
      authorized.adminOrigin,
      itemPath(result.type, result.key, state)
    );
  } catch {
    console.error(
      "No se pudo restaurar la revisión editorial."
    );
    return adminUnavailableResponse();
  }
}
