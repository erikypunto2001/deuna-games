import type {
  Metadata,
} from "next";
import {
  ExternalLink,
  Gamepad2,
} from "lucide-react";
import {
  notFound,
} from "next/navigation";

import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PublicBreadcrumb from "@/components/layout/PublicBreadcrumb";
import {
  getPublicPlatformCatalog,
} from "@/lib/platforms/public-platform-catalog";
import {
  resolveSoftwarePackages,
} from "@/lib/software/distribution";
import {
  getPublicSoftwareBySlug,
} from "@/lib/software/public-software";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const kindLabels = {
  emulator: "Emulador",
  utility: "Utilidad",
  upscaler: "Escalado",
  launcher: "Launcher",
  runtime: "Runtime",
  other: "Programa",
} as const;

export const dynamic =
  "force-dynamic";
export const dynamicParams =
  true;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } =
    await params;
  const software =
    await getPublicSoftwareBySlug(
      slug
    );

  if (!software) {
    return {
      title:
        "Programa no encontrado",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: software.name,
    description:
      software.shortDescription ??
      software.description,
    alternates: {
      canonical:
        "/programas/" +
        software.slug,
    },
  };
}

export default async function ProgramDetailPage({
  params,
}: PageProps) {
  const { slug } =
    await params;
  const [
    software,
    catalog,
  ] = await Promise.all([
    getPublicSoftwareBySlug(
      slug
    ),
    getPublicPlatformCatalog(),
  ]);

  if (!software) {
    notFound();
  }

  const labels = new Map(
    catalog.platforms.map(
      (platform) => [
        platform.id,
        platform.shortName ||
          platform.name,
      ]
    )
  );
  const packages =
    resolveSoftwarePackages(
      software.packages
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
            currentLabel={
              software.name
            }
          />
          <span
            className={
              styles.eyebrow
            }
          >
            {
              kindLabels[
                software.kind
              ]
            }
          </span>
          <h1>
            {software.name}
          </h1>
          <p>
            {
              software.description
            }
          </p>
          <div
            className={
              styles.meta
            }
          >
            {software.version && (
              <span>
                Versión{" "}
                {
                  software.version
                }
              </span>
            )}
            {software.developer && (
              <span>
                {
                  software.developer
                }
              </span>
            )}
            {software.runsOnPlatformIds
              .map(
                (
                  platformId
                ) => (
                  <span
                    key={
                      "runs-" +
                      platformId
                    }
                  >
                    Se ejecuta en{" "}
                    {labels.get(
                      platformId
                    ) ??
                      platformId}
                  </span>
                )
              )}
            {software.emulatesPlatformIds
              ?.map(
                (
                  platformId
                ) => (
                  <span
                    key={
                      "emulates-" +
                      platformId
                    }
                  >
                    <Gamepad2
                      size={13}
                      aria-hidden="true"
                    />{" "}
                    Emula{" "}
                    {labels.get(
                      platformId
                    ) ??
                      platformId}
                  </span>
                )
              )}
          </div>

          {software.website && (
            <a
              href={
                software.website
              }
              className={
                styles.website
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Sitio oficial
              <ExternalLink
                size={16}
                aria-hidden="true"
              />
            </a>
          )}
        </section>

        <section
          className={
            styles.section
          }
        >
          <h2>
            Descargas
          </h2>

          {packages.length ? (
            <div
              className={
                styles.packageList
              }
            >
              {packages.map(
                (item) => (
                  <article
                    key={
                      item.id
                    }
                    className={
                      styles.package
                    }
                  >
                    <div
                      className={
                        styles.packageHeader
                      }
                    >
                      <strong>
                        {
                          item.label
                        }
                      </strong>
                      <span>
                        {labels.get(
                          item.platformId
                        ) ??
                          item.platformId}
                        {" · "}
                        {item.kind.toUpperCase()}
                      </span>
                    </div>

                    <div
                      className={
                        styles.sourceList
                      }
                    >
                      {item.sources.map(
                        (
                          source
                        ) => {
                          const status =
                            source.status ??
                            "available";
                          if (
                            status !==
                            "available"
                          ) {
                            return (
                              <span
                                key={
                                  source.id
                                }
                                className={
                                  styles.sourceUnavailable
                                }
                              >
                                {
                                  source.name
                                }{" "}
                                ·{" "}
                                {
                                  status ===
                                  "down"
                                    ? "Caído"
                                    : "Mantenimiento"
                                }
                              </span>
                            );
                          }

                          return (
                            <a
                              key={
                                source.id
                              }
                              href={
                                source.href
                              }
                              target={
                                source.href.startsWith(
                                  "https://"
                                )
                                  ? "_blank"
                                  : undefined
                              }
                              rel={
                                source.href.startsWith(
                                  "https://"
                                )
                                  ? "noopener noreferrer"
                                  : undefined
                              }
                            >
                              {source.label ??
                                "Abrir " +
                                  source.name}
                              <ExternalLink
                                size={16}
                                aria-hidden="true"
                              />
                            </a>
                          );
                        }
                      )}
                    </div>

                    {item.checksumSha256 && (
                      <p
                        className={
                          styles.checksum
                        }
                      >
                        SHA-256:{" "}
                        <code>
                          {
                            item.checksumSha256
                          }
                        </code>
                      </p>
                    )}
                  </article>
                )
              )}
            </div>
          ) : (
            <p>
              No hay paquetes
              públicos disponibles
              todavía.
            </p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
