import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  editorialGameDownloadFormSchema,
} from "@/lib/admin/content-forms";
import {
  inspectGameMediaIntegrity,
} from "@/lib/admin/game-media-integrity";
import {
  evaluateGamePublicationReadiness,
} from "@/lib/admin/game-publication-readiness";
import {
  getGameDraftPublicationCandidate,
} from "@/lib/admin/game-publication-review";
import {
  publishIntegratedGameUpdate,
} from "@/lib/admin/game-update-publication-service";
import {
  revalidatePublicGameSurfaces,
} from "@/lib/admin/game-public-revalidation";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fields = [
  "expectedRevision",
  "releaseId",
  "packageId",
  "packageKind",
  "version",
  "type",
  "summary",
  "featured",
  "sizeGb",
  "fileCount",
  "channel",
  "checksumSha256",
  "sourcesJson",
] as const;

const updateMetadataSchema = z
  .object({
    releaseId: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    packageId: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    packageKind: z.enum([
      "installer",
      "archive",
      "portable",
      "iso",
      "chd",
      "cso",
      "rvz",
      "gdi",
      "pkg",
      "patch",
      "other",
    ]),
    version: z.string().trim().min(1).max(80),
    type: z.enum([
      "update",
      "content",
      "fix",
      "improvement",
    ]),
    summary: z.string().trim().min(1).max(1_500),
    featured: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
  })
  .strict();

function targetFor(slug: string, state: string) {
  return `/admin/juegos/${encodeURIComponent(slug)}/actualizacion?estado=${state}`;
}

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

  if (
    !hasExactAdminFormFields(
      authorized.form,
      fields
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      targetFor(slug, "solicitud")
    );
  }

  const raw = Object.fromEntries(authorized.form);
  const metadata = updateMetadataSchema.safeParse({
    releaseId:
      raw.releaseId,
    packageId:
      raw.packageId,
    packageKind:
      raw.packageKind,
    version: raw.version,
    type: raw.type,
    summary: raw.summary,
    featured: raw.featured,
  });
  const download = editorialGameDownloadFormSchema.safeParse({
    expectedRevision: raw.expectedRevision,
    sizeGb: raw.sizeGb,
    fileCount: raw.fileCount,
    platform: "",
    channel: raw.channel,
    checksumSha256: raw.checksumSha256,
    sourcesJson: raw.sourcesJson,
  });

  if (!metadata.success || !download.success) {
    return adminRedirect(
      authorized.adminOrigin,
      targetFor(slug, "datos")
    );
  }

  try {
    const candidate =
      await getGameDraftPublicationCandidate(slug);

    if (!candidate) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }

    if (
      candidate.revision !==
      download.data.expectedRevision
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        targetFor(slug, "conflicto")
      );
    }

    if (
      !evaluateGamePublicationReadiness(
        candidate.game
      ).essentialsReady
    ) {
      return adminRedirect(
        authorized.adminOrigin,
        targetFor(
          slug,
          "actualizacion-preparacion-incompleta"
        )
      );
    }

    const mediaIntegrity =
      await inspectGameMediaIntegrity(candidate.game);

    if (!mediaIntegrity.ok) {
      return adminRedirect(
        authorized.adminOrigin,
        targetFor(slug, "actualizacion-asset")
      );
    }

    const result = await publishIntegratedGameUpdate(
      slug,
      authorized.session.userId,
      {
        expectedRevision: download.data.expectedRevision,
        releaseId:
          metadata.data.releaseId,
        version: metadata.data.version,
        type: metadata.data.type,
        summary: metadata.data.summary,
        featured: metadata.data.featured,
        distributionMetadata: {
          ...(download.data.channel
            ? { channel: download.data.channel }
            : {}),
          ...(download.data.checksumSha256
            ? { checksumSha256: download.data.checksumSha256 }
            : {}),
        },
        package: {
          id:
            metadata.data.packageId,
          kind:
            metadata.data.packageKind,
          sizeGb:
            download.data.sizeGb,
          fileCount:
            download.data.fileCount,
          sources:
            download.data.sourcesJson.length > 0
              ? download.data.sourcesJson
              : undefined,
        },
      }
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
        targetFor(slug, "conflicto")
      );
    }

    const failureState = {
      not_public: "actualizacion-juego-no-publicado",
      pending_changes: "actualizacion-cambios-pendientes",
      not_ready: "actualizacion-preparacion-incompleta",
      same_version: "actualizacion-misma-version",
      no_download: "actualizacion-sin-descarga",
      update_exists: "actualizacion-duplicada",
    } as const;

    if (result.outcome !== "published") {
      return adminRedirect(
        authorized.adminOrigin,
        targetFor(slug, failureState[result.outcome])
      );
    }

    revalidatePublicGameSurfaces(slug);

    return adminRedirect(
      authorized.adminOrigin,
      targetFor(slug, "actualizacion-publicada")
    );
  } catch {
    console.error(
      "No se pudo publicar la actualización integrada del juego."
    );
    return adminUnavailableResponse();
  }
}
