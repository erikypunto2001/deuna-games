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
  softwareCreateFormSchema,
} from "@/lib/admin/managed-editorial-forms";
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
  "name",
  "shortDescription",
  "description",
  "kind",
  "version",
  "developer",
  "website",
  "imageAlt",
  "featured",
  "runsOnJson",
  "emulatesJson",
  "packagesJson",
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
    "/admin/programas/nuevo";

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
    softwareCreateFormSchema.safeParse(
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
        "software",
        {
          id: data.slug,
          slug: data.slug,
          name: data.name,
          ...(data.shortDescription
            ? {
                shortDescription:
                  data.shortDescription,
              }
            : {}),
          description:
            data.description,
          kind: data.kind,
          ...(data.version
            ? {
                version:
                  data.version,
              }
            : {}),
          ...(data.developer
            ? {
                developer:
                  data.developer,
              }
            : {}),
          ...(data.website
            ? {
                website:
                  data.website,
              }
            : {}),
          runsOnPlatformIds:
            data.runsOnJson,
          emulatesPlatformIds:
            data.emulatesJson,
          packages:
            data.packagesJson,
          imageAlt:
            data.imageAlt,
          featured:
            data.featured,
        }
      );

    const result =
      await createManagedEditorialDraft(
        "software",
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
      "/admin/programas/" +
        encodeURIComponent(
          result.key
        ) +
        "?estado=creado"
    );
  } catch {
    console.error(
      "No se pudo crear el programa."
    );
    return adminUnavailableResponse();
  }
}
