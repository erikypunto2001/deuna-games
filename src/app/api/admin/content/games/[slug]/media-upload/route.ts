import type { NextRequest } from "next/server";

import {
  adminRedirect,
} from "@/lib/admin/admin-route";
import {
  expectedRevisionSchema,
} from "@/lib/admin/content-forms";
import {
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  authorizeAdminMediaRequest,
} from "@/lib/admin/media-admin-route";
import {
  hasExactAdminMediaFormFields,
} from "@/lib/admin/media-request-security";
import {
  clearEditorialImageDeletionMarker,
} from "@/lib/media/editorial-media-library";
import {
  storeEditorialWebp,
} from "@/lib/media/editorial-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fields = [
  "expectedRevision",
  "kind",
  "image",
] as const;

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

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ slug: string }>;
  }
) {
  const authorized =
    await authorizeAdminMediaRequest(request);

  if (!authorized.authorized) {
    return authorized.response;
  }

  const { slug } = await context.params;
  const target =
    `/admin/juegos/${encodeURIComponent(slug)}`;

  if (
    !hasExactAdminMediaFormFields(
      authorized.form,
      fields
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=solicitud&seccion=multimedia`
    );
  }

  const revision = expectedRevisionSchema.safeParse(
    readSingleString(
      authorized.form,
      "expectedRevision"
    )
  );
  const kind = readSingleString(
    authorized.form,
    "kind"
  );
  const image = readSingleFile(
    authorized.form,
    "image"
  );

  if (kind !== "library") {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=solicitud&seccion=multimedia`
    );
  }

  if (
    !revision.success ||
    !image ||
    image.size <= 0
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=imagen-invalida&seccion=multimedia`
    );
  }

  try {
    const item = await getEditorialItem(
      "game",
      slug
    );

    if (!item) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }

    if (item.revision !== revision.data) {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=conflicto&seccion=multimedia`
      );
    }

    const upload = await storeEditorialWebp(
      slug,
      image
    );

    // Re-subir el mismo hash cancela una eliminación pendiente explícita.
    await clearEditorialImageDeletionMarker(
      slug,
      upload.publicPath
    );

    // La carga sólo crea un master. Asignar Portada/Hero/Card/Detalle/Galería
    // pertenece exclusivamente a media-library y sus editores de crop.
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=recurso-subido&seccion=multimedia`
    );
  } catch (error) {
    console.error(
      "No se pudo subir la imagen editorial del juego:",
      error instanceof Error
        ? error.message
        : "error no identificado"
    );

    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=imagen-invalida&seccion=multimedia`
    );
  }
}
