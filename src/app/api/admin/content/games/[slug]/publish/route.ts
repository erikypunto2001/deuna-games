import type { NextRequest } from "next/server";


import {
  adminRedirect,
  adminUnavailableResponse,
  authorizeAdminFormRequest,
} from "@/lib/admin/admin-route";
import {
  expectedRevisionSchema,
} from "@/lib/admin/content-forms";
import {
  inspectGameMediaIntegrity,
} from "@/lib/admin/game-media-integrity";
import {
  getGameMediaWorkspaceSnapshot,
} from "@/lib/admin/game-media-workspace";
import {
  evaluateGamePublicationReadiness,
} from "@/lib/admin/game-publication-readiness";
import {
  getGameDraftPublicationCandidate,
  inspectPublishedGameTaxonomyIntegrity,
} from "@/lib/admin/game-publication-review";
import {
  revalidatePublicGameSurfaces,
} from "@/lib/admin/game-public-revalidation";
import {
  publishGameDraft,
} from "@/lib/admin/publication-service";
import {
  hasExactAdminFormFields,
} from "@/lib/admin/request-security";


export const dynamic = "force-dynamic";
export const runtime = "nodejs";


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
  const target =
    `/admin/juegos/${encodeURIComponent(slug)}/publicacion`;


  if (
    !hasExactAdminFormFields(
      authorized.form,
      ["expectedRevision"]
    )
  ) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=solicitud`
    );
  }


  const expected = expectedRevisionSchema.safeParse(
    authorized.form.get("expectedRevision")
  );


  if (!expected.success) {
    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=datos`
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


    if (candidate.revision !== expected.data) {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=conflicto`
      );
    }


    const readiness =
      evaluateGamePublicationReadiness(candidate.game);


    if (!readiness.essentialsReady) {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=preparacion-incompleta`
      );
    }


    // La higiene se valida en servidor sobre los masters físicos, no sólo
    // sobre el estado visual del panel. Únicamente un master editorial sin
    // referencia en el borrador ni en la publicación vigente bloquea la
    // creación de un snapshot público nuevo.
    const mediaWorkspace =
      await getGameMediaWorkspaceSnapshot(slug);


    if (!mediaWorkspace) {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }


    if (mediaWorkspace.revision !== expected.data) {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=conflicto`
      );
    }


    if (!mediaWorkspace.hygiene.ready) {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=higiene-multimedia`
      );
    }


    const taxonomyIntegrity =
      await inspectPublishedGameTaxonomyIntegrity(
        candidate.game
      );


    if (!taxonomyIntegrity.ok) {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=catalogos-sin-publicar`
      );
    }


    const mediaIntegrity =
      await inspectGameMediaIntegrity(candidate.game);


    if (!mediaIntegrity.ok) {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=asset-publicacion`
      );
    }


    const result = await publishGameDraft(
      slug,
      expected.data,
      authorized.session.userId
    );


    if (result.outcome === "invalid_relations") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=relacion-publica`
      );
    }

    if (result.outcome === "not_found") {
      return adminRedirect(
        authorized.adminOrigin,
        "/admin/juegos?estado=no-encontrado"
      );
    }


    if (result.outcome === "conflict") {
      return adminRedirect(
        authorized.adminOrigin,
        `${target}?estado=conflicto`
      );
    }


    if (result.outcome === "published") {
      // Reconciliamos otra vez después del commit editorial para limpiar
      // únicamente masters que hayan quedado realmente huérfanos. Los usados
      // por el borrador actual o por la publicación vigente continúan
      // protegidos.
      try {
        await getGameMediaWorkspaceSnapshot(slug);
      } catch (error) {
        console.error(
          "La publicación se completó, pero no se pudo reconciliar la limpieza multimedia.",
          error
        );
      }
      revalidatePublicGameSurfaces(slug);
    }


    const state =
      result.outcome === "published"
        ? "publicado"
        : "sin-cambios";


    return adminRedirect(
      authorized.adminOrigin,
      `${target}?estado=${state}`
    );
  } catch {
    console.error(
      "No se pudo publicar el borrador del juego."
    );
    return adminUnavailableResponse();
  }
}