import {
  resolveGameReleases,
  resolvePcRelease,
} from "@/lib/games/releases";
import { resolveGameCoverArtworkSource } from "@/lib/media/game-card-presentation";
import type { Game } from "@/types/game";

export type GamePublicationChangeSection =
  | "ficha"
  | "datos"
  | "requisitos"
  | "rendimiento"
  | "multimedia"
  | "descargas"
  | "valoracion";

export type GamePublicationChange = {
  id: string;
  label: string;
  detail: string;
  section: GamePublicationChangeSection;
};

function serialized(value: unknown) {
  return JSON.stringify(value ?? null);
}

function changed(current: unknown, published: unknown) {
  return serialized(current) !== serialized(published);
}

function compatibilityState(
  game: Game
) {
  const pcRelease =
    resolvePcRelease(
      game
    );

  return {
    platforms:
      resolveGameReleases(
        game
      ).map(
        (release) => ({
          id: release.id,
          platformId:
            release.platformId,
          label:
            release.label,
          region:
            release.region,
          releaseDate:
            release.releaseDate,
        })
      ),
    requirements:
      pcRelease?.requirements,
    metadata:
      game.compatibilityMetadata,
  };
}

function performanceState(
  game: Game
) {
  const pcRelease =
    resolvePcRelease(
      game
    );

  return {
    calibration:
      pcRelease?.performance,
    metadata:
      pcRelease?.performanceMetadata,
  };
}

function distributionState(
  game: Game
) {
  return resolveGameReleases(
    game
  ).map(
    (release) => ({
      id: release.id,
      platformId:
        release.platformId,
      version:
        release.version,
      packages:
        release.packages,
      recommendedSoftwareSlugs:
        release.recommendedSoftwareSlugs,
    })
  );
}

function multimediaState(game: Game) {
  return {
    coverArtworkSource: resolveGameCoverArtworkSource(game),
    coverImage: game.coverImage,
    heroImage: game.heroImage,
    cardImage: game.cardImage,
    detailImage: game.detailImage,
    backgroundImage: game.backgroundImage,
    screenshots: game.screenshots,
    galleryMedia: game.galleryMedia,
    imageMedia: game.imageMedia,
    mediaAccessibility: game.mediaAccessibility,
    mediaModes: game.mediaModes,
    videoMedia: game.videoMedia,
    previewClip: game.previewClip,
  };
}

export function evaluateGamePublicationChanges(
  draft: Game,
  published: Game | null
): GamePublicationChange[] {
  if (!published) {
    return [
      {
        id: "new-game",
        label: "Juego completo",
        detail:
          "Es la primera publicación: se creará un snapshot público con la ficha completa del borrador actual.",
        section: "ficha",
      },
    ];
  }

  const changes: GamePublicationChange[] = [];

  if (
    changed(
      {
        title: draft.title,
        description: draft.description,
        shortTitle: draft.shortTitle,
        highlightedTitle: draft.highlightedTitle,
        developer: draft.developer,
        publisher: draft.publisher,
        releaseDate: draft.releaseDate,
        version: draft.version,
        badge: draft.badge,
        imageAlt: draft.imageAlt,
      },
      {
        title: published.title,
        description: published.description,
        shortTitle: published.shortTitle,
        highlightedTitle: published.highlightedTitle,
        developer: published.developer,
        publisher: published.publisher,
        releaseDate: published.releaseDate,
        version: published.version,
        badge: published.badge,
        imageAlt: published.imageAlt,
      }
    )
  ) {
    changes.push({
      id: "information",
      label: "Información e identidad",
      detail:
        "Cambian título, descripción, autoría, fecha, versión, insignia o texto alternativo general.",
      section: "ficha",
    });
  }

  if (
    changed(
      {
        category: draft.category,
        genres: draft.genres,
        tags: draft.tags,
        ageRating: draft.ageRating,
      },
      {
        category: published.category,
        genres: published.genres,
        tags: published.tags,
        ageRating: published.ageRating,
      }
    )
  ) {
    changes.push({
      id: "classification",
      label: "Clasificación",
      detail:
        "Cambian la clasificación principal, las adicionales, las etiquetas o la clasificación etaria publicada del juego.",
      section: "datos",
    });
  }

  if (
    changed(
      compatibilityState(
        draft
      ),
      compatibilityState(
        published
      )
    )
  ) {
    changes.push({
      id: "compatibility",
      label: "Compatibilidad",
      detail:
        "Cambian plataformas, requisitos o el estado, origen y fecha de verificación de compatibilidad.",
      section: "requisitos",
    });
  }

  if (
    changed(
      performanceState(
        draft
      ),
      performanceState(
        published
      )
    )
  ) {
    changes.push({
      id: "performance",
      label: "Rendimiento",
      detail:
        "Cambia la calibración usada para estimar FPS o la procedencia, fecha y confianza documentadas para ese benchmark.",
      section: "rendimiento",
    });
  }

  if (changed(multimediaState(draft), multimediaState(published))) {
    changes.push({
      id: "media",
      label: "Multimedia",
      detail:
        "Cambian recursos, fuente de Portada, modos, recortes, orden de Galería, videos o textos accesibles contextuales que se mostrarán en las superficies públicas.",
      section: "multimedia",
    });
  }

  if (
    changed(
      distributionState(
        draft
      ),
      distributionState(
        published
      )
    )
  ) {
    changes.push({
      id: "downloads",
      label: "Distribución",
      detail:
        "Cambian fuentes, disponibilidad, tamaño, plataforma, canal o SHA-256 del paquete publicado.",
      section: "descargas",
    });
  }

  if (
    changed(
      {
        rating: draft.rating,
        reviews: draft.reviews,
      },
      {
        rating: published.rating,
        reviews: published.reviews,
      }
    )
  ) {
    changes.push({
      id: "valuation",
      label: "Valoración",
      detail:
        "Cambia la valoración editorial o un contador histórico conservado por compatibilidad.",
      section: "valoracion",
    });
  }

  return changes;
}
