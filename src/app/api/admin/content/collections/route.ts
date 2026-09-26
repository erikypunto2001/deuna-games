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
  collectionCreateFormSchema,
} from "@/lib/admin/managed-editorial-forms";
import {
  validateGameSlugs,
} from "@/lib/admin/managed-editorial-relations";
import {
  createManagedEditorialDraft,
} from "@/lib/admin/managed-editorial-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";

export const dynamic =
  "force-dynamic";
export const runtime =
  "nodejs";

const fields = [
  "slug",
  "title",
  "description",
  "imageAlt",
  "featured",
  "gameSlugsJson",
] as const;

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
    "/admin/colecciones/nueva";

  if (
    !hasExactAdminFormFields(
      authorized.form,
      fields
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      target +
        "?estado=solicitud"
    );
  }

  const parsed =
    collectionCreateFormSchema.safeParse(
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
    const data =
      parsed.data;
    const payload =
      parseEditorialPayload(
        "game_collection",
        {
          id: data.slug,
          slug: data.slug,
          title: data.title,
          description:
            data.description,
          gameSlugs:
            data.gameSlugsJson,
          imageAlt:
            data.imageAlt,
          featured:
            data.featured,
        }
      );

    const relations =
      await validateGameSlugs(
        payload.gameSlugs
      );

    if (!relations.ok) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "?estado=juego"
      );
    }

    const result =
      await createManagedEditorialDraft(
        "game_collection",
        data.slug,
        payload,
        authorized.session
          .userId
      );

    if (
      result.outcome ===
      "exists"
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "?estado=duplicado"
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      "/admin/colecciones/" +
        encodeURIComponent(
          result.key
        ) +
        "?estado=creada"
    );
  } catch {
    console.error(
      "No se pudo crear la colección."
    );
    return adminUnavailableResponse();
  }
}
