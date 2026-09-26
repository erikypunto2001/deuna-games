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
  collectionEditFormSchema,
} from "@/lib/admin/managed-editorial-forms";
import {
  validateGameSlugs,
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

const fields = [
  "expectedRevision",
  "title",
  "description",
  "featured",
  "gameSlugsJson",
] as const;

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
    "/admin/colecciones/" +
    encodeURIComponent(slug);

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
    collectionEditFormSchema.safeParse(
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
          id: slug,
          slug,
          title: data.title,
          description:
            data.description,
          gameSlugs:
            data.gameSlugsJson,
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
      await saveManagedEditorialDraft(
        "game_collection",
        slug,
        data.expectedRevision,
        payload,
        authorized.session
          .userId
      );

    if (
      result.outcome ===
      "not_found"
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/colecciones?estado=no-encontrado"
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      target +
        "?estado=" +
        (
          result.outcome ===
          "conflict"
            ? "conflicto"
            : "guardado"
        )
    );
  } catch {
    console.error(
      "No se pudo guardar la colección."
    );
    return adminUnavailableResponse();
  }
}
