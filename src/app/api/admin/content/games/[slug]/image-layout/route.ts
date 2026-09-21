import type { NextRequest } from "next/server";
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
import { hasExactAdminFormFields } from "@/lib/admin/request-security";
import {
  resolveGameCardBaseImage,
  resolveGameCoverImage,
} from "@/lib/media/game-card-presentation";
import {
  REQUIRED_DESTINATION_ASPECTS,
} from "@/lib/media/game-media-requirements";
import {
  parseGameImageViewport,
} from "@/lib/media/image-viewport";
import {
  resolveGameDestinationMediaMode,
} from "@/lib/media/game-video-media";
import type {
  Game,
  GameImageMedia,
  GameImageViewport,
} from "@/types/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fixedImageTargets = ["cover", "hero", "card"] as const;
const legacyImageTargets = [...fixedImageTargets, "gallery"] as const;
const targetSchema = z.enum([...legacyImageTargets, "detail"]);
const baseFields = [
  "expectedRevision",
  "target",
  "viewportX",
  "viewportY",
  "viewportZoom",
] as const;
const fixedFields = [
  ...baseFields,
  "viewportAspect",
] as const;
const galleryFields = [
  ...baseFields,
  "resource",
  "viewportAspect",
  "viewportAspectRatio",
] as const;

function redirectPath(slug: string, state: string) {
  return `/admin/juegos/${encodeURIComponent(slug)}?estado=${encodeURIComponent(state)}&seccion=multimedia`;
}

function isFixedImageTarget(
  target: z.infer<typeof targetSchema>
): target is (typeof fixedImageTargets)[number] {
  return fixedImageTargets.includes(target as (typeof fixedImageTargets)[number]);
}

function imageForTarget(
  game: Game,
  target: Exclude<z.infer<typeof targetSchema>, "gallery">
) {
  if (target === "cover") return resolveGameCoverImage(game);
  if (target === "card") return resolveGameCardBaseImage(game);

  if (resolveGameDestinationMediaMode(game, target) === "video") {
    return undefined;
  }

  if (target === "hero") return game.heroImage;
  if (target === "detail") return game.detailImage;
  return undefined;
}

function confirmedViewport(
  viewport: GameImageViewport,
  source: string
): GameImageViewport {
  return {
    ...viewport,
    source,
    confirmed: true,
  };
}

function sameImageViewport(
  current: GameImageViewport | undefined,
  next: GameImageViewport
) {
  return Boolean(
    current &&
    current.x === next.x &&
    current.y === next.y &&
    current.zoom === next.zoom &&
    current.aspect === next.aspect &&
    current.aspectRatio === next.aspectRatio &&
    current.source === next.source &&
    current.confirmed === next.confirmed
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const authorized = await authorizeAdminFormRequest(request);
  if (!authorized.authorized) return authorized.response;

  const { slug } = await context.params;
  const target = targetSchema.safeParse(authorized.form.get("target"));
  if (!target.success) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "imagen-encuadre-invalido")
    );
  }

  const expectsGalleryResource = target.data === "gallery";
  const expectsFixedAspect = isFixedImageTarget(target.data);
  const validFields = expectsGalleryResource
    ? hasExactAdminFormFields(authorized.form, galleryFields)
    : expectsFixedAspect
      ? hasExactAdminFormFields(authorized.form, fixedFields)
      : hasExactAdminFormFields(authorized.form, baseFields);

  if (!validFields) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "solicitud")
    );
  }

  const revision = expectedRevisionSchema.safeParse(
    authorized.form.get("expectedRevision")
  );
  const viewport = expectsGalleryResource
    ? parseGameImageViewport(
        authorized.form.get("viewportX"),
        authorized.form.get("viewportY"),
        authorized.form.get("viewportZoom"),
        authorized.form.get("viewportAspect"),
        authorized.form.get("viewportAspectRatio")
      )
    : expectsFixedAspect
      ? parseGameImageViewport(
          authorized.form.get("viewportX"),
          authorized.form.get("viewportY"),
          authorized.form.get("viewportZoom"),
          authorized.form.get("viewportAspect")
        )
      : parseGameImageViewport(
          authorized.form.get("viewportX"),
          authorized.form.get("viewportY"),
          authorized.form.get("viewportZoom")
        );
  const resourceValue = authorized.form.get("resource");
  const resource = typeof resourceValue === "string" ? resourceValue : "";

  if (!revision.success || !viewport) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "imagen-encuadre-invalido")
    );
  }

  if (
    isFixedImageTarget(target.data) &&
    viewport.aspect !== REQUIRED_DESTINATION_ASPECTS[target.data]
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "imagen-encuadre-invalido")
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

  let source: string;
  if (target.data === "gallery") {
    if (!resource || !(item.payload.screenshots ?? []).includes(resource)) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
    source = resource;
  } else {
    const targetImage = imageForTarget(item.payload, target.data);
    if (!targetImage) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
    source = targetImage;
  }

  const savedViewport = confirmedViewport(viewport, source);
  const currentViewport = target.data === "gallery"
    ? item.payload.imageMedia?.gallery?.[resource]
    : item.payload.imageMedia?.[target.data];
  if (sameImageViewport(currentViewport, savedViewport)) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "imagen-encuadre-guardado")
    );
  }

  const imageMedia: GameImageMedia = target.data === "gallery"
    ? {
        ...item.payload.imageMedia,
        gallery: {
          ...item.payload.imageMedia?.gallery,
          [resource]: savedViewport,
        },
      }
    : {
        ...item.payload.imageMedia,
        [target.data]: savedViewport,
      };

  const result = await saveGameMediaDraft(
    slug,
    revision.data,
    authorized.session.userId,
    { imageMedia }
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
    redirectPath(slug, "imagen-encuadre-guardado")
  );
}
