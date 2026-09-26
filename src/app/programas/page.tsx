import type {
  Metadata,
} from "next";
import Link from "next/link";
import {
  AppWindow,
  Gamepad2,
  Gauge,
  Wrench,
} from "lucide-react";

import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PublicBreadcrumb from "@/components/layout/PublicBreadcrumb";
import {
  getPublicPlatformCatalog,
} from "@/lib/platforms/public-platform-catalog";
import {
  getPublicSiteConfig,
} from "@/lib/site/public-site-config";
import {
  getPublicSoftware,
} from "@/lib/software/public-software";

import styles from "./page.module.css";

export const dynamic =
  "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();

  return {
    title: "Programas",
    description:
      `Emuladores, utilidades y herramientas publicadas en ${config.name}.`,
    alternates: {
      canonical: "/programas",
    },
  };
}

const kindLabels = {
  emulator: "Emulador",
  utility: "Utilidad",
  upscaler: "Escalado",
  launcher: "Launcher",
  runtime: "Runtime",
  other: "Programa",
} as const;

function SoftwareIcon({
  kind,
}: {
  kind:
    keyof typeof kindLabels;
}) {
  if (kind === "emulator") {
    return (
      <Gamepad2
        size={22}
        aria-hidden="true"
      />
    );
  }

  if (kind === "upscaler") {
    return (
      <Gauge
        size={22}
        aria-hidden="true"
      />
    );
  }

  if (kind === "utility") {
    return (
      <Wrench
        size={22}
        aria-hidden="true"
      />
    );
  }

  return (
    <AppWindow
      size={22}
      aria-hidden="true"
    />
  );
}

export default async function ProgramsPage() {
  const [
    software,
    catalog,
  ] = await Promise.all([
    getPublicSoftware(),
    getPublicPlatformCatalog(),
  ]);

  const labels = new Map(
    catalog.platforms.map(
      (platform) => [
        platform.id,
        platform.shortName ||
          platform.name,
      ]
    )
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
            currentLabel="Programas"
          />
          <span
            className={
              styles.eyebrow
            }
          >
            HERRAMIENTAS
          </span>
          <h1>
            Programas
          </h1>
          <p>
            Emuladores,
            utilidades,
            herramientas de
            escalado y otros
            programas relacionados
            con tu biblioteca.
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
              CATÁLOGO
            </span>
            <h2>
              Programas publicados
            </h2>
            <p>
              Cada programa conserva
              su ficha, versión,
              plataformas y paquetes
              de descarga de forma
              independiente.
            </p>
          </div>

          {software.length ? (
            <div
              className={
                styles.grid
              }
            >
              {software.map(
                (item) => (
                  <Link
                    key={
                      item.slug
                    }
                    href={
                      "/programas/" +
                      item.slug
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
                        <SoftwareIcon
                          kind={
                            item.kind
                          }
                        />
                      </span>
                      <span
                        className={
                          styles.kind
                        }
                      >
                        {
                          kindLabels[
                            item.kind
                          ]
                        }
                      </span>
                    </div>
                    <strong>
                      {item.name}
                    </strong>
                    <p>
                      {
                        item.shortDescription ??
                        item.description
                      }
                    </p>
                    <div
                      className={
                        styles.meta
                      }
                    >
                      {item.runsOnPlatformIds
                        .slice(0, 3)
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
                      {item.emulatesPlatformIds
                        ?.slice(
                          0,
                          3
                        )
                        .map(
                          (
                            platformId
                          ) => (
                            <span
                              key={
                                "emulates-" +
                                platformId
                              }
                            >
                              Emula{" "}
                              {labels.get(
                                platformId
                              ) ??
                                platformId}
                            </span>
                          )
                        )}
                    </div>
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
              programas publicados.
            </p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
