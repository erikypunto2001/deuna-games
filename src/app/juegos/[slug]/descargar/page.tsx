import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleX,
  Download,
  ExternalLink,
  FileArchive,
  HardDrive,
  House,
  Info,
  Monitor,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import GameCoverMedia from "@/components/ui/GameCoverMedia";
import {
  resolveGameDownload,
  resolveGameReleaseDownload,
} from "@/lib/games/download";
import {
  platformLabel,
} from "@/lib/games/releases";
import {
  getPublicPlatformCatalog,
} from "@/lib/platforms/public-platform-catalog";
import {
  getPublicGameBySlug,
} from "@/lib/games/public-catalog";
import {
  getPublicSiteConfig,
} from "@/lib/site/public-site-config";
import type {
  GameDownloadSourceStatus,
} from "@/types/game";

import styles from "./page.module.css";

type DownloadPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    release?: string | string[];
    package?: string | string[];
  }>;
};

const sourceStatusLabels: Record<
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

export const dynamic = "force-dynamic";
export const dynamicParams = true;

function SourceStatusIcon({
  status,
}: {
  status: GameDownloadSourceStatus;
}) {
  if (status === "down") {
    return <CircleX size={15} aria-hidden="true" />;
  }

  if (status === "maintenance") {
    return <Wrench size={15} aria-hidden="true" />;
  }

  return <CheckCircle2 size={15} aria-hidden="true" />;
}

export async function generateMetadata({
  params,
}: DownloadPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [game, publicSiteConfig] = await Promise.all([
    getPublicGameBySlug(slug),
    getPublicSiteConfig(),
  ]);
  const download = game
    ? resolveGameDownload(game)
    : null;

  if (!game || !download) {
    return {
      title: game
        ? game.title
        : "Juego no encontrado",
      alternates: game
        ? {
            canonical: `/juegos/${game.slug}`,
          }
        : undefined,
      robots: {
        index: false,
        follow: Boolean(game),
      },
    };
  }

  return {
    title: `Descargar ${game.title}`,
    description:
      `Fuentes de descarga configuradas para ${game.title} en ${publicSiteConfig.name}.`,
    alternates: {
      canonical: `/juegos/${game.slug}`,
    },
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function DownloadPage({
  params,
  searchParams,
}: DownloadPageProps) {
  const [
    { slug },
    query,
  ] = await Promise.all([
    params,
    searchParams,
  ]);
  const [
    game,
    publicSiteConfig,
    platformCatalog,
  ] = await Promise.all([
    getPublicGameBySlug(slug),
    getPublicSiteConfig(),
    getPublicPlatformCatalog(),
  ]);

  if (!game) {
    notFound();
  }

  const releaseId =
    Array.isArray(query.release)
      ? query.release[0]
      : query.release;
  const packageId =
    Array.isArray(query.package)
      ? query.package[0]
      : query.package;
  const download = releaseId
    ? resolveGameReleaseDownload(
        game,
        releaseId,
        packageId || undefined
      )
    : resolveGameDownload(game);

  if (!download) {
    redirect(`/juegos/${game.slug}`);
  }

  const genres =
    game.genres?.length
      ? game.genres
      : [game.category];
  const platform =
    download.platformId
      ? platformLabel(
          platformCatalog,
          download.platformId
        )
      : download.platform ??
        game.platforms?.[0] ??
        "A confirmar";
  const channel = download.channel
    ? distributionChannelLabels[download.channel]
    : "A confirmar";
  const storage =
    download.sizeGb
      ? `${download.sizeGb} GB`
      : "Según el paquete";

  return (
    <>
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
          <Link
            href={`/juegos/${game.slug}`}
            className={styles.gameCrumb}
          >
            {game.title}
          </Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">Descargar</span>
        </nav>

        <section
          className={styles.gameSummary}
          aria-labelledby="download-title"
        >
          <div className={styles.cover}>
            <GameCoverMedia
              game={game}
              sizes="(max-width: 680px) 42vw, 210px"
            />
          </div>

          <div className={styles.gameCopy}>
            <div className={styles.titleRow}>
              <h1 id="download-title">{game.title}</h1>
              <span>{platform}</span>
            </div>

            <div className={styles.tags}>
              {genres.slice(0, 4).map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
              {download.packageKind && (
                <span>
                  {download.packageKind.toUpperCase()}
                </span>
              )}
            </div>

            <p>{game.description}</p>
          </div>

          <div className={styles.summaryFacts}>
            <article>
              <HardDrive size={24} aria-hidden="true" />
              <div>
                <span>Tamaño total</span>
                <strong>{storage}</strong>
              </div>
            </article>

            <article>
              <FileArchive size={24} aria-hidden="true" />
              <div>
                <span>Archivos</span>
                <strong>
                  {download.fileCount
                    ? `${download.fileCount} ${download.fileCount === 1 ? "archivo" : "archivos"}`
                    : "Según la fuente"}
                </strong>
              </div>
            </article>

            <article>
              <Monitor size={24} aria-hidden="true" />
              <div>
                <span>Plataforma</span>
                <strong>{platform}</strong>
              </div>
            </article>

            <article>
              <ShieldCheck size={24} aria-hidden="true" />
              <div>
                <span>Canal</span>
                <strong>{channel}</strong>
              </div>
            </article>
          </div>
        </section>

        <section
          className={styles.sourcesPanel}
          aria-labelledby="sources-title"
        >
          <div className={styles.sourcesHeading}>
            <span>DESCARGA</span>
            <h2 id="sources-title">
              Elige una fuente para continuar
            </h2>
            <p>
              Mostramos los destinos configurados para este juego y su estado actual. Las fuentes caídas o en mantenimiento permanecen visibles como información, pero no se pueden abrir.
            </p>
          </div>

          <div className={styles.sourceList}>
            {download.sources.map((source) => {
              const available =
                source.status === "available";
              const statusClass =
                source.status === "down"
                  ? styles.sourceStatusDown
                  : source.status === "maintenance"
                    ? styles.sourceStatusMaintenance
                    : styles.sourceStatusAvailable;

              return (
                <article
                  key={`${source.id}:${source.href}`}
                  className={`${styles.sourceCard} ${!available ? styles.sourceCardUnavailable : ""}`}
                >
                  <span
                    className={styles.sourceMark}
                    aria-hidden="true"
                  >
                    {source.name
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </span>

                  <div className={styles.sourceCopy}>
                    <strong>{source.name}</strong>
                    <span>
                      {source.external
                        ? "Destino externo HTTPS"
                        : "Destino interno"}
                    </span>
                  </div>

                  <span
                    className={`${styles.sourceStatus} ${statusClass}`}
                  >
                    <SourceStatusIcon status={source.status} />
                    {sourceStatusLabels[source.status]}
                  </span>

                  {available ? (
                    <a
                      href={source.href}
                      className={styles.sourceAction}
                      target={source.external ? "_blank" : undefined}
                      rel={source.external ? "noopener noreferrer" : undefined}
                    >
                      {source.label}
                      {source.external ? (
                        <ExternalLink size={17} aria-hidden="true" />
                      ) : (
                        <Download size={17} aria-hidden="true" />
                      )}
                    </a>
                  ) : (
                    <span
                      className={styles.sourceActionDisabled}
                      aria-disabled="true"
                    >
                      {source.status === "maintenance"
                        ? "En mantenimiento"
                        : "No disponible"}
                    </span>
                  )}
                </article>
              );
            })}
          </div>

          {download.checksumSha256 && (
            <div className={styles.securityNote}>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>
                SHA-256 del paquete publicado: {" "}
                <code style={{ overflowWrap: "anywhere" }}>
                  {download.checksumSha256}
                </code>. Puedes usarlo para comprobar que el archivo descargado coincide con la revisión publicada, independientemente del mirror elegido.
              </span>
            </div>
          )}

          <div className={styles.securityNote}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              {publicSiteConfig.name} no genera enlaces desde parámetros del navegador: las fuentes salen de la configuración editorial del juego.
            </span>
          </div>
        </section>

        <section
          id="como-funciona"
          className={styles.howItWorks}
          aria-labelledby="how-title"
        >
          <span className={styles.infoIcon}>
            <Info size={23} aria-hidden="true" />
          </span>
          <div>
            <h2 id="how-title">¿Cómo funciona?</h2>
            <p>
              Elige una fuente disponible y se abrirá el destino correspondiente. Si una fuente está caída o en mantenimiento seguirá visible como información, pero no permitirá abrir el enlace.
            </p>
          </div>
          <a href="#sources-title" className={styles.guideAction}>
            Ver fuentes
          </a>
        </section>

        <Link
          href={`/juegos/${game.slug}`}
          className={styles.backLink}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Volver al juego
        </Link>
      </main>

      <Footer />
    </>
  );
}
