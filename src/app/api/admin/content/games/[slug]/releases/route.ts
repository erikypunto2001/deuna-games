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
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  saveGameReleasesSection,
} from "@/lib/admin/game-editor-sections-service";
import {
  validateGameReleaseRelations,
} from "@/lib/admin/managed-editorial-relations";
import {
  gameReleasesFormSchema,
} from "@/lib/admin/managed-editorial-forms";
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
    "/admin/juegos/" +
    encodeURIComponent(slug) +
    "?seccion=descargas";

  if (
    !hasExactAdminFormFields(
      authorized.form,
      [
        "expectedRevision",
        "releasesJson",
      ]
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      target +
        "&estado=solicitud"
    );
  }

  const parsed =
    gameReleasesFormSchema.safeParse(
      Object.fromEntries(
        authorized.form
      )
    );

  if (!parsed.success) {
    return adminRedirect(
      authorized.adminOrigin,
      target +
        "&estado=datos"
    );
  }

  try {
    const item =
      await getEditorialItem(
        "game",
        slug
      );

    if (!item) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }

    const candidate =
      parseEditorialPayload(
        "game",
        {
          ...item.payload,
          releases:
            parsed.data
              .releasesJson,
        }
      );
    const releases =
      candidate.releases ?? [];

    const relations =
      await validateGameReleaseRelations(
        releases
      );

    if (!relations.ok) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "&estado=relacion"
      );
    }

    const result =
      await saveGameReleasesSection(
        slug,
        parsed.data
          .expectedRevision,
        authorized.session
          .userId,
        releases
      );

    if (
      result.outcome ===
      "not_found"
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      target +
        "&estado=" +
        (
          result.outcome ===
          "conflict"
            ? "conflicto"
            : "guardado"
        )
    );
  } catch {
    console.error(
      "No se pudieron guardar los releases del juego."
    );
    return adminUnavailableResponse();
  }
}
