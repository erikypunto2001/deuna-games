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
  softwareEditFormSchema,
} from "@/lib/admin/managed-editorial-forms";
import {
  validateSoftwareRelations,
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
  "name",
  "shortDescription",
  "description",
  "kind",
  "version",
  "developer",
  "website",
  "featured",
  "runsOnJson",
  "emulatesJson",
  "packagesJson",
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
    "/admin/programas/" +
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
    softwareEditFormSchema.safeParse(
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
          id: slug,
          slug,
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
          featured:
            data.featured,
        }
      );

    const relations =
      await validateSoftwareRelations(
        payload
      );

    if (!relations.ok) {
      return adminRedirect(
        authorized.adminOrigin,
        target +
          "?estado=plataforma"
      );
    }

    const result =
      await saveManagedEditorialDraft(
        "software",
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
        "/admin/programas?estado=no-encontrado"
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
      "No se pudo guardar el programa."
    );
    return adminUnavailableResponse();
  }
}
