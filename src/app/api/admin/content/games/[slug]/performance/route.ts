import type { NextRequest } from "next/server";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  editorialGamePerformanceFormSchema,
} from "@/lib/admin/content-forms";
import {
  gameEditorSuccessTarget,
  requestedGameEditorContinuation,
} from "@/lib/admin/game-editor-flow";
import {
  saveGamePerformanceDraft,
} from "@/lib/admin/game-performance-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fields = [
  "expectedRevision",
  "referenceFps",
  "ramGb",
  "fpsCap",
  "benchmarkSource",
  "benchmarkSourceLabel",
  "benchmarkMeasuredAt",
  "benchmarkConfidence",
] as const;

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ slug: string }>;
  }
) {
  const authorized =
    await authorizeAdminFormRequest(request);

  if (!authorized.authorized) {
    return authorized.response;
  }

  const { slug } = await context.params;
  const target = `/admin/juegos/${encodeURIComponent(slug)}`;
  const continuation = requestedGameEditorContinuation(
    request.nextUrl,
    "rendimiento"
  );

  if (
    !hasExactAdminFormFields(
      authorized.form,
      fields
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=solicitud&seccion=rendimiento`
    );
  }

  const parsed = editorialGamePerformanceFormSchema.safeParse(
    Object.fromEntries(authorized.form)
  );

  if (!parsed.success) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=datos&seccion=rendimiento`
    );
  }

  try {
    const {
      expectedRevision,
      referenceFps,
      ramGb,
      fpsCap,
      benchmarkSource,
      benchmarkSourceLabel,
      benchmarkMeasuredAt,
      benchmarkConfidence,
    } = parsed.data;
    const calibration =
      referenceFps !== undefined &&
      ramGb !== undefined
        ? {
            referenceFps,
            ramGb,
            ...(fpsCap !== undefined ? { fpsCap } : {}),
          }
        : undefined;
    const metadata = calibration && (
      benchmarkSource !== undefined ||
      benchmarkSourceLabel !== undefined ||
      benchmarkMeasuredAt !== undefined ||
      benchmarkConfidence !== undefined
    )
      ? {
          ...(benchmarkSource !== undefined
            ? { source: benchmarkSource }
            : {}),
          ...(benchmarkSourceLabel !== undefined
            ? { sourceLabel: benchmarkSourceLabel }
            : {}),
          ...(benchmarkMeasuredAt !== undefined
            ? { measuredAt: benchmarkMeasuredAt }
            : {}),
          ...(benchmarkConfidence !== undefined
            ? { confidence: benchmarkConfidence }
            : {}),
        }
      : undefined;
    const result = await saveGamePerformanceDraft(
      slug,
      expectedRevision,
      authorized.session.userId,
      calibration,
      metadata
    );

    if (result.outcome === "not_found") {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }

    if (
      result.outcome ===
      "unsupported_platform"
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=rendimiento-sin-pc&seccion=rendimiento`
      );
    }

    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=conflicto&seccion=rendimiento`
      );
    }

    return adminRedirect(
      authorized.adminOrigin,
      gameEditorSuccessTarget(
        target,
        "rendimiento",
        continuation
      )
    );
  } catch {
    console.error(
      "No se pudo guardar la calibración de rendimiento del juego."
    );
    return adminUnavailableResponse();
  }
}
