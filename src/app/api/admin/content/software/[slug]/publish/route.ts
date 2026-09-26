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
  publishSoftwareDraft,
} from "@/lib/admin/publication-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";

export const dynamic =
  "force-dynamic";
export const runtime =
  "nodejs";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const authorized =
    await authorizeAdminFormRequest(
      request
    );

  if (!authorized.authorized) {
    return authorized.response;
  }

  const { slug } =
    await context.params;
  const target =
    "/admin/programas/" +
    encodeURIComponent(slug);

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
      await publishSoftwareDraft(
        slug,
        expected.data,
        authorized.session
          .userId
      );

    if (
      result.outcome ===
      "not_found"
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/programas?estado=no-encontrado"
      );
    }

    if (
      result.outcome ===
      "invalid_relations"
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "?estado=relacion-publica"
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
      "published"
    ) {
      revalidatePath(
        "/programas"
      );
      revalidatePath(
        "/programas/" +
          slug
      );
      revalidatePath(
        "/juegos",
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
      "No se pudo publicar el programa."
    );
    return adminUnavailableResponse();
  }
}
