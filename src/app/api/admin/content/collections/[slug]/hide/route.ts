import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import { expectedRevisionSchema } from "@/lib/admin/content-forms";
import { hasExactAdminFormFields } from "@/lib/admin/request-security";
import { hideGameCollectionPublication } from "@/lib/admin/visibility-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const authorized = await authorizeAdminFormRequest(request);
  if (!authorized.authorized) return authorized.response;

  const { slug } = await context.params;
  const target = "/admin/colecciones/" + encodeURIComponent(slug);

  if (!hasExactAdminFormFields(
    authorized.form,
    ["expectedPublicationNumber"]
  )) {
    return adminRedirect(
      authorized.adminOrigin,
      target + "?estado=solicitud"
    );
  }

  const expected = expectedRevisionSchema.safeParse(
    authorized.form.get("expectedPublicationNumber")
  );
  if (!expected.success) {
    return adminRedirect(
      authorized.adminOrigin,
      target + "?estado=datos"
    );
  }

  try {
    const result = await hideGameCollectionPublication(
      slug,
      expected.data,
      authorized.session.userId
    );

    if (result.outcome === "not_found") {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/colecciones?estado=no-encontrado"
      );
    }

    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        target + "?estado=conflicto-publicacion"
      );
    }

    if (result.outcome === "hidden") {
      revalidatePath("/colecciones");
      revalidatePath("/colecciones/" + slug);
      
    }

    return adminRedirect(
      authorized.adminOrigin,
      target + "?estado=" +
        (result.outcome === "hidden" ? "oculto" : "sin-cambios")
    );
  } catch {
    console.error("No se pudo ocultar la colección.");
    return adminUnavailableResponse();
  }
}
