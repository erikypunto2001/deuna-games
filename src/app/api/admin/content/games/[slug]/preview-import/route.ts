import type { NextRequest } from "next/server";

import { adminRedirect, authorizeAdminFormRequest } from "@/lib/admin/admin-route";
import { expectedRevisionSchema } from "@/lib/admin/content-forms";
import { getEditorialItem } from "@/lib/admin/content-service";
import { hasExactAdminFormFields } from "@/lib/admin/request-security";
import { storeEditorialPreviewVideoFromPath } from "@/lib/media/editorial-video";
import {
  prepareStagedEditorialPreviewForTrim,
  removeStagedEditorialPreviewSource,
  resolveStagedEditorialPreviewSource,
} from "@/lib/media/editorial-video-staging";
import {
  parsePreviewFps,
  parsePreviewQuality,
  parsePreviewTrimWindow,
} from "@/lib/media/preview-video-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fields = [
  "expectedRevision",
  "sourceToken",
  "startSeconds",
  "endSeconds",
  "quality",
  "fps",
  "target",
] as const;

function errorState(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("FFmpeg no está disponible") ||
    message.includes("FFprobe no está disponible")
  ) {
    return "ffmpeg";
  }
  if (
    message.includes("supera el límite seguro") ||
    message.includes("demasiado pesado")
  ) {
    return "video-pesado";
  }
  if (message.includes("recorte")) return "preview-recorte-invalido";
  return "video-invalido";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const authorized = await authorizeAdminFormRequest(request);
  if (!authorized.authorized) return authorized.response;

  const { slug } = await context.params;
  const redirectTarget = `/admin/juegos/${encodeURIComponent(slug)}`;

  if (!hasExactAdminFormFields(authorized.form, fields)) {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=solicitud&seccion=multimedia`
    );
  }

  const revision = expectedRevisionSchema.safeParse(
    authorized.form.get("expectedRevision")
  );
  const sourceToken =
    authorized.form.get("sourceToken")?.trim() ?? "";
  const trim = parsePreviewTrimWindow(
    authorized.form.get("startSeconds"),
    authorized.form.get("endSeconds")
  );
  const quality = parsePreviewQuality(
    authorized.form.get("quality")
  );
  const fps = parsePreviewFps(
    authorized.form.get("fps")
  );
  const target = authorized.form.get("target");

  if (!trim) {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=preview-recorte-invalido&seccion=multimedia`
    );
  }
  if (target !== "library") {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=preview-destino-invalido&seccion=multimedia`
    );
  }
  if (!quality) {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=preview-calidad-invalida&seccion=multimedia`
    );
  }
  if (!fps) {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=preview-fps-invalido&seccion=multimedia`
    );
  }
  if (
    !revision.success ||
    !/^[a-f0-9]{48}$/.test(sourceToken)
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=preview-source-expirada&seccion=multimedia`
    );
  }

  try {
    const item = await getEditorialItem("game", slug);
    if (!item) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }
    if (item.revision !== revision.data) {
      return adminRedirect(
        authorized.adminOrigin,
        `${redirectTarget}?estado=conflicto&seccion=multimedia`
      );
    }

    const source = await resolveStagedEditorialPreviewSource(
      slug,
      authorized.session.userId,
      sourceToken
    );
    if (!source) {
      return adminRedirect(
        authorized.adminOrigin,
        `${redirectTarget}?estado=preview-source-expirada&seccion=multimedia`
      );
    }

    const prepared =
      await prepareStagedEditorialPreviewForTrim(source, trim);

    try {
      await storeEditorialPreviewVideoFromPath(
        slug,
        prepared.filePath,
        prepared.trim,
        quality,
        "hero",
        fps
      );
      await removeStagedEditorialPreviewSource(sourceToken);

      return adminRedirect(
        authorized.adminOrigin,
        `${redirectTarget}?estado=recurso-subido&seccion=multimedia`
      );
    } finally {
      await prepared.cleanup();
    }
  } catch (error) {
    console.error(
      "No se pudo preparar el video remoto:",
      error instanceof Error
        ? error.message
        : "error no identificado"
    );

    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=${errorState(error)}&seccion=multimedia`
    );
  }
}
