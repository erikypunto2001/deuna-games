import type { NextRequest } from "next/server";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  expectedRevisionSchema,
} from "@/lib/admin/content-forms";
import {
  deletePanelGame,
} from "@/lib/admin/editorial-maintenance-service";
import {
  revalidatePublicGameSurfaces,
} from "@/lib/admin/game-public-revalidation";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";

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
        "expectedRevision",
        "deletePublicationNumber",
        "confirmSlug",
      ]
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=solicitud`
    );
  }

  const expectedRevision =
    expectedRevisionSchema.safeParse(
      authorized.form.get("expectedRevision")
    );
  const expectedPublication =
    expectedRevisionSchema.safeParse(
      authorized.form.get(
        "deletePublicationNumber"
      )
    );
  const confirmation =
    authorized.form.get("confirmSlug");

  if (
    !expectedRevision.success ||
    !expectedPublication.success ||
    confirmation !== slug
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=eliminacion-confirmacion`
    );
  }

  try {
    const result = await deletePanelGame(
      slug,
      expectedRevision.data,
      expectedPublication.data,
      authorized.session.userId
    );

    if (result.outcome === "not_found") {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }

    if (result.outcome === "source_managed") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=eliminacion-fuente`
      );
    }

    if (result.outcome === "home_reference") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=eliminacion-home`
      );
    }

    if (result.outcome === "home_history_reference") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=eliminacion-home-historial`
      );
    }

    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=conflicto-publicacion`
      );
    }

    revalidatePublicGameSurfaces(slug);

    return adminRedirect(
      authorized.adminOrigin,
      result.mediaCleanupPending
        ? "/admin/juegos?estado=eliminado-media-pendiente"
        : "/admin/juegos?estado=eliminado"
    );
  } catch {
    console.error(
      "No se pudo eliminar definitivamente el juego."
    );
    return adminUnavailableResponse();
  }
}
