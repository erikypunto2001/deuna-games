import type { Metadata } from "next";

import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";

import FeaturedCategories from "@/components/home/FeaturedCategories";
import GameFinderSection from "@/components/home/GameFinderSection";
import GamesForYourPC from "@/components/home/GamesForYourPC";
import HeroSection from "@/components/home/HeroSection";
import LatestUpdates from "@/components/home/LatestUpdates";
import PopularGames from "@/components/home/PopularGames";
import RecentlyAdded from "@/components/home/RecentlyAdded";
import RecommendedGames from "@/components/home/RecommendedGames";
import TrustSection from "@/components/home/TrustSection";
import {
  buildHomeGameCollections,
} from "@/data/home";
import {
  getAccountPersonalization,
} from "@/lib/accounts/personalization-service";
import {
  readAccountSession,
} from "@/lib/accounts/session";
import {
  getCatalogCapabilities,
} from "@/lib/games/catalog-capabilities";
import {
  getPublicGames,
} from "@/lib/games/public-catalog";
import {
  resolveHomeCardRevealMode,
} from "@/lib/home/card-row-reveal";
import {
  getPublicHomeConfig,
} from "@/lib/home/public-home-config";
import {
  absoluteUrl,
} from "@/lib/site";
import {
  getPublicSiteConfig,
} from "@/lib/site/public-site-config";
import { safeJsonLd } from "@/lib/safe-json-ld";
import {
  getPublicResolvedUpdates,
} from "@/lib/updates/public-updates";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [config, homeConfig] = await Promise.all([
    getPublicSiteConfig(),
    getPublicHomeConfig(),
  ]);
  const title =
    `${config.name} | ${homeConfig.copy.hero.accessibleTitle}`;

  return {
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      url: "/",
      siteName: config.name,
      title,
      description: config.description,
    },
  };
}

export default async function Home() {
  const [games, updates, config, homeConfig, session] = await Promise.all([
    getPublicGames(),
    getPublicResolvedUpdates(),
    getPublicSiteConfig(),
    getPublicHomeConfig(),
    readAccountSession(),
  ]);
  const personalization = session
    ? await getAccountPersonalization(session.userId)
    : undefined;
  const collections = buildHomeGameCollections(
    games,
    homeConfig,
    personalization
      ? {
          preferences: personalization.preferences,
          hardware: personalization.hardware,
        }
      : undefined
  );
  const copy = homeConfig.copy;
  const { ratings: ratingsAvailable } =
    getCatalogCapabilities(games);
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: config.name,
    url: absoluteUrl("/"),
    description: config.description,
    inLanguage: config.language,
  };

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: config.name,
    url: absoluteUrl("/"),
  };

  function renderSection(
    section: (typeof homeConfig.sections)[number]
  ) {
    if (!section.visible) return null;

    switch (section.id) {
      case "hero":
        return collections.heroGames.length > 0 ? (
          <HeroSection
            key={section.id}
            games={collections.heroGames}
            presentation={homeConfig.heroPresentation}
          />
        ) : null;

      case "popular":
        return collections.popularGames.length > 0 ? (
          <PopularGames
            key={section.id}
            games={collections.popularGames}
            copy={copy.popular}
            revealMode={resolveHomeCardRevealMode(section)}
          />
        ) : null;

      case "finder":
        return (
          <GameFinderSection
            key={section.id}
            copy={copy.finder}
          />
        );

      case "classifications":
        return games.length > 0 ? (
          <FeaturedCategories
            key={section.id}
            games={games}
            copy={copy.classifications}
          />
        ) : null;

      case "recent":
        return collections.recentGames.length > 0 ? (
          <RecentlyAdded
            key={section.id}
            games={collections.recentGames}
            copy={copy.recent}
            revealMode={resolveHomeCardRevealMode(section)}
          />
        ) : null;

      case "updates":
        return updates.length > 0 ? (
          <LatestUpdates
            key={section.id}
            updates={updates.slice(0, 3)}
            copy={copy.updates}
          />
        ) : null;

      case "lowSpec":
        return collections.lowSpecGames.length > 0 ? (
          <GamesForYourPC
            key={section.id}
            games={collections.lowSpecGames}
            copy={copy.lowSpec}
            ratingsAvailable={ratingsAvailable}
            personalized={collections.pcPersonalized}
            reasons={collections.pcReasons}
            revealMode={resolveHomeCardRevealMode(section)}
          />
        ) : null;

      case "recommended":
        return collections.recommendedGames.length > 0 ? (
          <RecommendedGames
            key={section.id}
            games={collections.recommendedGames}
            copy={copy.recommended}
            personalized={collections.recommendedPersonalized}
            reasons={collections.recommendationReasons}
            revealMode={resolveHomeCardRevealMode(section)}
          />
        ) : null;

      case "trust":
        return (
          <TrustSection
            key={section.id}
            copy={copy.trust}
          />
        );
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html:
            safeJsonLd(websiteJsonLd),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html:
            safeJsonLd(organizationJsonLd),
        }}
      />

      <Header />

      <main
        id="main-content"
        className="main-content"
      >
        <h1 className={styles.pageTitle}>
          {homeConfig.copy.hero.accessibleTitle}
        </h1>
        {homeConfig.sections.map(renderSection)}
      </main>

      <Footer />
    </>
  );
}
