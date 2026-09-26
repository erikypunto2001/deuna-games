import Link from "next/link";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Gamepad2,
  HardDrive,
  ImageIcon,
  Monitor,
  RefreshCcw,
  Rocket,
  Star,
} from "lucide-react";
import { notFound } from "next/navigation";

import GameHeroDestinationPreview from "@/components/admin/GameHeroDestinationPreview";
import GameDetailBackgroundMedia from "@/components/games/GameDetailBackgroundMedia";
import GameDetailGalleryGrid from "@/components/games/GameDetailGalleryGrid";
import GameDetailHeroFrame from "@/components/games/GameDetailHeroFrame";
import UniversalGameCardBase from "@/components/ui/UniversalGameCardBase";
import GamePerformanceEstimate from "@/features/game-finder/GamePerformanceEstimate";
import {
  buildHomeGameCollections,
} from "@/data/home";
import {
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  getGamePublicationState,
} from "@/lib/admin/publication-service";
import {
  verifyAdminSession,
} from "@/lib/admin/session";
import {
  resolveGameDetailPresentation,
} from "@/lib/games/game-detail-presentation";
import {
  resolvePcRelease,
} from "@/lib/games/releases";
import {
  getPublicGames,
} from "@/lib/games/public-catalog";
import {
  getPublicHomeConfig,
} from "@/lib/home/public-home-config";
import {
  resolvePublicGameGalleryItems,
} from "@/lib/media/game-gallery-media";
import {
  resolveGameBackgroundMediaMode,
} from "@/lib/media/game-media-requirements";
import type {
  GameDownloadSourceStatus,
} from "@/types/game";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const downloadStatusLabels: Record<
  GameDownloadSourceStatus,
  string
> = {
  available: "Disponible",
  down: "Caído",
  maintenance: "Mantenimiento",
};

const distributionChannelLabels = {
  stable: "Estable",
  beta: "Beta",
  testing: "Pruebas",
} as const;

function downloadHost(href: string) {
  if (href.startsWith("/")) return "Ruta interna";

  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "Dirección configurada";
  }
}

export default async function AdminGamePreviewPage({
  params,
}: PageProps) {
  await verifyAdminSession();
  const { slug } = await params;
  const item = await getEditorialItem("game", slug);

  if (!item) notFound();

  let publicationState = null;

  try {
    publicationState =
      await getGamePublicationState(slug);
  } catch {
    console.error(
      "No se pudo leer el estado de publicación del juego."
    );
  }

  const [publicGames, publicHomeConfig] = await Promise.all([
    getPublicGames(),
    getPublicHomeConfig(),
  ]);
  const game = item.payload;
  const pcRelease =
    resolvePcRelease(
      game
    );
  const publicHeroGames = buildHomeGameCollections(
    publicGames,
    publicHomeConfig
  ).heroGames;
  const heroPreviewGames = [
    game,
    ...publicHeroGames.filter(
      (candidate) => candidate.slug !== game.slug
    ),
  ].slice(0, Math.max(1, publicHeroGames.length));
  const heroIsCurrentlyFeatured = publicHeroGames.some(
    (candidate) => candidate.slug === game.slug
  );
  const {
    download,
    requirementRows,
    platforms,
    platformLabel,
    genres,
    genreSummaryLabel,
    ageRatingLabel,
    visibleTags,
    sizeLabel,
    versionLabel,
  } = resolveGameDetailPresentation(game);
  const gallery = resolvePublicGameGalleryItems(game);
  const backgroundMode = resolveGameBackgroundMediaMode(game);
  const galleryHasVideo = gallery.some((item) => item.kind === "video");
  const distributionChannelLabel = download?.channel
    ? distributionChannelLabels[download.channel]
    : "A confirmar";
  const sources = download?.sources ?? [];
  const publicationHref =
    `/admin/juegos/${encodeURIComponent(slug)}/publicacion`;
  const publicGameHref = `/juegos/${encodeURIComponent(slug)}`;

  return (
    <>
      <div className={styles.topbar}>
        <Link
          href={`/admin/juegos/${encodeURIComponent(slug)}`}
          className={styles.backLink}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Volver al editor
        </Link>

        {publicationState?.publicVisible ? (
          <Link
            href={publicGameHref}
            className={styles.publicLink}
            target="_blank"
            rel="noreferrer"
          >
            Ficha pública actual
            <ExternalLink size={14} aria-hidden="true" />
          </Link>
        ) : (
          <Link
            href={publicationHref}
            className={styles.publicLink}
          >
            Revisar publicación
            <Rocket size={14} aria-hidden="true" />
          </Link>
        )}
      </div>

      <header className={styles.previewHeader}>
        <div>
          <span>VISTA PREVIA EDITORIAL</span>
          <h1>{game.title}</h1>
          <p>
            Esta pantalla usa el borrador de PostgreSQL, no el contenido público actual. Publicar, ocultar y restaurar se gestionan únicamente desde la pestaña Publicación.
          </p>
        </div>
        <div className={styles.revisionState}>
          <strong>Revisión {item.revision}</strong>
          <span>
            {!publicationState
              ? "Estado público no disponible"
              : !publicationState.publicVisible
                ? "No visible en la web"
                : publicationState.hasUnpublishedChanges
                  ? "Cambios sin publicar"
                  : "Coincide con la publicación"}
          </span>
        </div>
      </header>

      <GameDetailHeroFrame
        game={game}
        ariaLabelledby="preview-game-title"
        className={styles.heroPreview}
      >
        <div className={styles.heroCopy}>
            <div className={styles.chips}>
              <span>{game.category}</span>
              {platforms.map((platform) => (
                <span key={platform}>{platform}</span>
              ))}
            </div>

            <h2 id="preview-game-title">{game.title}</h2>

            {visibleTags.length > 0 && (
              <div className={styles.tags}>
                {visibleTags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}

            <p>{game.description}</p>

            {(game.rating || game.reviews) && (
              <div className={styles.rating}>
                <Star
                  size={17}
                  fill="currentColor"
                  aria-hidden="true"
                />
                {game.rating && <strong>{game.rating}</strong>}
                {game.reviews && (
                  <span>{game.reviews} valoraciones</span>
                )}
              </div>
            )}
        </div>
      </GameDetailHeroFrame>

      {backgroundMode && (
        <section
          className={styles.panel}
          aria-labelledby="background-preview-title"
          data-game-detail-background-preview="true"
        >
          <div className={styles.sectionHeading}>
            <span>FONDO DE LA FICHA · BORRADOR</span>
            <h2 id="background-preview-title">
              Salida pública adaptable
            </h2>
          </div>
          <p className={styles.backgroundPreviewSummary}>
            Estas ventanas montan la misma capa multimedia, recorte, color y
            sombra que usa la ficha pública. El video también respeta
            reduced-motion, visibilidad de pestaña y fallback de error.
          </p>
          <div className={styles.backgroundPreviewGrid}>
            <div className={styles.backgroundPreviewItem}>
              <span>Escritorio</span>
              <div
                className={`${styles.backgroundPreviewFrame} ${styles.backgroundDesktopFrame}`}
              >
                <GameDetailBackgroundMedia game={game} sizes="900px" />
              </div>
            </div>
            <div className={styles.backgroundPreviewItem}>
              <span>Móvil</span>
              <div
                className={`${styles.backgroundPreviewFrame} ${styles.backgroundMobileFrame}`}
              >
                <GameDetailBackgroundMedia
                  game={game}
                  sizes="220px"
                  mobilePreview
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <dl
        className={styles.factGrid}
        aria-label="Información pública resumida"
      >
        <div>
          <dt>
            <Gamepad2 size={18} aria-hidden="true" />
            <span>Género</span>
          </dt>
          <dd>{genreSummaryLabel}</dd>
        </div>
        <div>
          <dt>
            <Monitor size={18} aria-hidden="true" />
            <span>Plataforma</span>
          </dt>
          <dd>{platformLabel}</dd>
        </div>
        <div>
          <dt>
            <RefreshCcw size={18} aria-hidden="true" />
            <span>Versión</span>
          </dt>
          <dd>{versionLabel}</dd>
        </div>
        <div>
          <dt>
            <HardDrive size={18} aria-hidden="true" />
            <span>Almacenamiento</span>
          </dt>
          <dd>{sizeLabel}</dd>
        </div>
      </dl>

      <section
        className={`${styles.panel} ${styles.heroDestinationPreviewPanel}`}
        aria-labelledby="public-hero-preview-title"
        data-game-hero-public-preview="true"
      >
        <div className={styles.sectionHeading}>
          <span>HERO DE INICIO · BORRADOR DEL JUEGO</span>
          <h2 id="public-hero-preview-title">
            Renderer público real en los tres viewports
          </h2>
        </div>
        <p className={styles.heroDestinationPreviewSummary}>
          Esta vista monta el mismo HeroSection de la Home con la
          configuración pública efectiva de Inicio. El primer slide usa esta
          revisión privada del juego; los laterales, cuando existen, usan
          snapshots ya publicados sólo para conservar el contexto visual.
        </p>
        <p className={styles.heroDestinationPreviewContext}>
          {heroIsCurrentlyFeatured
            ? "El juego ya forma parte del Hero público actual; aquí queda enfocado para revisar su destino 3:1 sin cambiar la curaduría."
            : "El juego no forma parte del Hero público actual; se coloca primero únicamente para validar cómo quedaría su destino 3:1 antes de decidir cualquier cambio de curaduría."}
        </p>
        <GameHeroDestinationPreview
          games={heroPreviewGames}
          presentation={publicHomeConfig.heroPresentation}
        />
        <p className={styles.heroDestinationPreviewFootnote}>
          Video, Imagen + hover, reduced motion, foco, visibilidad de pestaña,
          recorte y fallback siguen el runtime público. Esta vista no publica
          el juego ni modifica Inicio.
        </p>
      </section>

      <section
        className={`${styles.panel} ${styles.cardPreviewPanel}`}
        aria-labelledby="public-card-preview-title"
      >
        <div className={styles.sectionHeading}>
          <span>CARD PÚBLICA · BORRADOR</span>
          <h2 id="public-card-preview-title">
            Renderer real antes de publicar
          </h2>
        </div>
        <div className={styles.cardPreviewLayout}>
          <div className={styles.cardPreviewCopy}>
            <p>
              Esta previsualización monta el mismo renderer base que usan las Cards públicas. Portada 4:5, Card 3:2, hover, foco, touch, recortes y video se resuelven desde este borrador sin modificar el snapshot publicado.
            </p>
            <p>
              El enlace de la Card conserva el destino público real; si ya existe una publicación, al abrirlo verás el snapshot público actual, no estos cambios de borrador.
            </p>
          </div>
          <div className={styles.cardPreviewFrame}>
            <UniversalGameCardBase
              game={game}
              variant="standard"
              primaryAction={{
                href: publicGameHref,
                ariaLabel: `Abrir la ficha pública actual de ${game.title}`,
              }}
            />
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <span>RENDIMIENTO DEL BORRADOR</span>
          <h2>FPS estimados antes de publicar</h2>
        </div>
        <p>
          Este cálculo usa la calibración y procedencia de esta revisión privada. No modifica ni expone esos datos públicamente hasta que confirmes una publicación nueva.
        </p>
        <GamePerformanceEstimate
          slug={game.slug}
          calibration={
            pcRelease?.performance ??
            null
          }
          metadata={
            pcRelease?.performanceMetadata ??
            null
          }
        />
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.panel}>
          <div className={styles.sectionHeading}>
            <span>INFORMACIÓN</span>
            <h2>Datos de la ficha</h2>
          </div>

          <dl className={styles.details}>
            <div>
              <dt>Desarrollador</dt>
              <dd>{game.developer ?? "Sin definir"}</dd>
            </div>
            <div>
              <dt>Editor</dt>
              <dd>{game.publisher ?? "Sin definir"}</dd>
            </div>
            <div>
              <dt>Lanzamiento</dt>
              <dd>{game.releaseDate ?? "Sin definir"}</dd>
            </div>
            <div>
              <dt>Géneros</dt>
              <dd>{genres.join(", ")}</dd>
            </div>
            <div>
              <dt>Clasificación etaria</dt>
              <dd>
                {ageRatingLabel ?? "Sin definir"}
              </dd>
            </div>
            {game.ageRating?.descriptors?.length ? (
              <div>
                <dt>Descriptores</dt>
                <dd>{game.ageRating.descriptors.join(", ")}</dd>
              </div>
            ) : null}
          </dl>
        </article>

        <article className={styles.panel}>
          <div className={styles.sectionHeading}>
            <span>PUBLICACIÓN</span>
            <h2>Estado del borrador</h2>
          </div>

          <div className={styles.publishGate}>
            <strong>
              {!publicationState
                ? "No se pudo leer el estado de publicación."
                : !publicationState.publicVisible
                  ? "Este borrador no está visible públicamente."
                  : publicationState.hasUnpublishedChanges
                    ? "La web mantiene el snapshot anterior."
                    : "El borrador coincide con la publicación actual."}
            </strong>
            <p>
              Esta vista sirve únicamente para revisar el contenido. La publicación es una acción explícita y separada para evitar cambios públicos accidentales.
            </p>
            <Link
              href={publicationHref}
              className={styles.publicLink}
            >
              Ir a Publicación
              <Rocket size={14} aria-hidden="true" />
            </Link>
          </div>
        </article>
      </section>

      {requirementRows.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <span>REQUISITOS</span>
            <h2>Comparación del sistema</h2>
          </div>

          <div className={styles.requirementsTable}>
            <div className={styles.requirementsHead}>
              <strong>Componente</strong>
              <strong>Mínimo</strong>
              <strong>Recomendado</strong>
            </div>
            {requirementRows.map((row) => (
              <div
                key={row.label}
                className={styles.requirementsRow}
              >
                <strong>{row.label}</strong>
                <span>{row.minimum ?? "—"}</span>
                <span>{row.recommended ?? "—"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <article
        className={styles.panel}
        data-game-detail-gallery-preview="true"
      >
        <div className={styles.sectionHeading}>
          <span>MULTIMEDIA</span>
          <h2>Galería del borrador</h2>
        </div>

        {gallery.length > 0 ? (
          <>
            <p className={styles.gallerySummary}>
              {galleryHasVideo
                ? "Capturas y videos con el mismo orden, recorte y renderer de la ficha pública."
                : "Imágenes con el mismo orden, recorte y renderer de la ficha pública."}
            </p>
            <GameDetailGalleryGrid game={game} gallery={gallery} />
          </>
        ) : (
          <div className={styles.emptyState}>
            <ImageIcon size={22} aria-hidden="true" />
            No hay capturas ni videos configurados.
          </div>
        )}
      </article>

      <article className={styles.panel}>
        <div className={styles.sectionHeading}>
          <span>DESCARGAS</span>
          <h2>Paquete y fuentes visibles</h2>
        </div>

        <dl className={styles.details}>
          <div>
            <dt>Canal</dt>
            <dd>{distributionChannelLabel}</dd>
          </div>
          <div>
            <dt>SHA-256</dt>
            <dd style={{ overflowWrap: "anywhere" }}>
              {download?.checksumSha256 ?? "Sin definir"}
            </dd>
          </div>
        </dl>

        {sources.length > 0 ? (
          <div className={styles.sources}>
            {sources.map((source) => (
              <div key={source.id}>
                <div>
                  <strong>{source.name}</strong>
                  <span>{downloadHost(source.href)}</span>
                </div>
                <span>
                  {downloadStatusLabels[source.status]} · {source.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Download size={22} aria-hidden="true" />
            No hay fuentes activas en este borrador.
          </div>
        )}
      </article>
    </>
  );
}
