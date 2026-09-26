import type { Metadata } from "next";

import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PublicBreadcrumb from "@/components/layout/PublicBreadcrumb";
import AccountAwareGameFinder from "@/features/game-finder/AccountAwareGameFinder";
import {
  PublicFinderCopyProvider,
} from "@/features/game-finder/PublicFinderCopyContext";
import {
  getAccountHardwareSelection,
} from "@/lib/accounts/personalization-service";
import {
  readAccountSession,
} from "@/lib/accounts/session";
import {
  getPublicGames,
} from "@/lib/games/public-catalog";
import {
  resolvePcRelease,
} from "@/lib/games/releases";
import { safeJsonLd } from "@/lib/safe-json-ld";
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

type RequirementsSearchParams = {
  juego?: string;
};

type RequirementsPageProps = {
  searchParams: Promise<RequirementsSearchParams>;
};

export async function generateMetadata({
  searchParams,
}: RequirementsPageProps): Promise<Metadata> {
  const [params, games, config, publicPages] = await Promise.all([
    searchParams,
    getPublicGames(),
    getPublicSiteConfig(),
    getPublicPagesConfig(),
  ]);
  const page = publicPages.finder;
  const title = `${page.title} ${page.highlight}`;
  const description = page.description;
  const pcGames = games.filter(
    (game) =>
      Boolean(
        resolvePcRelease(
          game
        )
      )
  );
  const hasFocusedGame =
    typeof params.juego === "string" &&
    pcGames.some((game) => game.slug === params.juego);

  return {
    title,
    description,
    alternates: {
      canonical: "/requisitos",
    },
    robots: hasFocusedGame
      ? {
          index: false,
          follow: true,
        }
      : {
          index: true,
          follow: true,
        },
    openGraph: {
      title: `${title} | ${config.name}`,
      description,
      url: "/requisitos",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${config.name}`,
      description,
    },
  };
}

export default async function RequirementsPage({
  searchParams,
}: RequirementsPageProps) {
  const [
    { juego },
    games,
    config,
    publicPages,
    accountSession,
  ] = await Promise.all([
    searchParams,
    getPublicGames(),
    getPublicSiteConfig(),
    getPublicPagesConfig(),
    readAccountSession(),
  ]);
  const pcGames = games.filter(
    (game) =>
      Boolean(
        resolvePcRelease(
          game
        )
      )
  );
  const accountHardware = accountSession
    ? await getAccountHardwareSelection(accountSession.userId)
    : null;
  const page = publicPages.finder;
  const pageTitle = `${page.title} ${page.highlight}`;
  const focusedSlug =
    typeof juego === "string" &&
    pcGames.some((game) => game.slug === juego)
      ? juego
      : undefined;
  const performanceCalibrations = Object.fromEntries(
    pcGames.flatMap(
      (game) => {
        const calibration =
          resolvePcRelease(
            game
          )?.performance;

        return calibration
          ? [
              [
                game.slug,
                calibration,
              ] as const,
            ]
          : [];
      }
    )
  );
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    page.title,
    "/requisitos"
  );

  const pageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: pageTitle,
    url: absoluteUrl("/requisitos"),
    description: page.description,
    isPartOf: {
      "@type": "WebSite",
      name: config.name,
      url: absoluteUrl("/"),
    },
    inLanguage: config.language,
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
          __html: safeJsonLd(pageJsonLd),
        }}
      />

      <Header />

      <main id="main-content" className={styles.main}>
        <PublicBreadcrumb
          className={styles.breadcrumb}
          currentLabel={page.title}
        />

        <script
          id="deuna-performance-calibrations"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(performanceCalibrations),
          }}
        />

        <PublicFinderCopyProvider copy={page}>
          <AccountAwareGameFinder
            games={pcGames}
            focusedSlug={focusedSlug}
            authenticated={Boolean(accountSession)}
            accountHardware={accountHardware
              ? {
                  cpuId: accountHardware.cpuId,
                  gpuId: accountHardware.gpuId,
                  ramGb: accountHardware.ramGb,
                  memoryMode: accountHardware.memoryMode,
                  updatedAt: accountHardware.updatedAt.toISOString(),
                }
              : null}
          />
        </PublicFinderCopyProvider>
      </main>

      <Footer />
    </>
  );
}
