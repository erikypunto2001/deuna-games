import Link from "next/link";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Gauge,
  HardDrive,
  ImageIcon,
  Monitor,
  Rocket,
  ShieldCheck,
  Star,
} from "lucide-react";
import { notFound } from "next/navigation";

import GameDetailContainerMedia from "@/components/games/GameDetailContainerMedia";
import GameGalleryVideo from "@/components/games/GameGalleryVideo";
import GameCoverMedia from "@/components/ui/GameCoverMedia";
import GameMedia from "@/components/ui/GameMedia";
import UniversalGameCardBase from "@/components/ui/UniversalGameCardBase";
import GamePerformanceEstimate from "@/features/game-finder/GamePerformanceEstimate";
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
  resolveGameDownload,
} from "@/lib/games/download";
import {
  getGameGalleryAccessibleFallback,
} from "@/lib/media/game-media-accessibility";
import {
  galleryImageViewport,
  galleryVideoAspectRatio,
  resolvePublicGameGalleryItems,
} from "@/lib/media/game-gallery-media";
import {
  resolveGameDestinationImage,
  resolveGameDestinationMediaMode,
} from "@/lib/media/game-video-media";
import {
  resolveGameImageCropAspectRatio,
} from "@/lib/media/image-viewport";
import type {
  GameDownloadSourceStatus,
  GameHardwareRequirements,
} from "@/types/game";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type RequirementRow = {
  label: string;
  minimum?: string;
  recommended?: string;
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

function legacyMinimum(
  requirements: GameHardwareRequirements | undefined
) {
  if (!requirements) return undefined;

  const minimum: GameHardwareRequirements = {
    system: requirements.system,
    processor: requirements.processor,
    ram: requirements.ram,
    graphics: requirements.graphics,
    storage: requirements.storage,
  };

  return Object.values(minimum).some(Boolean)
    ? minimum
    : undefined;
}

function buildRequirementRows(
  minimum: GameHardwareRequirements | undefined,
  recommended: GameHardwareRequirements | undefined
): RequirementRow[] {
  const fields: Array<{
    key: keyof GameHardwareRequirements;
    label: string;
  }> = [
    { key: "system", label: "Sistema operativo" },
    { key: "processor", label: "Procesador" },
    { key: "ram", label: "Memoria RAM" },
    { key: "graphics", label: "Gráficos" },
    { key: "storage", label: "Almacenamiento" },
  ];

  return fields
    .map(({ key, label }) => ({
      label,
      minimum: minimum?.[key],
      recommended: recommended?.[key],
    }))
    .filter(
      (row) => row.minimum || row.recommended
    );
}

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

  const game = item.payload;
  const download = resolveGameDownload(game);
  const requirements = game.requirements;
  const minimum =
    requirements?.minimum ??
    legacyMinimum(requirements);
  const recommended = requirements?.recommended;
  const requirementRows = buildRequirementRows(
    minimum,
    recommended
  );
  const detailImage = resolveGameDestinationImage(game, "detail");
  const detailImageViewport = game.imageMedia?.detail ??
    (!game.detailImage
      ? game.heroImage
        ? game.imageMedia?.hero
        : game.imageMedia?.cover
      : undefined);
  const detailMode = resolveGameDestinationMediaMode(game, "detail");
  const gallery = resolvePublicGameGalleryItems(game);
  const galleryHasVideo = gallery.some((item) => item.kind === "video");
  const platforms = game.platforms ?? [];
  const platformLabel = platforms.length
    ? platforms.join(", ")
    : "A confirmar";
  const distributionChannelLabel = download?.channel
    ? distributionChannelLabels[download.channel]
    : "A confirmar";
  const genres =
    game.genres?.length
      ? game.genres
      : [game.category];
  const visibleTags = Array.from(
    new Set([
      ...genres,
      ...(game.tags ?? []),
    ])
  )
    .filter((tag) => tag !== game.category)
    .slice(0, 5);
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

      <section className={styles.hero}>
        <div className={styles.heroBackground} aria-hidden="true">
          <GameDetailContainerMedia
            mode={detailMode}
            imageSrc={detailImage}
            imageViewport={detailImageViewport}
            video={game.videoMedia?.detail}
          />
          <div className={styles.heroShade} />
        </div>

        <div className={styles.heroInner}>
          <div className={styles.cover}>
            <GameCoverMedia game={game} sizes="220px" />
          </div>

          <div className={styles.heroCopy}>
            <div className={styles.chips}>
              <span>{game.category}</span>
              {platforms.map((platform) => (
                <span key={platform}>{platform}</span>
              ))}
            </div>

            <h2>{game.title}</h2>

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
        </div>
      </section>

      <section className={styles.factGrid}>
        <article>
          <Monitor size={18} aria-hidden="true" />
          <span>Plataformas</span>
          <strong>{platformLabel}</strong>
        </article>
        <article>
          <Gauge size={18} aria-hidden="true" />
          <span>Versión</span>
          <strong>{game.version ?? "A confirmar"}</strong>
        </article>
        <article>
          <HardDrive size={18} aria-hidden="true" />
          <span>Tamaño</span>
          <strong>
            {download?.sizeGb
              ? `${download.sizeGb} GB`
              : minimum?.storage ?? "A confirmar"}
          </strong>
        </article>
        <article>
          <Download size={18} aria-hidden="true" />
          <span>Fuentes visibles</span>
          <strong>{sources.length}</strong>
        </article>
        <article>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Canal</span>
          <strong>{distributionChannelLabel}</strong>
        </article>
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
          calibration={game.performance ?? null}
          metadata={game.performanceMetadata ?? null}
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
                {game.ageRating
                  ? `${game.ageRating.system} · ${game.ageRating.rating}`
                  : "Sin definir"}
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

      <section className={styles.twoColumns}>
        <article className={styles.panel}>
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
              <div className={styles.gallery}>
                {gallery.map((item, index) => {
                  const accessibleLabel = getGameGalleryAccessibleFallback(
                    game,
                    item,
                    index
                  );

                  if (item.kind === "image") {
                    const viewport = galleryImageViewport(game, item);
                    return (
                      <figure
                        key={`image:${item.src}`}
                        className={styles.galleryItem}
                        style={{
                          aspectRatio: resolveGameImageCropAspectRatio(viewport),
                        }}
                      >
                        <GameMedia
                          src={item.src}
                          alt={accessibleLabel}
                          sizes="(max-width: 900px) 50vw, 240px"
                          viewport={viewport}
                        />
                      </figure>
                    );
                  }

                  return (
                    <figure
                      key={`video:${item.src}`}
                      className={styles.galleryItem}
                      style={{
                        aspectRatio: galleryVideoAspectRatio(item.viewport),
                      }}
                    >
                      <GameGalleryVideo
                        src={item.src}
                        viewport={item.viewport}
                        label={accessibleLabel}
                      />
                    </figure>
                  );
                })}
              </div>
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
      </section>
    </>
  );
}
