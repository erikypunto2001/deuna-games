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
  revalidatePublicGameSurfaces,
} from "@/lib/admin/game-public-revalidation";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";
import {
  hideGamePublication,
} from "@/lib/admin/visibility-service";

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

  const { slug } = await context.params;
  const target =
    `/admin/juegos/${encodeURIComponent(slug)}/publicacion`;

  if (
    !hasExactAdminFormFields(
      authorized.form,
      ["expectedPublicationNumber"]
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=solicitud`
    );
  }

  const expected = expectedRevisionSchema.safeParse(
    authorized.form.get(
      "expectedPublicationNumber"
    )
  );

  if (!expected.success) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=datos`
    );
  }

  try {
    const result = await hideGamePublication(
      slug,
      expected.data,
      authorized.session.userId
    );

    if (result.outcome === "not_found") {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }

    if (result.outcome === "in_use") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=relacion-publica-en-uso`
      );
    }

    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=conflicto-publicacion`
      );
    }

    if (result.outcome === "hidden") {
      revalidatePublicGameSurfaces(slug);
    }

    const state =
      result.outcome === "hidden"
        ? "oculto"
        : "sin-cambios";

    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=${state}`
    );
  } catch {
    console.error(
      "No se pudo ocultar la publicación del juego."
    );
    return adminUnavailableResponse();
  }
}
