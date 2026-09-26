import type {
  Metadata,
} from "next";

import GameCatalogClient from "@/components/games/GameCatalogClient";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PublicBreadcrumb from "@/components/layout/PublicBreadcrumb";
import {
  buildHomeGameCollections,
} from "@/data/home";
import {
  parseCategory,
  parseEquipmentFilter,
  parseMinimumRating,
  parseSearchScope,
  parseSortMode,
  parseStatusFilter,
  parseViewMode,
  sanitizeCatalogQuery,
} from "@/lib/games/catalog";
import {
  getPublicGames,
} from "@/lib/games/public-catalog";
import {
  getPublicTaxonomyPresentation,
} from "@/lib/games/public-taxonomy";
import {
  safeJsonLd,
} from "@/lib/safe-json-ld";
import {
  buildBreadcrumbJsonLd,
} from "@/lib/seo/breadcrumb";
import {
  absoluteUrl,
} from "@/lib/site";
import {
  getPublicPagesConfig,
} from "@/lib/site/public-pages-config";
import {
  getPublicSiteConfig,
} from "@/lib/site/public-site-config";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type GamesSearchParams = {
  categoria?: string;
  orden?: string;
  q?: string;
  buscarEn?: string;
  puntuacion?: string;
  equipo?: string;
  estado?: string;
  vista?: string;
};

type GamesPageProps = {
  searchParams:
    Promise<GamesSearchParams>;
};

function hasCatalogFilters(
  params: GamesSearchParams
) {
  return Object.values(
    params
  ).some(
    (value) =>
      typeof value ===
        "string" &&
      value.length > 0
  );
}

export async function generateMetadata({
  searchParams,
}: GamesPageProps): Promise<Metadata> {
  const [params, config, publicPages] = await Promise.all([
    searchParams,
    getPublicSiteConfig(),
    getPublicPagesConfig(),
  ]);
  const filtered =
    hasCatalogFilters(
      params
    );
  const page = publicPages.games;
  const title =
    page.title;
  const description =
    page.description;

  return {
    title,
    description,

    alternates: {
      canonical: "/juegos",
    },

    robots: filtered
      ? {
          index: false,
          follow: true,
        }
      : {
          index: true,
          follow: true,
        },

    openGraph: {
      title:
        `${title} | ${config.name}`,
      description,
      url: "/juegos",
      type: "website",
    },

    twitter: {
      card:
        "summary_large_image",
      title:
        `${title} | ${config.name}`,
      description,
    },
  };
}

export default async function GamesPage({
  searchParams,
}: GamesPageProps) {
  const [
    params,
    games,
    config,
    taxonomy,
    publicPages,
  ] = await Promise.all([
    searchParams,
    getPublicGames(),
    getPublicSiteConfig(),
    getPublicTaxonomyPresentation(),
    getPublicPagesConfig(),
  ]);
  const collections =
    buildHomeGameCollections(games);
  const page = publicPages.games;
  const description = page.description;
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    page.title,
    "/juegos"
  );

  const collectionJsonLd = {
    "@context":
      "https://schema.org",
    "@type":
      "CollectionPage",
    name:
      page.title,
    url:
      absoluteUrl(
        "/juegos"
      ),
    description,
    inLanguage:
      config.language,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html:
            safeJsonLd(
              breadcrumbJsonLd
            ),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html:
            safeJsonLd(
              collectionJsonLd
            ),
        }}
      />

      <Header />

      <main
        id="main-content"
        className={
          styles.main
        }
      >
        <section
          className={
            styles.hero
          }
          aria-labelledby="games-title"
        >
          <PublicBreadcrumb
            className={styles.breadcrumb}
            currentLabel={page.title}
          />

          <div
            className={
              styles.heroContent
            }
          >
            <span
              className={
                styles.eyebrow
              }
            >
              {page.eyebrow}
            </span>

            <h1
              id="games-title"
            >
              {page.title}
            </h1>

            <p>
              {description}
            </p>

            <div
              className={
                styles.heroMeta
              }
              aria-label="Resumen del catálogo"
            >
              <span>
                <strong>
                  {games.length}
                </strong>
                títulos
              </span>

              <span
                aria-hidden="true"
              >
                •
              </span>

              <span>
                {page.platformLabel}
              </span>
            </div>
          </div>
        </section>

        <GameCatalogClient
          games={games}
          categoryTerms={taxonomy.classifications}
          lowSpecSlugs={
            collections.lowSpecGames.map(
              (game) =>
                game.slug
            )
          }
          initialCategory={
            parseCategory(
              params.categoria,
              games
            )
          }
          initialSort={
            parseSortMode(
              params.orden
            )
          }
          initialQuery={
            sanitizeCatalogQuery(
              params.q
            )
          }
          initialSearchScope={
            parseSearchScope(
              params.buscarEn
            )
          }
          initialRating={
            parseMinimumRating(
              params.puntuacion
            )
          }
          initialEquipment={
            parseEquipmentFilter(
              params.equipo
            )
          }
          initialStatus={
            parseStatusFilter(
              params.estado
            )
          }
          initialView={
            parseViewMode(
              params.vista
            )
          }
        />
      </main>

      <Footer />
    </>
  );
}
