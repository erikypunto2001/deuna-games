import {
  resolvePerformanceProfile,
} from "@/features/game-finder/performance-data";
import type {
  GameEditorSection,
} from "@/lib/admin/game-editor-flow";
import {
  resolveGameReleases,
  resolvePcRelease,
} from "@/lib/games/releases";
import {
  hasCompleteContextualMediaAccessibility,
} from "@/lib/media/game-media-accessibility";
import {
  evaluateGameMediaRequirements,
  REQUIRED_DESTINATION_ASPECTS,
} from "@/lib/media/game-media-requirements";
import type {
  Game,
  GameDestinationMediaMode,
} from "@/types/game";

export type GameReadinessSection = GameEditorSection;

export type GameReadinessItem = {
  id: string;
  label: string;
  detail: string;
  section: GameReadinessSection;
  complete: boolean;
  priority: "essential" | "recommended";
};

export type GamePublicationReadiness = {
  items: GameReadinessItem[];
  completed: number;
  total: number;
  percentage: number;
  essentialsReady: boolean;
  recommendedMissing: number;
};

function hasText(value: string | undefined) {
  return Boolean(value?.trim());
}

function pcRequirements(
  game: Game
) {
  return resolvePcRelease(
    game
  )?.requirements;
}

function hasMinimumRequirements(
  game: Game
) {
  const requirements =
    pcRequirements(
      game
    );
  const minimum =
    requirements?.minimum ??
    requirements;

  return Boolean(
    hasText(minimum?.processor) &&
      hasText(minimum?.ram) &&
      hasText(minimum?.graphics)
  );
}

function hasRecommendedRequirements(
  game: Game
) {
  const recommended =
    pcRequirements(
      game
    )?.recommended;

  return Boolean(
    hasText(recommended?.processor) &&
      hasText(recommended?.ram) &&
      hasText(recommended?.graphics)
  );
}

function downloadablePackages(
  game: Game
) {
  return resolveGameReleases(
    game
  ).flatMap(
    (release) =>
      (
        release.packages ??
        []
      ).filter(
        (item) =>
          item.enabled !== false &&
          (
            item.sources ??
            []
          ).some(
            (source) =>
              source.enabled !==
                false &&
              source.status !==
                "down" &&
              hasText(
                source.href
              )
          )
      )
  );
}

function hasVisibleDownload(
  game: Game
) {
  return (
    downloadablePackages(
      game
    ).length > 0
  );
}

function hasCompleteDistributionIntegrity(
  game: Game
) {
  const packages =
    downloadablePackages(
      game
    );

  return (
    packages.length > 0 &&
    packages.every(
      (item) =>
        Boolean(
          item.channel &&
            /^[a-f0-9]{64}$/.test(
              item.checksumSha256 ??
                ""
            )
        )
    )
  );
}
function cardMediaReadinessDetail(mode: GameDestinationMediaMode) {
  if (mode === "video") {
    return "Video principal 3:2 y su imagen de respaldo 3:2 deben tener recurso y recorte confirmados.";
  }

  return "La imagen principal 3:2 debe tener recurso y recorte confirmados; este modo no utiliza video.";
}

export function evaluateGamePublicationReadiness(
  game: Game
): GamePublicationReadiness {
  const media = evaluateGameMediaRequirements(game);
  const backgroundItem: GameReadinessItem[] = media.background.active
    ? [
        {
          id: "background-media",
          label: "Fondo del juego · adaptable",
          detail: "Cuando el Fondo propio está activo, el recurso exigido por Imagen o Video debe tener su recorte confirmado.",
          section: "multimedia",
          complete: media.background.cropReady,
          priority: "essential",
        },
      ]
    : [];
  const items: GameReadinessItem[] = [
    {
      id: "information-core",
      label: "Información principal",
      detail: "Título, descripción y texto alternativo están completos.",
      section: "ficha",
      complete: Boolean(
        hasText(game.title) &&
          hasText(game.description) &&
          hasText(game.imageAlt)
      ),
      priority: "essential",
    },
    {
      id: "identity",
      label: "Identidad del juego",
      detail: "Desarrollador, editor y fecha de lanzamiento completan la identidad pública del título.",
      section: "ficha",
      complete: Boolean(
        hasText(game.developer) &&
          hasText(game.publisher) &&
          hasText(game.releaseDate)
      ),
      priority: "recommended",
    },
    {
      id: "classification-primary",
      label: "Clasificación principal",
      detail: "La clasificación principal es obligatoria para presentar y organizar el juego.",
      section: "datos",
      complete: hasText(game.category),
      priority: "essential",
    },
    {
      id: "classification-extra",
      label: "Clasificaciones y etiquetas",
      detail: "Las clasificaciones adicionales y etiquetas mejoran filtros y descubrimiento.",
      section: "datos",
      complete: Boolean(game.genres?.length || game.tags?.length),
      priority: "recommended",
    },
    {
      id: "age-rating",
      label: "Clasificación etaria",
      detail: "Sistema y rating publicados permiten informar la clasificación de contenido sin inferir equivalencias entre organismos.",
      section: "datos",
      complete: Boolean(
        game.ageRating?.system &&
          game.ageRating?.rating
      ),
      priority: "recommended",
    },
    {
      id: "platforms",
      label: "Plataformas confirmadas",
      detail: "Compatibilidad debe indicar explícitamente al menos una plataforma; ausencia ya no equivale a PC.",
      section: "requisitos",
      complete: Boolean(
        resolveGameReleases(
          game
        ).length
      ),
      priority: "recommended",
    },
    {
      id: "minimum-requirements",
      label: "Requisitos mínimos",
      detail: "Procesador, RAM y gráficos mínimos permiten comparar compatibilidad.",
      section: "requisitos",
      complete: hasMinimumRequirements(game),
      priority: "recommended",
    },
    {
      id: "recommended-requirements",
      label: "Requisitos recomendados",
      detail: "Procesador, RAM y gráficos recomendados mejoran la ficha técnica.",
      section: "requisitos",
      complete: hasRecommendedRequirements(game),
      priority: "recommended",
    },
    {
      id: "compatibility-verification",
      label: "Verificación de compatibilidad",
      detail: "Estado, origen y fecha permiten distinguir datos declarados, revisados o probados sin mezclarlos con la confianza del estimador.",
      section: "requisitos",
      complete: Boolean(
        game.compatibilityMetadata?.status &&
          game.compatibilityMetadata?.source &&
          game.compatibilityMetadata?.verifiedAt
      ),
      priority: "recommended",
    },
    {
      id: "performance",
      label: "Estimación de FPS",
      detail: "Una calibración editorial o histórica permite adaptar los FPS al hardware de cada visitante.",
      section: "rendimiento",
      complete: Boolean(
        resolvePerformanceProfile(
          game.slug,
          resolvePcRelease(
            game
          )?.performance
        )
      ),
      priority: "recommended",
    },
    {
      id: "performance-provenance",
      label: "Procedencia del benchmark",
      detail: "Origen, fecha y confianza documentados permiten explicar y auditar el dato base usado por la estimación.",
      section: "rendimiento",
      complete: Boolean(
        resolvePcRelease(
          game
        )?.performanceMetadata?.source &&
          resolvePcRelease(
            game
          )?.performanceMetadata?.measuredAt &&
          resolvePcRelease(
            game
          )?.performanceMetadata?.confidence
      ),
      priority: "recommended",
    },
    {
      id: "cover-crop",
      label: `Portada · recorte ${REQUIRED_DESTINATION_ASPECTS.cover}`,
      detail: "La Portada requiere una imagen y su recorte 4:5 confirmado.",
      section: "multimedia",
      complete: media.cover.cropReady,
      priority: "essential",
    },
    {
      id: "hero-crop",
      label: `Hero · recorte ${REQUIRED_DESTINATION_ASPECTS.hero}`,
      detail: "El Hero debe completar los recursos exigidos por su modo activo.",
      section: "multimedia",
      complete: media.hero.cropReady,
      priority: "essential",
    },
    {
      id: "card-crop",
      label: `Card · recorte ${REQUIRED_DESTINATION_ASPECTS.card}`,
      detail: cardMediaReadinessDetail(media.card.mode),
      section: "multimedia",
      complete: media.card.cropReady,
      priority: "essential",
    },
    {
      id: "detail-container-media",
      label: "Contenedor de la ficha · adaptable",
      detail: "El contenedor principal debe completar el recurso de Imagen o Video y su recorte adaptable.",
      section: "multimedia",
      complete: media.detail.cropReady,
      priority: "essential",
    },
    ...backgroundItem,
    {
      id: "gallery-minimum",
      label: "Galería · recursos y recortes",
      detail: "La Galería debe contener al menos un recurso y confirmar cada encuadre.",
      section: "multimedia",
      complete: media.gallery.cropReady,
      priority: "essential",
    },
    {
      id: "media-accessibility",
      label: "Accesibilidad multimedia contextual",
      detail: "Portada, Card cuando muestra imagen y cada elemento interactivo de Galería tienen texto específico. Hero, Fondo y capas decorativas no bloquean este control.",
      section: "multimedia",
      complete: hasCompleteContextualMediaAccessibility(game),
      priority: "recommended",
    },
    {
      id: "downloads",
      label: "Fuente de descarga",
      detail: "Configura al menos una fuente visible si este juego debe ofrecer descarga.",
      section: "descargas",
      complete: hasVisibleDownload(game),
      priority: "recommended",
    },
    {
      id: "distribution-integrity",
      label: "Integridad de distribución",
      detail: "Canal y SHA-256 documentan qué paquete corresponde a esta revisión y permiten verificar que todos los mirrors entreguen los mismos bytes.",
      section: "descargas",
      complete:
        hasCompleteDistributionIntegrity(
          game
        ),
      priority: "recommended",
    },
    {
      id: "editorial-rating",
      label: "Valoración editorial",
      detail: "La valoración editorial es independiente de la comunidad y del Índice DeUna.",
      section: "valoracion",
      complete: typeof game.rating === "number" &&
        Number.isFinite(game.rating) &&
        game.rating >= 0 &&
        game.rating <= 5,
      priority: "recommended",
    },
  ];

  const completed = items.filter((item) => item.complete).length;
  const essentialsReady = items
    .filter((item) => item.priority === "essential")
    .every((item) => item.complete);
  const recommendedMissing = items.filter(
    (item) => item.priority === "recommended" && !item.complete
  ).length;

  return {
    items,
    completed,
    total: items.length,
    percentage: Math.round((completed / items.length) * 100),
    essentialsReady,
    recommendedMissing,
  };
}
