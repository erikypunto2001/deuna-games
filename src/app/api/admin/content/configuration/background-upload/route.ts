import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  adminRedirect,
} from "@/lib/admin/admin-route";
import {
  expectedRevisionSchema,
} from "@/lib/admin/content-forms";
import {
  getEditorialItem,
  saveSiteConfigDraft,
} from "@/lib/admin/content-service";
import {
  authorizeAdminMediaRequest,
} from "@/lib/admin/media-admin-route";
import {
  hasExactAdminMediaFormFields,
} from "@/lib/admin/media-request-security";
import {
  storeEditorialWebp,
} from "@/lib/media/editorial-upload";
import {
  SITE_BACKGROUND_MEDIA_SLUG,
} from "@/lib/site/backgrounds";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fields = [
  "expectedRevision",
  "name",
  "image",
] as const;

const nameSchema = z.string().trim().min(1).max(80);

function readSingleString(
  form: FormData,
  field: string
) {
  const value = form.get(field);
  return typeof value === "string"
    ? value
    : null;
}

function readSingleFile(
  form: FormData,
  field: string
) {
  const value = form.get(field);

  return value instanceof File
    ? value
    : null;
}

function redirectPath(state: string) {
  return `/admin/configuracion?seccion=apariencia&panel=backgrounds&estado=${state}`;
}

export async function POST(request: NextRequest) {
  const authorized =
    await authorizeAdminMediaRequest(request);

  if (!authorized.authorized) {
    return authorized.response;
  }

  if (
    !hasExactAdminMediaFormFields(
      authorized.form,
      fields
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath("solicitud")
    );
  }

  const revision = expectedRevisionSchema.safeParse(
    readSingleString(
      authorized.form,
      "expectedRevision"
    )
  );
  const name = nameSchema.safeParse(
    readSingleString(authorized.form, "name")
  );
  const image = readSingleFile(
    authorized.form,
    "image"
  );

  if (
    !revision.success ||
    !name.success ||
    !image ||
    image.size <= 0
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath("imagen-invalida")
    );
  }

  try {
    const item = await getEditorialItem(
      "site_config",
      "site"
    );

    if (!item) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath("no-encontrado")
      );
    }

    if (item.revision !== revision.data) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath("conflicto")
      );
    }

    const upload = await storeEditorialWebp(
      SITE_BACKGROUND_MEDIA_SLUG,
      image
    );
    const id = `custom-${upload.digest.slice(0, 24)}`;
    const existing = item.payload.backgroundLibrary ?? [];
    const alreadyStored = existing.some(
      (asset) => asset.id === id
    );

    if (!alreadyStored && existing.length >= 40) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath("datos")
      );
    }

    const backgroundLibrary = [
      ...existing.filter((asset) => asset.id !== id),
      {
        id,
        name: name.data,
        image: upload.publicPath,
      },
    ];
    const sitePayload = { ...item.payload };
    delete sitePayload.heroImageEffect;
    delete sitePayload.heroImageTuning;

    const result = await saveSiteConfigDraft(
      revision.data,
      authorized.session.userId,
      {
        ...sitePayload,
        backgroundLibrary,
      }
    );

    if (result.outcome === "not_found") {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath("no-encontrado")
      );
    }

    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath("conflicto")
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      redirectPath("imagen-subida")
    );
  } catch (error) {
    console.error(
      "No se pudo subir el fondo editorial:",
      error instanceof Error
        ? error.message
        : "error no identificado"
    );

    return adminRedirect(
      authorized.adminOrigin,
      redirectPath("imagen-invalida")
    );
  }
}
