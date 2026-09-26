import type {
  Metadata,
} from "next";
import Link from "next/link";
import {
  Gamepad2,
  Layers3,
} from "lucide-react";

import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PublicBreadcrumb from "@/components/layout/PublicBreadcrumb";
import {
  getPublicGameCollections,
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

export const dynamic =
  "force-dynamic";

export const metadata: Metadata = {
  title: "Colecciones",
  description:
    "Explora juegos por saga, franquicia, consola o plataforma.",
  alternates: {
    canonical: "/colecciones",
  },
};

export default async function CollectionsPage() {
  const [
    games,
    collections,
    catalog,
  ] = await Promise.all([
    getPublicGames(),
    getPublicGameCollections(),
    getPublicPlatformCatalog(),
  ]);

  const counts = new Map<
    string,
    number
  >();

  for (const game of games) {
    for (
      const platformId of
      gamePlatformIds(game)
    ) {
      counts.set(
        platformId,
        (counts.get(
          platformId
        ) ?? 0) + 1
      );
    }
  }

  const visiblePlatforms =
    catalog.platforms.filter(
      (platform) =>
        platform.active &&
        (counts.get(
          platform.id
        ) ?? 0) > 0
    );

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
            currentLabel="Colecciones"
          />
          <span
            className={
              styles.eyebrow
            }
          >
            BIBLIOTECA
          </span>
          <h1>
            Colecciones
          </h1>
          <p>
            Recorre DeUna Games por
            sagas y franquicias, o
            entra directamente a los
            juegos disponibles para
            una consola o plataforma.
          </p>
        </section>

        <section
          className={
            styles.section
          }
        >
          <div
            className={
              styles.sectionHeading
            }
          >
            <span>
              SAGAS Y FRANQUICIAS
            </span>
            <h2>
              Colecciones de juegos
            </h2>
            <p>
              Selecciones editoriales
              que reúnen títulos de
              una misma saga o
              franquicia.
            </p>
          </div>

          {collections.length ? (
            <div
              className={
                styles.grid
              }
            >
              {collections.map(
                (collection) => (
                  <Link
                    key={
                      collection.slug
                    }
                    href={
                      "/colecciones/" +
                      collection.slug
                    }
                    className={
                      styles.card
                    }
                  >
                    <div
                      className={
                        styles.cardTop
                      }
                    >
                      <span
                        className={
                          styles.icon
                        }
                      >
                        <Layers3
                          size={22}
                          aria-hidden="true"
                        />
                      </span>
                      <span
                        className={
                          styles.count
                        }
                      >
                        {
                          collection
                            .gameSlugs
                            .length
                        }{" "}
                        juegos
                      </span>
                    </div>
                    <strong>
                      {
                        collection.title
                      }
                    </strong>
                    <p>
                      {
                        collection.description
                      }
                    </p>
                  </Link>
                )
              )}
            </div>
          ) : (
            <p
              className={
                styles.empty
              }
            >
              Todavía no hay
              colecciones editoriales
              publicadas.
            </p>
          )}
        </section>

        <section
          className={
            styles.section
          }
        >
          <div
            className={
              styles.sectionHeading
            }
          >
            <span>
              CONSOLAS Y PLATAFORMAS
            </span>
            <h2>
              Explora por sistema
            </h2>
            <p>
              Estas colecciones se
              generan automáticamente
              a partir de los releases
              publicados.
            </p>
          </div>

          {visiblePlatforms.length ? (
            <div
              className={
                styles.grid
              }
            >
              {visiblePlatforms.map(
                (platform) => (
                  <Link
                    key={
                      platform.id
                    }
                    href={
                      "/colecciones/" +
                      platform.id
                    }
                    className={
                      styles.card
                    }
                  >
                    <div
                      className={
                        styles.cardTop
                      }
                    >
                      <span
                        className={
                          styles.icon
                        }
                      >
                        <Gamepad2
                          size={22}
                          aria-hidden="true"
                        />
                      </span>
                      <span
                        className={
                          styles.count
                        }
                      >
                        {counts.get(
                          platform.id
                        ) ?? 0}{" "}
                        juegos
                      </span>
                    </div>
                    <strong>
                      {platform.name}
                    </strong>
                    <p>
                      Colección
                      automática de
                      títulos con un
                      release publicado
                      para esta
                      plataforma.
                    </p>
                  </Link>
                )
              )}
            </div>
          ) : (
            <p
              className={
                styles.empty
              }
            >
              Aún no hay plataformas
              con juegos publicados.
            </p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
