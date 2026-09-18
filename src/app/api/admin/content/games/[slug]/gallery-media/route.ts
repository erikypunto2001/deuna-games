import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  adminRedirect,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import { expectedRevisionSchema } from "@/lib/admin/content-forms";
import {
  getEditorialItem,
  saveGameMediaDraft,
} from "@/lib/admin/content-service";
import { listGameImageReferences } from "@/lib/admin/game-media-integrity";
import { hasExactAdminFormFields } from "@/lib/admin/request-security";
import { verifyAdminSession } from "@/lib/admin/session";
import {
  findEditorialMediaResource,
  listAssignedBundledImageResources,
  listEditorialMediaLibrary,
  mergeEditorialMediaResources,
} from "@/lib/media/editorial-media-library";
import {
  DEFAULT_GAME_GALLERY_VIDEO_VIEWPORT,
  MAX_GAME_GALLERY_ITEMS,
  galleryImageSources,
  moveGalleryItem,
  resolveGameGalleryItems,
  withGalleryItem,
  withGalleryVideoViewport,
  withoutGalleryItem,
} from "@/lib/media/game-gallery-media";
import { evaluateGameMediaRequirements } from "@/lib/media/game-media-requirements";
import { DEFAULT_GAME_IMAGE_VIEWPORT } from "@/lib/media/image-viewport";
import { parsePreviewViewport } from "@/lib/media/preview-video-policy";
import type {
  Game,
  GameGalleryItem,
  GameImageMedia,
  GameVideoViewport,
} from "@/types/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const operationSchema = z.enum([
  "gallery-add",
  "gallery-remove",
  "gallery-move",
  "gallery-video-layout",
]);
const kindSchema = z.enum(["image", "video"]);
const directionSchema = z.enum(["up", "down"]);
const basicFields = [
  "expectedRevision",
  "target",
  "kind",
  "resource",
] as const;
const moveFields = [...basicFields, "direction"] as const;
const layoutFields = [
  ...basicFields,
  "viewportX",
  "viewportY",
  "viewportZoom",
  "viewportAspect",
] as const;

function redirectPath(slug: string, state: string) {
  return `/admin/juegos/${encodeURIComponent(slug)}?estado=${encodeURIComponent(state)}&seccion=multimedia`;
}

function syncedScreenshots(items: readonly GameGalleryItem[]) {
  return galleryImageSources(items);
}

function galleryUpdate(
  current: Game,
  items: GameGalleryItem[],
  imageMedia = current.imageMedia
) {
  return {
    galleryMedia: items,
    screenshots: syncedScreenshots(items),
    ...(imageMedia ? { imageMedia } : {}),
  } satisfies Parameters<typeof saveGameMediaDraft>[3];
}

function sameGalleryOrder(
  left: readonly GameGalleryItem[],
  right: readonly GameGalleryItem[]
) {
  return left.length === right.length && left.every(
    (item, index) =>
      item.kind === right[index]?.kind && item.src === right[index]?.src
  );
}

async function libraryResources(slug: string, game: Game) {
  const imageReferences = listGameImageReferences(game);
  const [editorial, bundled] = await Promise.all([
    listEditorialMediaLibrary(slug),
    listAssignedBundledImageResources(imageReferences),
  ]);
  return mergeEditorialMediaResources(editorial, bundled);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  await verifyAdminSession();
  const { slug } = await context.params;
  const item = await getEditorialItem("game", slug);

  if (!item) {
    return NextResponse.json(
      { error: "Juego no encontrado." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const gallery = resolveGameGalleryItems(item.payload);
  return NextResponse.json(
    {
      revision: item.revision,
      gallery,
      imageMedia: item.payload.imageMedia ?? null,
      requirements: evaluateGameMediaRequirements(item.payload),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const authorized = await authorizeAdminFormRequest(request);
  if (!authorized.authorized) return authorized.response;

  const { slug } = await context.params;
  const operation = operationSchema.safeParse(authorized.form.get("target"));
  const kind = kindSchema.safeParse(authorized.form.get("kind"));
  const revision = expectedRevisionSchema.safeParse(
    authorized.form.get("expectedRevision")
  );
  const resourceValue = authorized.form.get("resource");
  const resource = typeof resourceValue === "string" ? resourceValue : "";

  if (!operation.success || !kind.success || !revision.success || !resource) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "solicitud")
    );
  }

  const validFields = operation.data === "gallery-move"
    ? hasExactAdminFormFields(authorized.form, moveFields)
    : operation.data === "gallery-video-layout"
      ? hasExactAdminFormFields(authorized.form, layoutFields)
      : hasExactAdminFormFields(authorized.form, basicFields);
  if (!validFields) {
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

  const current = item.payload;
  const currentGallery = resolveGameGalleryItems(current);
  let update: Parameters<typeof saveGameMediaDraft>[3] | null = null;

  if (operation.data === "gallery-add") {
    const resources = await libraryResources(slug, current);
    const libraryResource = findEditorialMediaResource(
      resources,
      resource,
      kind.data
    );
    if (!libraryResource) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }

    if (currentGallery.length >= MAX_GAME_GALLERY_ITEMS) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "galeria-llena")
      );
    }

    const galleryItem: GameGalleryItem = kind.data === "image"
      ? { kind: "image", src: resource }
      : {
          kind: "video",
          src: resource,
          viewport: { ...DEFAULT_GAME_GALLERY_VIDEO_VIEWPORT },
        };
    const nextGallery = withGalleryItem(current, galleryItem);

    if (nextGallery.length === currentGallery.length) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "galeria-actualizada")
      );
    }

    if (kind.data === "image") {
      const imageMedia: GameImageMedia = {
        ...current.imageMedia,
        gallery: {
          ...current.imageMedia?.gallery,
          [resource]: current.imageMedia?.gallery?.[resource]
            ?? { ...DEFAULT_GAME_IMAGE_VIEWPORT },
        },
      };
      update = galleryUpdate(current, nextGallery, imageMedia);
    } else {
      update = galleryUpdate(current, nextGallery);
    }
  }

  if (operation.data === "gallery-remove") {
    if (!currentGallery.some(
      (candidate) => candidate.kind === kind.data && candidate.src === resource
    )) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }

    const nextGallery = withoutGalleryItem(current, kind.data, resource);
    if (kind.data === "image") {
      const galleryImageMedia = { ...current.imageMedia?.gallery };
      delete galleryImageMedia[resource];
      const imageMedia: GameImageMedia = {
        ...current.imageMedia,
        ...(Object.keys(galleryImageMedia).length
          ? { gallery: galleryImageMedia }
          : { gallery: undefined }),
      };
      update = galleryUpdate(current, nextGallery, imageMedia);
    } else {
      update = galleryUpdate(current, nextGallery);
    }
  }

  if (operation.data === "gallery-move") {
    const direction = directionSchema.safeParse(authorized.form.get("direction"));
    if (!direction.success) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "solicitud")
      );
    }
    if (!currentGallery.some(
      (candidate) => candidate.kind === kind.data && candidate.src === resource
    )) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }

    const nextGallery = moveGalleryItem(
      current,
      kind.data,
      resource,
      direction.data
    );
    if (sameGalleryOrder(currentGallery, nextGallery)) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "galeria-actualizada")
      );
    }
    update = galleryUpdate(current, nextGallery);
  }

  if (operation.data === "gallery-video-layout") {
    if (kind.data !== "video") {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "preview-destino-invalido")
      );
    }
    const viewport = parsePreviewViewport(
      authorized.form.get("viewportX"),
      authorized.form.get("viewportY"),
      authorized.form.get("viewportZoom"),
      authorized.form.get("viewportAspect")
    );
    if (!viewport || viewport.aspect === "free") {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "preview-encuadre-invalido")
      );
    }
    if (!currentGallery.some(
      (candidate) => candidate.kind === "video" && candidate.src === resource
    )) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }

    const confirmedViewport: GameVideoViewport = {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
      aspect: viewport.aspect,
      confirmed: true,
    };
    update = galleryUpdate(
      current,
      withGalleryVideoViewport(current, resource, confirmedViewport)
    );
  }

  if (!update) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "solicitud")
    );
  }

  const result = await saveGameMediaDraft(
    slug,
    revision.data,
    authorized.session.userId,
    update
  );
  if (result.outcome === "not_found") {
    return adminRedirect(
      authorized.adminOrigin,
      "/admin/juegos?estado=no-encontrado"
    );
  }
  if (result.outcome === "conflict") {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "conflicto")
    );
  }

  return adminRedirect(
    authorized.adminOrigin,
    redirectPath(
      slug,
      operation.data === "gallery-video-layout"
        ? "preview-diseno-guardado"
        : "galeria-actualizada"
    )
  );
}
