import { NextResponse, type NextRequest } from "next/server";

import { adminRedirect, authorizeAdminFormRequest } from "@/lib/admin/admin-route";
import { expectedRevisionSchema } from "@/lib/admin/content-forms";
import { getEditorialItem, saveGameMediaDraft } from "@/lib/admin/content-service";
import { hasExactAdminFormFields } from "@/lib/admin/request-security";
import { verifyAdminSession } from "@/lib/admin/session";
import {
  withGameVideoLayout,
  type GameCardVideoSource,
  type GameVideoTarget,
} from "@/lib/media/game-video-media";
import {
  GAME_DETAIL_VIEWPORT_ASPECT,
  REQUIRED_DESTINATION_ASPECTS,
} from "@/lib/media/game-media-requirements";
import { parsePreviewViewport } from "@/lib/media/preview-video-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fields = [
  "expectedRevision",
  "target",
  "source",
  "viewportX",
  "viewportY",
  "viewportZoom",
  "viewportAspect",
] as const;

function parseTarget(value: string | null): GameVideoTarget | null {
  return value === "hero" ||
    value === "card" ||
    value === "detail"
    ? value
    : null;
}

function parseSource(value: string | null): GameCardVideoSource | null {
  return value === "hero" || value === "independent" ? value : null;
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
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const videoMedia = item.payload.videoMedia
    ? {
        hero: item.payload.videoMedia.hero,
        card: item.payload.videoMedia.card,
        detail: item.payload.videoMedia.detail,
        background: item.payload.videoMedia.background,
      }
    : null;

  return NextResponse.json(
    {
      revision: item.revision,
      videoMedia,
      legacyPreviewClip: item.payload.previewClip ?? null,
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
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
  const target = parseTarget(authorized.form.get("target"));
  const source = parseSource(authorized.form.get("source"));
  const requiredAspect = target === "detail"
    ? GAME_DETAIL_VIEWPORT_ASPECT
    : target
      ? REQUIRED_DESTINATION_ASPECTS[target]
      : null;
  const submittedAspect = authorized.form.get("viewportAspect");
  const viewport = requiredAspect
    ? parsePreviewViewport(
        authorized.form.get("viewportX"),
        authorized.form.get("viewportY"),
        authorized.form.get("viewportZoom"),
        requiredAspect
      )
    : null;

  if (
    !revision.success ||
    !target ||
    !source ||
    !viewport ||
    submittedAspect !== requiredAspect
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=preview-encuadre-invalido&seccion=multimedia`
    );
  }

  if (
    (target === "hero" && source !== "hero") ||
    (target === "detail" && source !== "independent")
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=preview-destino-invalido&seccion=multimedia`
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
      `${redirectTarget}?estado=conflicto&seccion=multimedia`
    );
  }

  const videoMedia = withGameVideoLayout(
    item.payload,
    target,
    source,
    viewport
  );
  if (!videoMedia) {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=preview-destino-invalido&seccion=multimedia`
    );
  }

  const currentTargetVideo =
    target === "hero"
      ? item.payload.videoMedia?.hero
      : target === "card"
        ? item.payload.videoMedia?.card
        : item.payload.videoMedia?.detail;
  const nextTargetVideo =
    target === "hero"
      ? videoMedia.hero
      : target === "card"
        ? videoMedia.card
        : videoMedia.detail;
  if (
    JSON.stringify(currentTargetVideo ?? null) ===
    JSON.stringify(nextTargetVideo ?? null)
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${redirectTarget}?estado=preview-diseno-guardado&seccion=multimedia`
    );
  }

  const result = await saveGameMediaDraft(
    slug,
    revision.data,
    authorized.session.userId,
    { videoMedia }
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
      `${redirectTarget}?estado=conflicto&seccion=multimedia`
    );
  }

  return adminRedirect(
    authorized.adminOrigin,
    `${redirectTarget}?estado=preview-diseno-guardado&seccion=multimedia`
  );
}
