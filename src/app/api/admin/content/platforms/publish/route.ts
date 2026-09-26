import {
  revalidatePath,
} from "next/cache";
import type {
  NextRequest,
} from "next/server";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  expectedRevisionSchema,
} from "@/lib/admin/content-forms";
import {
  publishPlatformCatalogDraft,
} from "@/lib/admin/publication-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";

export const dynamic =
  "force-dynamic";
export const runtime =
  "nodejs";

export async function POST(
  request: NextRequest
) {
  const authorized =
    await authorizeAdminFormRequest(
      request
    );

  if (!authorized.authorized) {
    return authorized.response;
  }

  const target =
    "/admin/plataformas";

  if (
    !hasExactAdminFormFields(
      authorized.form,
      [
        "expectedRevision",
      ]
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      target +
        "?estado=solicitud"
    );
  }

  const expected =
    expectedRevisionSchema.safeParse(
      authorized.form.get(
        "expectedRevision"
      )
    );

  if (!expected.success) {
    return adminRedirect(
      authorized.adminOrigin,
      target +
        "?estado=datos"
    );
  }

  try {
    const result =
      await publishPlatformCatalogDraft(
        expected.data,
        authorized.session
          .userId
      );

    if (
      result.outcome ===
      "invalid_relations"
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "?estado=plataforma-publicada-en-uso"
      );
    }

    if (
      result.outcome ===
      "conflict"
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "?estado=conflicto"
      );
    }

    if (
      result.outcome ===
      "not_found"
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "?estado=no-encontrado"
      );
    }

    if (
      result.outcome ===
      "published"
    ) {
      revalidatePath(
        "/colecciones",
        "layout"
      );
      revalidatePath(
        "/juegos",
        "layout"
      );
      revalidatePath(
        "/programas",
        "layout"
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      target +
        "?estado=" +
        (
          result.outcome ===
          "published"
            ? "publicado"
            : "sin-cambios"
        )
    );
  } catch {
    console.error(
      "No se pudo publicar el catálogo de plataformas."
    );
    return adminUnavailableResponse();
  }
}
