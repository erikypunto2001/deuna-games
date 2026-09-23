import { type NextRequest } from "next/server";
import { z } from "zod";

import {
  adminRedirect,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import { expectedRevisionSchema } from "@/lib/admin/content-forms";
import { getEditorialItem } from "@/lib/admin/content-service";
import {
  listGameImageReferences,
  listGameVideoReferences,
} from "@/lib/admin/game-media-integrity";
import { getPublishedGameImageReferences } from "@/lib/admin/publication-service";
import { getPublishedGameVideoReferences } from "@/lib/admin/published-game-video-references";
import { hasExactAdminFormFields } from "@/lib/admin/request-security";
import {
  deleteEditorialMediaResource,
  findEditorialMediaResource,
  listAssignedBundledImageResources,
  listEditorialMediaLibrary,
  markEditorialMediaForDeletion,
  mergeEditorialMediaResources,
} from "@/lib/media/editorial-media-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const deleteTargetSchema = z.enum(["image-delete", "video-delete"]);
const fields = ["expectedRevision", "target", "resource"] as const;

function redirectPath(slug: string, state: string) {
  return `/admin/juegos/${encodeURIComponent(slug)}?estado=${encodeURIComponent(state)}&seccion=multimedia`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const authorized = await authorizeAdminFormRequest(request);
  if (!authorized.authorized) return authorized.response;

  const { slug } = await context.params;
  if (!hasExactAdminFormFields(authorized.form, fields)) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "solicitud")
    );
  }

  const revision = expectedRevisionSchema.safeParse(
    authorized.form.get("expectedRevision")
  );
  const target = deleteTargetSchema.safeParse(
    authorized.form.get("target")
  );
  const resourceValue = authorized.form.get("resource");
  const resource = typeof resourceValue === "string" ? resourceValue : "";

  if (!revision.success || !target.success || !resource) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "solicitud")
    );
  }

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
      redirectPath(slug, "conflicto")
    );
  }

  const imageReferences = listGameImageReferences(item.payload);
  const videoReferences = listGameVideoReferences(item.payload);
  const draftReferences = new Set([...imageReferences, ...videoReferences]);

  if (draftReferences.has(resource)) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "recurso-en-uso")
    );
  }

  const [
    editorial,
    bundled,
    publishedImages,
    publishedVideos,
  ] = await Promise.all([
    listEditorialMediaLibrary(slug),
    listAssignedBundledImageResources(imageReferences),
    getPublishedGameImageReferences(slug),
    getPublishedGameVideoReferences(slug),
  ]);
  const resources = mergeEditorialMediaResources(editorial, bundled);
  const expectedKind = target.data === "image-delete" ? "image" : "video";
  const selected = findEditorialMediaResource(resources, resource, expectedKind);

  if (!selected) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "recurso-invalido")
    );
  }

  if (selected.kind === "image" && selected.origin === "bundled") {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "recurso-eliminado-base")
    );
  }

  const publishedReferences = new Set([
    ...publishedImages,
    ...publishedVideos,
  ]);

  try {
    const deletion = await markEditorialMediaForDeletion(slug, selected);
    if (deletion === "missing") {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-eliminado")
      );
    }

    if (publishedReferences.has(selected.src)) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-eliminacion-pendiente")
      );
    }

    await deleteEditorialMediaResource(slug, selected);
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "recurso-eliminado")
    );
  } catch {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "recurso-eliminacion-incompleta")
    );
  }
}
