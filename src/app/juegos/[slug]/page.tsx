import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Download,
  Gamepad2,
  Gauge,
  HardDrive,
  House,
  Info,
  Monitor,
  RefreshCcw,
  ShieldCheck,
  Star,
  Wrench,
} from "lucide-react";

import GameDetailGalleryGrid from "@/components/games/GameDetailGalleryGrid";
import GameDetailHeroFrame from "@/components/games/GameDetailHeroFrame";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import UniversalGameCard from "@/components/ui/UniversalGameCard";
import GamePerformanceEstimate from "@/features/game-finder/GamePerformanceEstimate";
import {
  getAccountGamePreference,
} from "@/lib/accounts/personalization-service";
import {
  readAccountSession,
} from "@/lib/accounts/session";
import {
  resolveGameDetailPresentation,
} from "@/lib/games/game-detail-presentation";
import {
  resolveGameReleaseDownloads,
} from "@/lib/games/download";
import {
  getPublicGameBySlug,
  getPublicGames,
} from "@/lib/games/public-catalog";
import {
  platformLabel as resolvePlatformLabel,
} from "@/lib/games/releases";
import {
  getPublicPlatformCatalog,
} from "@/lib/platforms/public-platform-catalog";
import {
  getPublicSoftware,
} from "@/lib/software/public-software";
import {
  resolvePublicGameGalleryItems,
} from "@/lib/media/game-gallery-media";
import {
  absoluteUrl,
} from "@/lib/site";
import {
  getPublicSiteConfig,
} from "@/lib/site/public-site-config";
import { safeJsonLd } from "@/lib/safe-json-ld";
import {
  getPublicUpdatesForGame,
} from "@/lib/updates/public-updates";
import GameAccountActions from "./GameAccountActions";
import GameCompatibilityCard from "./GameCompatibilityCard";
import styles from "./page.module.css";

type GameDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: GameDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [game, publicSiteConfig] = await Promise.all([
    getPublicGameBySlug(slug),
    getPublicSiteConfig(),
  ]);

  if (!game) {
    return {
      title: "Juego no encontrado",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = game.title;
  const description = game.description;
  const image = game.heroImage ?? game.coverImage;
  const imageAlt = game.heroImage
    ? game.mediaAccessibility?.hero ?? game.imageAlt
    : game.mediaAccessibility?.cover ?? game.imageAlt;

  return {
    title,
    description,
    alternates: {
      canonical: `/juegos/${game.slug}`,
    },
    openGraph: {
      title: `${title} | ${publicSiteConfig.name}`,
      description,
      url: `/juegos/${game.slug}`,
      type: "website",
      images: image
        ? [
            {
              url: image,
              alt: imageAlt,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${publicSiteConfig.name}`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function GameDetailPage({
  params,
}: GameDetailPageProps) {
  const { slug } = await params;
  const [
    game,
    games,
    gameUpdates,
    publicSiteConfig,
    accountSession,
    platformCatalog,
    publicSoftware,
  ] = await Promise.all([
    getPublicGameBySlug(slug),
    getPublicGames(),
    getPublicUpdatesForGame(slug),
    getPublicSiteConfig(),
    readAccountSession(),
    getPublicPlatformCatalog(),
    getPublicSoftware(),
  ]);

  if (!game) {
    notFound();
  }

  const accountPreference = accountSession
    ? await getAccountGamePreference(
        accountSession.userId,
        game.slug
      )
    : null;
  const {
    download,
    minimum,
    recommended,
    requirementRows,
    platforms,
    platformIds,
    releases,
    pcRelease,
    platformLabel: legacyPlatformLabel,
    genres,
    genreSummaryLabel,
    ageRatingLabel,
    visibleTags,
    sizeLabel,
    versionLabel,
  } = resolveGameDetailPresentation(game);
  const recentGameUpdates = gameUpdates.slice(0, 3);
  const platformNames =
    platformIds.map(
      (platformId) =>
        resolvePlatformLabel(
          platformCatalog,
          platformId
        )
    );
  const platformLabel =
    platformNames.length
      ? platformNames.join(", ")
      : legacyPlatformLabel;
  const softwareBySlug =
    new Map(
      publicSoftware.map(
        (item) => [
          item.slug,
          item,
        ]
      )
    );
  const releaseCards =
    releases.map(
      (release) => ({
        release,
        platform:
          resolvePlatformLabel(
            platformCatalog,
            release.platformId
          ),
        downloads:
          resolveGameReleaseDownloads(
            game,
            release.id
          ),
        software:
          (
            release.recommendedSoftwareSlugs ??
            []
          )
            .map(
              (softwareSlug) =>
                softwareBySlug.get(
                  softwareSlug
                )
            )
            .filter(
              (
                item
              ): item is NonNullable<
                typeof item
              > =>
                Boolean(item)
            ),
      })
    );
  const downloadableReleases =
    releaseCards.filter(
      (item) =>
        item.downloads.length > 0
    );

  const relatedGames = games
    .filter(
      (candidate) =>
        candidate.slug !== game.slug &&
        candidate.category === game.category
    )
    .slice(0, 4);

  const gallery = resolvePublicGameGalleryItems(game);
  const galleryHasVideo = gallery.some((item) => item.kind === "video");

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: absoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Juegos",
        item: absoluteUrl("/juegos"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: game.title,
        item: absoluteUrl(`/juegos/${game.slug}`),
      },
    ],
  };

  const gameJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    description: game.description,
    url: absoluteUrl(`/juegos/${game.slug}`),
    image: game.coverImage
      ? absoluteUrl(game.coverImage)
      : undefined,
    genre: genres,
    gamePlatform:
      platformNames.length
        ? platformNames
        : platforms.length
          ? platforms
          : undefined,
    contentRating: ageRatingLabel ?? undefined,
    operatingSystem:
      minimum?.system ??
      recommended?.system,
    inLanguage: publicSiteConfig.language,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(gameJsonLd),
        }}
      />

      <Header />

      <main
        id="main-content"
        className={styles.main}
      >
        <nav
          className={styles.breadcrumb}
          aria-label="Migas de pan"
        >
          <Link href="/">
            <House size={14} aria-hidden="true" />
            Inicio
          </Link>
          <ChevronRight size={14} aria-hidden="true" />
          <Link href="/juegos">Juegos</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">{game.title}</span>
        </nav>

        <GameDetailHeroFrame game={game} ariaLabelledby="game-title">
          <div className={styles.heroContent}>
              <span className={styles.heroEyebrow}>
                FICHA DEL JUEGO
              </span>

              <div className={styles.heroBadges}>
                <span className={styles.category}>
                  {game.category}
                </span>
                {platformNames.map((platform) => (
                  <span
                    key={platform}
                    className={styles.platformBadge}
                  >
                    {platform}
                  </span>
                ))}
              </div>

              <h1 id="game-title">{game.title}</h1>

              {visibleTags.length > 0 && (
                <div className={styles.tagList}>
                  {visibleTags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}

              <p className={styles.description}>
                {game.description}
              </p>

              {(game.rating || game.reviews) && (
                <div
                  className={styles.heroRating}
                  aria-label="Valoración registrada"
                >
                  <Star
                    size={18}
                    fill="currentColor"
                    aria-hidden="true"
                  />
                  {game.rating && <strong>{game.rating}</strong>}
                  {game.reviews && (
                    <span>{game.reviews} valoraciones</span>
                  )}
                </div>
              )}

              {pcRelease && (
                <GamePerformanceEstimate slug={game.slug} />
              )}

              <GameAccountActions
                gameSlug={game.slug}
                signedIn={accountSession !== null}
                preference={accountPreference
                  ? {
                      favorite: accountPreference.favorite,
                      libraryState: accountPreference.libraryState,
                      followUpdates: accountPreference.followUpdates,
                    }
                  : null}
              />

              <div className={styles.actions}>
                {downloadableReleases.length > 0 ? (
                  <>
                    <Link
                      href="#releases"
                      className={styles.primaryAction}
                    >
                      <Download size={18} aria-hidden="true" />
                      Ver descargas
                    </Link>
                    <Link
                      href="#compatibility"
                      className={styles.secondaryAction}
                    >
                      <Monitor size={18} aria-hidden="true" />
                      Ver compatibilidad
                    </Link>
                  </>
                ) : (
                  <Link
                    href="#compatibility"
                    className={styles.primaryAction}
                  >
                    <Monitor size={18} aria-hidden="true" />
                    ¿Me funciona?
                  </Link>
                )}
              </div>
          </div>
        </GameDetailHeroFrame>

        <section
          className={styles.overviewBar}
          aria-labelledby="overview-title"
        >
          <div className={styles.overviewHeading}>
            <span>INFORMACIÓN DEL JUEGO</span>
            <h2 id="overview-title">
              Lo esencial, en un solo lugar
            </h2>
          </div>

          <dl className={styles.overviewFacts}>
            <div>
              <span className={styles.overviewIcon}>
                <Gamepad2 size={18} aria-hidden="true" />
              </span>
              <div>
                <dt>Género</dt>
                <dd>{genreSummaryLabel}</dd>
              </div>
            </div>
            <div>
              <span className={styles.overviewIcon}>
                <Monitor size={18} aria-hidden="true" />
              </span>
              <div>
                <dt>Plataforma</dt>
                <dd>{platformLabel}</dd>
              </div>
            </div>
            <div>
              <span className={styles.overviewIcon}>
                <RefreshCcw size={18} aria-hidden="true" />
              </span>
              <div>
                <dt>Versión</dt>
                <dd>{versionLabel}</dd>
              </div>
            </div>
            <div>
              <span className={styles.overviewIcon}>
                <HardDrive size={18} aria-hidden="true" />
              </span>
              <div>
                <dt>Almacenamiento</dt>
                <dd>{sizeLabel}</dd>
              </div>
            </div>
          </dl>
        </section>

        <nav
          className={styles.sectionNav}
          aria-label="Secciones del juego"
        >
          <a href="#information"><Info size={16} aria-hidden="true" />Información</a>
          <a href="#compatibility"><Gauge size={16} aria-hidden="true" />Compatibilidad</a>
          {requirementRows.length > 0 && (
            <a href="#requirements"><Monitor size={16} aria-hidden="true" />Requisitos</a>
          )}
          {gallery.length > 0 && (
            <a href="#gallery"><Gamepad2 size={16} aria-hidden="true" />Galería</a>
          )}
          {download && (
            <a href="#installation"><Download size={16} aria-hidden="true" />Instalación</a>
          )}
          {recentGameUpdates.length > 0 && (
            <a href="#versions"><RefreshCcw size={16} aria-hidden="true" />Versiones</a>
          )}
        </nav>

        <section
          id="information"
          className={styles.informationLayout}
          aria-labelledby="game-info-title"
        >
          <article className={styles.informationPanel}>
            <div className={styles.sectionHeading}>
              <span>INFORMACIÓN</span>
              <h2 id="game-info-title">Una mirada completa</h2>
            </div>

            <p className={styles.longDescription}>
              {game.description}
            </p>

            <p className={styles.informationNote}>
              Consulta los datos principales, revisa la compatibilidad de tu equipo y accede a las versiones publicadas desde una sola ficha.
            </p>

            <dl className={styles.detailList}>
              {game.developer && (
                <div><dt>Desarrollador</dt><dd>{game.developer}</dd></div>
              )}
              {game.publisher && (
                <div><dt>Editor</dt><dd>{game.publisher}</dd></div>
              )}
              {game.releaseDate && (
                <div><dt>Lanzamiento</dt><dd>{game.releaseDate}</dd></div>
              )}
              <div><dt>Género</dt><dd>{genres.join(", ")}</dd></div>
              <div><dt>Plataforma</dt><dd>{platformLabel}</dd></div>
              {ageRatingLabel && (
                <div><dt>Clasificación etaria</dt><dd>{ageRatingLabel}</dd></div>
              )}
              {game.ageRating?.descriptors?.length ? (
                <div>
                  <dt>Descriptores</dt>
                  <dd>{game.ageRating.descriptors.join(", ")}</dd>
                </div>
              ) : null}
            </dl>
          </article>

          <div
            id="compatibility"
            className={styles.compatibilityAnchor}
          >
            <GameCompatibilityCard
              slug={game.slug}
              supportsPc={Boolean(pcRelease)}
            />
          </div>
        </section>

        {requirementRows.length > 0 && (
          <section
            id="requirements"
            className={styles.sectionPanel}
            aria-labelledby="requirements-title"
          >
            <div className={styles.sectionHeading}>
              <span>REQUISITOS</span>
              <h2 id="requirements-title">Requisitos del sistema</h2>
              <p className={styles.sectionDescription}>
                Compara los valores mínimos y recomendados antes de instalar el juego.
              </p>
            </div>

            <div className={styles.requirementsTableWrap}>
              <table className={styles.requirementsTable}>
                <thead>
                  <tr>
                    <th scope="col">Componente</th>
                    <th scope="col">Mínimos</th>
                    <th scope="col">Recomendados</th>
                  </tr>
                </thead>
                <tbody>
                  {requirementRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td data-label="Mínimos">
                        {row.minimum ?? "Sin dato"}
                      </td>
                      <td data-label="Recomendados">
                        {row.recommended ?? "Sin dato"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {gallery.length > 0 && (
          <section
            id="gallery"
            className={styles.sectionPanel}
            aria-labelledby="gallery-title"
          >
            <div className={styles.sectionHeading}>
              <span>GALERÍA</span>
              <h2 id="gallery-title">
                {galleryHasVideo
                  ? "Capturas y videos"
                  : gallery.length > 1
                    ? "Capturas e imágenes"
                    : "Imagen destacada"}
              </h2>
            </div>

            <GameDetailGalleryGrid game={game} gallery={gallery} />
          </section>
        )}

        {releaseCards.length > 0 && (
          <section
            id="releases"
            className={styles.sectionPanel}
            aria-labelledby="releases-title"
          >
            <div className={styles.sectionHeading}>
              <span>VERSIONES Y PLATAFORMAS</span>
              <h2 id="releases-title">
                Elige cómo quieres jugar
              </h2>
              <p className={styles.sectionDescription}>
                Cada plataforma conserva su propia versión, paquete y herramientas relacionadas. Los requisitos y FPS se muestran sólo para PC.
              </p>
            </div>

            <div className={styles.releaseGrid}>
              {releaseCards.map((item) => {
                const primaryDownload =
                  item.downloads.find(
                    (candidate) =>
                      candidate.sources.some(
                        (source) =>
                          source.status ===
                          "available"
                      )
                  ) ??
                  item.downloads[0];
                const format =
                  primaryDownload?.packageKind
                    ?.toUpperCase();
                const downloadLabel =
                  primaryDownload?.packageKind ===
                  "iso"
                    ? "Descargar ISO"
                    : item.release.platformId ===
                        "pc-windows"
                      ? "Descargar PC"
                      : "Descargar " +
                        item.platform;

                return (
                  <article
                    key={item.release.id}
                    className={styles.releaseCard}
                  >
                    <div className={styles.releaseCardHeader}>
                      <div>
                        <span>{item.platform}</span>
                        <strong>
                          {item.release.label ??
                            item.platform}
                        </strong>
                      </div>
                      {format && (
                        <span className={styles.releaseFormat}>
                          {format}
                        </span>
                      )}
                    </div>

                    <div className={styles.releaseMeta}>
                      <span>
                        Versión{" "}
                        {item.release.version ??
                          "a confirmar"}
                      </span>
                      {item.release.region && (
                        <span>
                          Región{" "}
                          {item.release.region}
                        </span>
                      )}
                    </div>

                    <div className={styles.releaseActions}>
                      {primaryDownload && (
                        <Link
                          href={
                            `/juegos/${game.slug}/descargar?release=${encodeURIComponent(
                              item.release.id
                            )}&package=${encodeURIComponent(
                              primaryDownload.packageId ??
                                ""
                            )}`
                          }
                          className={styles.primaryAction}
                        >
                          <Download
                            size={17}
                            aria-hidden="true"
                          />
                          {downloadLabel}
                        </Link>
                      )}

                      {item.software.map(
                        (software) => (
                          <Link
                            key={software.slug}
                            href={
                              "/programas/" +
                              software.slug
                            }
                            className={styles.secondaryAction}
                          >
                            <Wrench
                              size={17}
                              aria-hidden="true"
                            />
                            {software.name}
                          </Link>
                        )
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {downloadableReleases.length > 0 && (
          <section
            id="installation"
            className={styles.installationPanel}
            aria-labelledby="installation-title"
          >
            <div className={styles.installationIcon}>
              <ShieldCheck size={23} aria-hidden="true" />
            </div>
            <div>
              <span>INSTALACIÓN</span>
              <h2 id="installation-title">Descarga desde una fuente configurada</h2>
              <p>
                Elige una fuente disponible, abre el destino correspondiente y sigue las instrucciones publicadas junto con tu juego.
              </p>
            </div>
            <Link
              href="#releases"
              className={styles.installationAction}
            >
              Ver opciones de descarga
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </section>
        )}

        {recentGameUpdates.length > 0 && (
          <section
            id="versions"
            className={styles.sectionPanel}
            aria-labelledby="versions-title"
          >
            <div className={styles.sectionTopline}>
              <div className={styles.sectionHeading}>
                <span>VERSIONES</span>
                <h2 id="versions-title">Versiones recientes</h2>
              </div>
              <Link
                href={`/actualizaciones?juego=${encodeURIComponent(game.slug)}`}
              >
                Ver todas
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <div className={styles.versionList}>
              {recentGameUpdates.map((update, index) => (
                <article
                  key={update.id}
                  className={styles.versionRow}
                >
                  <div>
                    <strong>{update.version}</strong>
                    {index === 0 && <span>Actual</span>}
                  </div>
                  <p>{update.summary}</p>
                  <time dateTime={update.publishedAt}>
                    <CalendarDays size={14} aria-hidden="true" />
                    {new Intl.DateTimeFormat("es", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(update.publishedAt))}
                  </time>
                </article>
              ))}
            </div>
          </section>
        )}

        {relatedGames.length > 0 && (
          <section
            className={styles.relatedSection}
            aria-labelledby="related-title"
          >
            <div className={styles.sectionTopline}>
              <div className={styles.sectionHeading}>
                <span>DESCUBRIR</span>
                <h2 id="related-title">Juegos relacionados</h2>
              </div>
              <Link href={`/juegos?categoria=${encodeURIComponent(game.category)}`}>
                Explorar más
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <div className={styles.relatedGrid}>
              {relatedGames.map((related) => (
                <UniversalGameCard
                  key={related.slug}
                  game={related}
                  variant="standard"
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
