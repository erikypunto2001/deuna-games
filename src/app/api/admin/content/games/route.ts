import type { NextRequest } from "next/server";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  editorialGameCreateFormSchema,
} from "@/lib/admin/content-create-forms";
import {
  createGameDraft,
} from "@/lib/admin/content-create-service";
import {
  resolveGameTaxonomySelection,
} from "@/lib/admin/game-taxonomy-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fields = [
  "slug",
  "title",
  "description",
  "category",
  "version",
  "badge",
  "imageAlt",
] as const;

export async function POST(
  request: NextRequest
) {
  const authorized =
    await authorizeAdminFormRequest(request);

  if (!authorized.authorized) {
    return authorized.response;
  }

  const createPage = "/admin/juegos/nuevo";

  if (
    !hasExactAdminFormFields(
      authorized.form,
      fields
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${createPage}?estado=solicitud`
    );
  }

  const parsed =
    editorialGameCreateFormSchema.safeParse(
      Object.fromEntries(authorized.form)
    );

  if (!parsed.success) {
    return adminRedirect(
      authorized.adminOrigin,
      `${createPage}?estado=datos`
    );
  }

  try {
    const classification =
      await resolveGameTaxonomySelection({
        category: parsed.data.category,
      });

    if (!classification.valid || !classification.category) {
      return adminRedirect(
        authorized.adminOrigin,
        `${createPage}?estado=clasificacion`
      );
    }

    const result = await createGameDraft(
      authorized.session.userId,
      {
        ...parsed.data,
        category: classification.category,
      }
    );

    if (result.outcome === "exists") {
      return adminRedirect(
        authorized.adminOrigin,
        `${createPage}?estado=duplicado`
      );
    }

    if (result.outcome === "cleanup_pending") {
      return adminRedirect(
        authorized.adminOrigin,
        `${createPage}?estado=limpieza-media-pendiente`
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      `/admin/juegos/${encodeURIComponent(result.key)}?seccion=datos&estado=creado`
    );
  } catch {
    console.error(
      "No se pudo crear el borrador del juego."
    );
    return adminUnavailableResponse();
  }
}
