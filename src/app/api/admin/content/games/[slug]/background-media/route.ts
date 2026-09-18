import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import { expectedRevisionSchema } from "@/lib/admin/content-forms";
import {
  getEditorialItem,
  saveGameMediaDraft,
} from "@/lib/admin/content-service";
import {
  listGameImageReferences,
} from "@/lib/admin/game-media-integrity";
import { hasExactAdminFormFields } from "@/lib/admin/request-security";
import { verifyAdminSession } from "@/lib/admin/session";
import {
  findEditorialMediaResource,
  listAssignedBundledImageResources,
  listEditorialMediaLibrary,
  mergeEditorialMediaResources,
} from "@/lib/media/editorial-media-library";
import {
  STANDARD_GAME_MEDIA_MODES,
  normalizeGameMediaMode,
} from "@/lib/media/game-media-mode-policy";
import {
  GAME_BACKGROUND_VIEWPORT_ASPECT,
  evaluateGameMediaRequirements,
  resolveGameBackgroundMediaMode,
} from "@/lib/media/game-media-requirements";
import {
  DEFAULT_GAME_IMAGE_VIEWPORT,
  parseGameImageViewport,
} from "@/lib/media/image-viewport";
import { parsePreviewViewport } from "@/lib/media/preview-video-policy";
import type {
  Game,
  GameDestinationMediaMode,
  GameImageMedia,
  GameVideoMedia,
  GameVideoViewport,
} from "@/types/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const actionSchema = z.enum([
  "mode",
  "global",
  "select-image",
  "select-video",
  "layout-image",
  "layout-video",
]);
const mediaModeSchema = z.enum(STANDARD_GAME_MEDIA_MODES);

const assignmentFields = [
  "expectedRevision",
  "action",
  "resource",
] as const;
const layoutFields = [
  ...assignmentFields,
  "viewportX",
  "viewportY",
  "viewportZoom",
] as const;

type MediaDraftUpdate = Parameters<typeof saveGameMediaDraft>[3] &
  Partial<Pick<Game, "backgroundImage" | "mediaModes">>;

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function defaultBackgroundVideoViewport(): GameVideoViewport {
  return {
    x: 0.5,
    y: 0.5,
    zoom: 1,
    aspect: GAME_BACKGROUND_VIEWPORT_ASPECT,
  };
}

function clearBackgroundUpdate(game: Game): MediaDraftUpdate {
  const imageMedia: GameImageMedia = { ...game.imageMedia };
  delete imageMedia.background;

  const videoMedia: GameVideoMedia = { ...game.videoMedia };
  delete videoMedia.background;

  const mediaModes = { ...game.mediaModes };
  delete mediaModes.background;

  return {
    backgroundImage: undefined,
    imageMedia: Object.keys(imageMedia).length ? imageMedia : undefined,
    videoMedia: Object.keys(videoMedia).length ? videoMedia : undefined,
    mediaModes: Object.keys(mediaModes).length ? mediaModes : undefined,
  };
}

async function resourcesForGame(slug: string, game: Game) {
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

  if (!item) return jsonError("Juego no encontrado.", 404);

  const resources = await resourcesForGame(slug, item.payload);
  const requirements = evaluateGameMediaRequirements(item.payload);

  return NextResponse.json(
    {
      revision: item.revision,
      resources,
      assignment: {
        active: requirements.background.active,
        mode: resolveGameBackgroundMediaMode(item.payload),
        image: item.payload.backgroundImage ?? null,
        imageViewport: item.payload.imageMedia?.background ?? null,
        video: item.payload.videoMedia?.background ?? null,
      },
      requirement: requirements.background,
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
  const action = actionSchema.safeParse(authorized.form.get("action"));
  if (!action.success) return jsonError("Acción de fondo inválida.");

  const expectedFields = action.data === "layout-image" || action.data === "layout-video"
    ? layoutFields
    : assignmentFields;
  if (!hasExactAdminFormFields(authorized.form, expectedFields)) {
    return jsonError("La solicitud contiene campos inesperados.");
  }

  const revision = expectedRevisionSchema.safeParse(
    authorized.form.get("expectedRevision")
  );
  const resourceValue = authorized.form.get("resource");
  const resource = typeof resourceValue === "string" ? resourceValue : "";
  if (!revision.success) return jsonError("Revisión inválida.");

  const item = await getEditorialItem("game", slug);
  if (!item) return jsonError("Juego no encontrado.", 404);
  if (item.revision !== revision.data) {
    return jsonError("Otra pestaña guardó una revisión más reciente.", 409);
  }

  const current = item.payload;
  let update: MediaDraftUpdate | null = null;

  if (action.data === "global") {
    if (resource !== "global") return jsonError("Solicitud de fondo global inválida.");
    update = clearBackgroundUpdate(current);
  }

  if (action.data === "mode") {
    const mode = mediaModeSchema.safeParse(resource);
    if (!mode.success) return jsonError("Modo de fondo inválido.");

    update = {
      mediaModes: {
        ...current.mediaModes,
        background: mode.data,
      },
      ...(current.videoMedia?.background
        ? {
            videoMedia: {
              ...current.videoMedia,
              background: {
                ...current.videoMedia.background,
                playback: "always" as const,
              },
            },
          }
        : {}),
    };
  }

  if (action.data === "select-image" || action.data === "select-video") {
    const resources = await resourcesForGame(slug, current);
    const kind = action.data === "select-image" ? "image" : "video";
    const match = findEditorialMediaResource(resources, resource, kind);
    if (!match || match.kind !== kind) {
      return jsonError("El recurso seleccionado ya no está disponible.", 422);
    }

    if (kind === "image") {
      const mode: GameDestinationMediaMode = normalizeGameMediaMode(
        "background",
        current.mediaModes?.background ?? "image"
      );
      update = {
        backgroundImage: match.src,
        imageMedia: {
          ...current.imageMedia,
          background: { ...DEFAULT_GAME_IMAGE_VIEWPORT },
        },
        mediaModes: {
          ...current.mediaModes,
          background: mode,
        },
      };
    } else {
      const mode: GameDestinationMediaMode = normalizeGameMediaMode(
        "background",
        current.mediaModes?.background ?? "video"
      );
      update = {
        videoMedia: {
          ...current.videoMedia,
          background: {
            clip: match.src,
            viewport: defaultBackgroundVideoViewport(),
            playback: "always",
          },
        },
        mediaModes: {
          ...current.mediaModes,
          background: mode,
        },
      };
    }
  }

  if (action.data === "layout-image") {
    if (!current.backgroundImage || current.backgroundImage !== resource) {
      return jsonError("La imagen de fondo cambió antes de guardar el recorte adaptable.", 409);
    }
    const viewport = parseGameImageViewport(
      authorized.form.get("viewportX"),
      authorized.form.get("viewportY"),
      authorized.form.get("viewportZoom")
    );
    if (!viewport) return jsonError("Recorte adaptable de imagen inválido.");

    update = {
      imageMedia: {
        ...current.imageMedia,
        background: {
          ...viewport,
          confirmed: true,
        },
      },
    };
  }

  if (action.data === "layout-video") {
    const background = current.videoMedia?.background;
    if (!background?.clip || background.clip !== resource) {
      return jsonError("El video de fondo cambió antes de guardar el recorte adaptable.", 409);
    }
    const viewport = parsePreviewViewport(
      authorized.form.get("viewportX"),
      authorized.form.get("viewportY"),
      authorized.form.get("viewportZoom"),
      GAME_BACKGROUND_VIEWPORT_ASPECT
    );
    if (!viewport || viewport.aspect === "free") {
      return jsonError("Recorte adaptable de video inválido.");
    }

    update = {
      videoMedia: {
        ...current.videoMedia,
        background: {
          ...background,
          viewport: {
            x: viewport.x,
            y: viewport.y,
            zoom: viewport.zoom,
            aspect: viewport.aspect,
            confirmed: true,
          },
        },
      },
    };
  }

  if (!update) return jsonError("No se pudo resolver la operación de fondo.");

  const result = await saveGameMediaDraft(
    slug,
    revision.data,
    authorized.session.userId,
    update
  );

  if (result.outcome === "not_found") return jsonError("Juego no encontrado.", 404);
  if (result.outcome === "conflict") {
    return jsonError("Otra pestaña guardó una revisión más reciente.", 409);
  }

  return NextResponse.json(
    { ok: true, revision: result.revision },
    { headers: { "Cache-Control": "no-store" } }
  );
}
