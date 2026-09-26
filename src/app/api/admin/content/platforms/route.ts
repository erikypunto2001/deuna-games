import type {
  NextRequest,
} from "next/server";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  parseEditorialPayload,
} from "@/lib/admin/content-validation";
import {
  platformCatalogFormSchema,
} from "@/lib/admin/managed-editorial-forms";
import {
  validatePlatformCatalogRemoval,
  validatePlatformCollectionNamespace,
} from "@/lib/admin/managed-editorial-relations";
import {
  saveManagedEditorialDraft,
} from "@/lib/admin/managed-editorial-service";
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
        "catalogJson",
      ]
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      target +
        "?estado=solicitud"
    );
  }

  const parsed =
    platformCatalogFormSchema.safeParse(
      Object.fromEntries(
        authorized.form
      )
    );

  if (!parsed.success) {
    return adminRedirect(
      authorized.adminOrigin,
      target +
        "?estado=datos"
    );
  }

  try {
    const payload =
      parseEditorialPayload(
        "platform_catalog",
        parsed.data
          .catalogJson
      );

    const [
      namespace,
      relations,
    ] = await Promise.all([
      validatePlatformCollectionNamespace(
        payload
      ),
      validatePlatformCatalogRemoval(
        payload
      ),
    ]);

    if (!namespace.ok) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "?estado=coleccion-en-conflicto"
      );
    }

    if (!relations.ok) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "?estado=plataforma-en-uso"
      );
    }

    const result =
      await saveManagedEditorialDraft(
        "platform_catalog",
        "platforms",
        parsed.data
          .expectedRevision,
        payload,
        authorized.session
          .userId
      );

    return adminRedirect(
      authorized.adminOrigin,
      target +
        "?estado=" +
        (
          result.outcome ===
          "conflict"
            ? "conflicto"
            : result.outcome ===
                "not_found"
              ? "no-encontrado"
              : "guardado"
        )
    );
  } catch {
    console.error(
      "No se pudo guardar el catálogo de plataformas."
    );
    return adminUnavailableResponse();
  }
}
