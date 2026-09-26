import type {
  Metadata,
} from "next";
import {
  notFound,
} from "next/navigation";

import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PublicBreadcrumb from "@/components/layout/PublicBreadcrumb";
import UniversalGameCard from "@/components/ui/UniversalGameCard";
import {
  orderCollectionGames,
} from "@/lib/collections/collection-presentation";
import {
  getPublicGameCollectionBySlug,
} from "@/lib/collections/public-game-collections";
import {
  gamePlatformIds,
} from "@/lib/games/releases";
import {
  getPublicGames,
} from "@/lib/games/public-catalog";
import {
  getPublicPlatformCatalog,
} from "@/lib/platforms/public-platform-catalog";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic =
  "force-dynamic";
export const dynamicParams =
  true;

async function resolveCollection(
  slug: string
) {
  const [
    games,
    catalog,
    editorial,
  ] = await Promise.all([
    getPublicGames(),
    getPublicPlatformCatalog(),
    getPublicGameCollectionBySlug(
      slug
    ),
  ]);

  if (editorial) {
    return {
      title:
        editorial.title,
      description:
        editorial.description,
      eyebrow:
        "SAGA / FRANQUICIA",
      games:
        orderCollectionGames(
          games,
          editorial.gameSlugs
        ),
    };
  }

  const platform =
    catalog.platforms.find(
      (item) =>
        item.id === slug &&
        item.active
    );

  if (!platform) {
    return null;
  }

  return {
    title: platform.name,
    description:
      "Juegos con un release publicado para " +
      platform.name +
      ".",
    eyebrow:
      "CONSOLA / PLATAFORMA",
    games:
      games.filter(
        (game) =>
          gamePlatformIds(
            game
          ).includes(
            platform.id
          )
      ),
  };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } =
    await params;
  const collection =
    await resolveCollection(
      slug
    );

  if (!collection) {
    return {
      title:
        "Colección no encontrada",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title:
      collection.title,
    description:
      collection.description,
    alternates: {
      canonical:
        "/colecciones/" +
        slug,
    },
  };
}

export default async function CollectionDetailPage({
  params,
}: PageProps) {
  const { slug } =
    await params;
  const collection =
    await resolveCollection(
      slug
    );

  if (!collection) {
    notFound();
  }

  return (
    <>
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
        >
          <PublicBreadcrumb
            className=""
            currentLabel={
              collection.title
            }
          />
          <span
            className={
              styles.eyebrow
            }
          >
            {
              collection.eyebrow
            }
          </span>
          <h1>
            {
              collection.title
            }
          </h1>
          <p>
            {
              collection.description
            }
          </p>
          <div
            className={
              styles.meta
            }
          >
            <span>
              {
                collection.games
                  .length
              }{" "}
              juegos
            </span>
          </div>
        </section>

        {collection.games
          .length ? (
          <section
            className={
              styles.grid
            }
            aria-label={
              "Juegos de " +
              collection.title
            }
          >
            {collection.games.map(
              (game) => (
                <UniversalGameCard
                  key={
                    game.slug
                  }
                  game={game}
                  variant="standard"
                />
              )
            )}
          </section>
        ) : (
          <p
            className={
              styles.empty
            }
          >
            Esta colección no
            tiene juegos públicos
            disponibles todavía.
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
