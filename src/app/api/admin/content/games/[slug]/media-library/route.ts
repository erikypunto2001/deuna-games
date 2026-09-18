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
import {
  getHistoricalGameMediaReferences,
} from "@/lib/admin/game-media-history";
import {
  listGameImageReferences,
  listGameVideoReferences,
} from "@/lib/admin/game-media-integrity";
import {
  getPublishedGameImageReferences,
} from "@/lib/admin/publication-service";
import {
  getPublishedGameVideoReferences,
} from "@/lib/admin/published-game-video-references";
import { hasExactAdminFormFields } from "@/lib/admin/request-security";
import { verifyAdminSession } from "@/lib/admin/session";
import {
  findEditorialMediaResource,
  listAssignedBundledImageResources,
  listEditorialMediaLibrary,
  mergeEditorialMediaResources,
  reconcileEditorialMediaDeletions,
} from "@/lib/media/editorial-media-library";
import {
  resolveGameCardBaseImage,
  resolveGameCoverArtworkSource,
  resolveGameCoverImage,
} from "@/lib/media/game-card-presentation";
import {
  MAX_GAME_GALLERY_ITEMS,
  galleryImageSources,
  resolveGameGalleryItems,
  withGalleryItem,
  withoutGalleryItem,
} from "@/lib/media/game-gallery-media";
import {
  HERO_GAME_MEDIA_MODES,
  STANDARD_GAME_MEDIA_MODES,
} from "@/lib/media/game-media-mode-policy";
import {
  evaluateGameMediaRequirements,
  GAME_DETAIL_VIEWPORT_ASPECT,
  REQUIRED_DESTINATION_ASPECTS,
  resolveGameBackgroundMediaMode,
} from "@/lib/media/game-media-requirements";
import {
  DEFAULT_GAME_IMAGE_VIEWPORT,
} from "@/lib/media/image-viewport";
import {
  resolveGameDestinationMediaMode,
} from "@/lib/media/game-video-media";
import type {
  Game,
  GameCoverArtworkSource,
  GameDestinationMediaMode,
  GameImageMedia,
  GameImageViewport,
  GameVideoViewport,
} from "@/types/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const assignmentTargetSchema = z.enum([
  "cover-source",
  "cover-image",
  "hero-mode",
  "hero-image",
  "hero-video",
  "card-mode",
  "card-image",
  "card-video",
  "detail-mode",
  "detail-image",
  "detail-video",
  "gallery-image",
  "gallery-remove",
]);

const coverSourceSchema = z.enum(["card", "custom"]);
const heroMediaModeSchema = z.enum(HERO_GAME_MEDIA_MODES);
const standardMediaModeSchema = z.enum(STANDARD_GAME_MEDIA_MODES);

const fields = [
  "expectedRevision",
  "target",
  "resource",
] as const;

function redirectPath(slug: string, state: string) {
  return `/admin/juegos/${encodeURIComponent(slug)}?estado=${encodeURIComponent(state)}&seccion=multimedia`;
}

function requiredVideoViewport(
  target: "hero" | "card" | "detail"
): GameVideoViewport {
  return {
    x: 0.5,
    y: 0.5,
    zoom: 1,
    aspect: target === "detail"
      ? GAME_DETAIL_VIEWPORT_ASPECT
      : REQUIRED_DESTINATION_ASPECTS[target],
  };
}

function pendingImageViewport(source: string): GameImageViewport {
  return {
    ...DEFAULT_GAME_IMAGE_VIEWPORT,
    source,
  };
}

async function protectedReferencesForGame(slug: string) {
  const [images, videos, historical] = await Promise.all([
    getPublishedGameImageReferences(slug),
    getPublishedGameVideoReferences(slug),
    getHistoricalGameMediaReferences(slug),
  ]);
  return Array.from(new Set([...images, ...videos, ...historical]));
}

async function resourcesForGame(
  slug: string,
  game: Game,
  protectedReferences: readonly string[]
) {
  const imageReferences = listGameImageReferences(game);
  const draftReferences = [
    ...imageReferences,
    ...listGameVideoReferences(game),
  ];
  const allProtectedReferences = Array.from(
    new Set([...draftReferences, ...protectedReferences])
  );

  await reconcileEditorialMediaDeletions(
    slug,
    allProtectedReferences,
    allProtectedReferences
  );

  const [editorial, bundled] = await Promise.all([
    listEditorialMediaLibrary(slug),
    listAssignedBundledImageResources(imageReferences),
  ]);

  return mergeEditorialMediaResources(editorial, bundled);
}

type MediaDraftUpdate = Parameters<typeof saveGameMediaDraft>[3] &
  Partial<
    Pick<
      Game,
      | "backgroundImage"
      | "cardImage"
      | "coverArtworkSource"
      | "detailImage"
      | "galleryMedia"
      | "mediaModes"
    >
  >;

function mediaUpdate(
  update: MediaDraftUpdate,
  imageMedia?: GameImageMedia
): MediaDraftUpdate {
  return {
    ...update,
    ...(imageMedia ? { imageMedia } : {}),
  };
}

function mediaModeUpdate(
  game: Game,
  target: "hero" | "card" | "detail",
  mode: GameDestinationMediaMode
): MediaDraftUpdate {
  const playback: "hover" | "always" =
    target === "hero" && mode === "hover-video" ? "hover" : "always";
  const videoMedia = game.videoMedia
    ? {
        ...game.videoMedia,
        ...(target === "hero" && game.videoMedia.hero
          ? {
              hero: {
                ...game.videoMedia.hero,
                playback,
              },
            }
          : {}),
        ...(target === "card" && game.videoMedia.card
          ? {
              card: {
                ...game.videoMedia.card,
                playback,
              },
            }
          : {}),
        ...(target === "detail" && game.videoMedia.detail
          ? {
              detail: {
                ...game.videoMedia.detail,
                playback,
              },
            }
          : {}),
      }
    : undefined;

  return {
    mediaModes: {
      ...game.mediaModes,
      [target]: mode,
    },
    ...(videoMedia ? { videoMedia } : {}),
  };
}

function coverSourceUpdate(
  game: Game,
  source: GameCoverArtworkSource
): MediaDraftUpdate | null {
  const currentSource = resolveGameCoverArtworkSource(game);
  const cardImage = resolveGameCardBaseImage(game);

  if (source === "card") {
    if (!cardImage) return null;

    const canPreserveCrop =
      currentSource === "card" &&
      resolveGameCoverImage(game) === cardImage;

    return mediaUpdate(
      {
        coverArtworkSource: "card",
        coverImage: cardImage,
      },
      {
        ...game.imageMedia,
        cover: canPreserveCrop && game.imageMedia?.cover
          ? game.imageMedia.cover
          : pendingImageViewport(cardImage),
      }
    );
  }

  if (currentSource === "custom") {
    return { coverArtworkSource: "custom" };
  }

  return mediaUpdate(
    {
      coverArtworkSource: "custom",
      coverImage: undefined,
    },
    {
      ...game.imageMedia,
      cover: undefined,
    }
  );
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

  const protectedReferences = await protectedReferencesForGame(slug);
  const resources = await resourcesForGame(
    slug,
    item.payload,
    protectedReferences
  );

  return NextResponse.json(
    {
      revision: item.revision,
      resources,
      requirements: evaluateGameMediaRequirements(item.payload),
      assignments: {
        coverArtworkSource: resolveGameCoverArtworkSource(item.payload),
        coverImage: resolveGameCoverImage(item.payload) ?? null,
        heroImage: item.payload.heroImage ?? null,
        cardImage: resolveGameCardBaseImage(item.payload) ?? null,
        detailImage: item.payload.detailImage ?? null,
        backgroundImage: item.payload.backgroundImage ?? null,
        screenshots: item.payload.screenshots ?? [],
        imageMedia: item.payload.imageMedia ?? null,
        heroMode: resolveGameDestinationMediaMode(item.payload, "hero"),
        cardMode: resolveGameDestinationMediaMode(item.payload, "card"),
        detailMode: resolveGameDestinationMediaMode(item.payload, "detail"),
        backgroundMode: resolveGameBackgroundMediaMode(item.payload),
        heroVideo: item.payload.videoMedia?.hero ?? null,
        cardVideo: item.payload.videoMedia?.card ?? null,
        detailVideo: item.payload.videoMedia?.detail ?? null,
        backgroundVideo: item.payload.videoMedia?.background ?? null,
        legacyPreviewClip: item.payload.previewClip ?? null,
      },
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

  if (!hasExactAdminFormFields(authorized.form, fields)) {
    return adminRedirect(
      authorized.adminOrigin,
      redirectPath(slug, "solicitud")
    );
  }

  const revision = expectedRevisionSchema.safeParse(
    authorized.form.get("expectedRevision")
  );
  const target = assignmentTargetSchema.safeParse(
    authorized.form.get("target")
  );
  const resourceValue = authorized.form.get("resource");
  const resource = typeof resourceValue === "string" ? resourceValue : "";

  if (!revision.success || !target.success) {
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
  const protectedReferences = await protectedReferencesForGame(slug);
  const resources = await resourcesForGame(
    slug,
    current,
    protectedReferences
  );
  const imageResourceMatch = findEditorialMediaResource(
    resources,
    resource,
    "image"
  );
  const imageResource = imageResourceMatch?.kind === "image"
    ? imageResourceMatch
    : undefined;
  const videoResourceMatch = findEditorialMediaResource(
    resources,
    resource,
    "video"
  );
  const videoResource = videoResourceMatch?.kind === "video"
    ? videoResourceMatch
    : undefined;

  let update: MediaDraftUpdate | null = null;

  if (target.data === "cover-source") {
    const source = coverSourceSchema.safeParse(resource);
    if (!source.success) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "solicitud")
      );
    }
    update = coverSourceUpdate(current, source.data);
    if (!update) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
  }

  if (
    target.data === "hero-mode" ||
    target.data === "card-mode" ||
    target.data === "detail-mode"
  ) {
    const destination = target.data.replace("-mode", "") as
      "hero" | "card" | "detail";
    const mode = destination === "hero"
      ? heroMediaModeSchema.safeParse(resource)
      : standardMediaModeSchema.safeParse(resource);
    if (!mode.success) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "solicitud")
      );
    }
    update = mediaModeUpdate(current, destination, mode.data);
  }

  if (target.data === "cover-image") {
    if (!imageResource) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
    update = mediaUpdate(
      {
        coverArtworkSource: "custom",
        coverImage: imageResource.src,
      },
      {
        ...current.imageMedia,
        cover: pendingImageViewport(imageResource.src),
      }
    );
  }

  if (target.data === "hero-image") {
    if (!imageResource) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
    update = mediaUpdate(
      { heroImage: imageResource.src },
      {
        ...current.imageMedia,
        hero: pendingImageViewport(imageResource.src),
      }
    );
  }

  if (target.data === "card-image") {
    if (!imageResource) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
    const sharesCover = resolveGameCoverArtworkSource(current) === "card";
    update = mediaUpdate(
      {
        cardImage: imageResource.src,
        ...(sharesCover
          ? {
              coverArtworkSource: "card" as const,
              coverImage: imageResource.src,
            }
          : {}),
      },
      {
        ...current.imageMedia,
        card: pendingImageViewport(imageResource.src),
        ...(sharesCover
          ? { cover: pendingImageViewport(imageResource.src) }
          : {}),
      }
    );
  }

  if (target.data === "detail-image") {
    if (!imageResource) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
    update = mediaUpdate(
      { detailImage: imageResource.src },
      {
        ...current.imageMedia,
        detail: pendingImageViewport(imageResource.src),
      }
    );
  }

  if (target.data === "hero-video") {
    if (!videoResource) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
    const mode = resolveGameDestinationMediaMode(current, "hero");
    update = {
      videoMedia: {
        ...current.videoMedia,
        hero: {
          clip: videoResource.src,
          viewport: requiredVideoViewport("hero"),
          playback: mode === "hover-video" ? "hover" : "always",
        },
      },
    };
  }

  if (target.data === "card-video") {
    if (!videoResource) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
    update = {
      videoMedia: {
        ...current.videoMedia,
        card: {
          source: "independent",
          clip: videoResource.src,
          viewport: requiredVideoViewport("card"),
          playback: "always",
        },
      },
      previewClip: videoResource.src,
    };
  }

  if (target.data === "detail-video") {
    if (!videoResource) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }
    update = {
      videoMedia: {
        ...current.videoMedia,
        detail: {
          clip: videoResource.src,
          viewport: requiredVideoViewport("detail"),
          playback: "always",
        },
      },
    };
  }

  if (target.data === "gallery-image") {
    if (!imageResource) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }

    const currentGallery = resolveGameGalleryItems(current);
    const alreadyAssigned = currentGallery.some(
      (item) => item.kind === "image" && item.src === imageResource.src
    );
    if (!alreadyAssigned && currentGallery.length >= MAX_GAME_GALLERY_ITEMS) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "galeria-llena")
      );
    }

    const galleryMedia = withGalleryItem(current, {
      kind: "image",
      src: imageResource.src,
    });
    update = mediaUpdate(
      {
        galleryMedia,
        screenshots: galleryImageSources(galleryMedia),
      },
      {
        ...current.imageMedia,
        gallery: {
          ...current.imageMedia?.gallery,
          [imageResource.src]: current.imageMedia?.gallery?.[imageResource.src]
            ?? pendingImageViewport(imageResource.src),
        },
      }
    );
  }

  if (target.data === "gallery-remove") {
    const currentGallery = resolveGameGalleryItems(current);
    if (!currentGallery.some(
      (item) => item.kind === "image" && item.src === resource
    )) {
      return adminRedirect(
        authorized.adminOrigin,
        redirectPath(slug, "recurso-invalido")
      );
    }

    const galleryMedia = withoutGalleryItem(current, "image", resource);
    const gallery = { ...current.imageMedia?.gallery };
    delete gallery[resource];

    update = mediaUpdate(
      {
        galleryMedia,
        screenshots: galleryImageSources(galleryMedia),
      },
      {
        ...current.imageMedia,
        ...(Object.keys(gallery).length ? { gallery } : { gallery: undefined }),
      }
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
      target.data === "gallery-remove" ? "galeria-actualizada" : "recurso-asignado"
    )
  );
}
