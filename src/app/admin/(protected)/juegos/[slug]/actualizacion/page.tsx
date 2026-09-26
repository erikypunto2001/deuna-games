import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { notFound } from "next/navigation";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import GameDownloadEditor from "@/components/admin/GameDownloadEditor";
import {
  getEditorialItem,
  listEditorialItems,
} from "@/lib/admin/content-service";
import {
  getGamePublicationIdentity,
} from "@/lib/admin/publication-overview";
import {
  evaluateGamePublicationReadiness,
} from "@/lib/admin/game-publication-readiness";
import {
  resolveGameReleases,
  platformLabel,
} from "@/lib/games/releases";
import {
  getPublicGameBySlug,
} from "@/lib/games/public-catalog";
import {
  getPublicPlatformCatalog,
} from "@/lib/platforms/public-platform-catalog";
import {
  verifyAdminSession,
} from "@/lib/admin/session";

import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    estado?: string | string[];
    release?: string | string[];
    package?: string | string[];
  }>;
};

const channelLabels = {
  stable: "Estable",
  beta: "Beta",
  testing: "Pruebas",
} as const;

function single(
  value: string | string[] | undefined
) {
  return Array.isArray(value)
    ? value[0]
    : value;
}

export default async function AdminGameUpdatePage({
  params,
  searchParams,
}: PageProps) {
  await verifyAdminSession();

  const [{ slug }, query] =
    await Promise.all([
      params,
      searchParams,
    ]);

  const [
    item,
    publicationIdentity,
    publicGame,
    allUpdates,
    platformCatalog,
  ] = await Promise.all([
    getEditorialItem("game", slug),
    getGamePublicationIdentity(slug),
    getPublicGameBySlug(slug),
    listEditorialItems("game_update"),
    getPublicPlatformCatalog(),
  ]);

  if (!item) notFound();

  const state = single(
    query.estado
  );
  const game = item.payload;
  const publicBaseline =
    publicGame ?? game;
  const releases =
    resolveGameReleases(
      publicBaseline
    );

  const requestedRelease =
    single(query.release);
  const selectedRelease =
    releases.find(
      (release) =>
        release.id ===
        requestedRelease
    ) ??
    releases[0] ??
    null;

  const requestedPackage =
    single(query.package);
  const selectedPackage =
    selectedRelease?.packages?.find(
      (item) =>
        item.id ===
        requestedPackage
    ) ??
    selectedRelease?.packages?.[0] ??
    null;

  const releasePlatform =
    selectedRelease
      ? platformLabel(
          platformCatalog,
          selectedRelease.platformId
        )
      : "Sin release";

  const initialSources =
    selectedPackage?.sources ??
    [];

  const relatedUpdates =
    allUpdates
      .filter(
        (update) =>
          update.payload.gameSlug ===
            slug &&
          (
            !selectedRelease ||
            (
              update.payload.releaseId ??
              "pc-windows"
            ) ===
              selectedRelease.id
          )
      )
      .sort(
        (a, b) =>
          Date.parse(
            b.payload.publishedAt
          ) -
          Date.parse(
            a.payload.publishedAt
          )
      )
      .slice(0, 10);

  const readiness =
    evaluateGamePublicationReadiness(
      game
    );

  const canPublish = Boolean(
    selectedRelease &&
      publicationIdentity?.publicVisible &&
      !publicationIdentity
        .hasUnpublishedChanges &&
      readiness.essentialsReady
  );

  const updateAction =
    "/api/admin/content/games/" +
    encodeURIComponent(slug) +
    "/publish-update";

  return (
    <>
      <Link
        href={
          "/admin/juegos/" +
          encodeURIComponent(slug) +
          "?seccion=descargas"
        }
        className={
          styles.backLink
        }
      >
        <ArrowLeft
          size={15}
          aria-hidden="true"
        />
        Volver a Plataformas y
        descargas
      </Link>

      <AdminPageHeader
        eyebrow={
          <>
            NUEVA VERSIÓN ·
            REVISIÓN{" "}
            {item.revision}
          </>
        }
        title={game.title}
        description="Publica una nueva versión de un release concreto sin reemplazar las descargas de las demás plataformas."
        action={
          <Link
            href={
              "/juegos/" +
              encodeURIComponent(
                slug
              )
            }
            className={
              styles.tableAction
            }
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink
              size={14}
              aria-hidden="true"
            />
            Ver juego público
          </Link>
        }
      />

      <EditorStateNotice
        state={state}
      />

      {!publicationIdentity
        ?.publicVisible && (
        <div
          className={
            styles.editorNotice
          }
          role="status"
          aria-live="polite"
        >
          <ShieldCheck
            size={18}
            aria-hidden="true"
          />
          Publica primero el juego
          antes de registrar una
          nueva versión.
        </div>
      )}

      {publicationIdentity
        ?.hasUnpublishedChanges && (
        <div
          className={
            styles.editorNotice
          }
          role="status"
          aria-live="polite"
        >
          <ShieldCheck
            size={18}
            aria-hidden="true"
          />
          Hay cambios de borrador
          pendientes. Publícalos
          antes de crear una
          actualización integrada.
        </div>
      )}

      <section
        className={
          styles.editorPanel
        }
      >
        <div
          className={
            styles.sectionHeading
          }
        >
          <div>
            <span>
              RELEASE
            </span>
            <h2>
              Elige la plataforma
            </h2>
          </div>
          <p>
            Una actualización de
            PC, PS2 o cualquier
            otra plataforma sólo
            modifica ese release.
          </p>
        </div>

        {releases.length ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {releases.map(
              (release) => (
                <Link
                  key={
                    release.id
                  }
                  href={
                    "/admin/juegos/" +
                    encodeURIComponent(
                      slug
                    ) +
                    "/actualizacion?release=" +
                    encodeURIComponent(
                      release.id
                    )
                  }
                  className={
                    styles.tableAction
                  }
                  aria-current={
                    selectedRelease
                      ?.id ===
                    release.id
                      ? "page"
                      : undefined
                  }
                >
                  {platformLabel(
                    platformCatalog,
                    release.platformId
                  )}
                  {release.version
                    ? " · " +
                      release.version
                    : ""}
                </Link>
              )
            )}
          </div>
        ) : (
          <p
            className={
              styles.emptyState
            }
          >
            Configura al menos un
            release desde
            Plataformas y
            descargas.
          </p>
        )}
      </section>

      {selectedRelease && (
        <>
          <section
            className={
              styles.editorPanel
            }
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <div>
                <span>
                  ESTADO ACTUAL
                </span>
                <h2>
                  {releasePlatform}
                </h2>
              </div>
              <p>
                Elige el paquete
                que va a recibir la
                nueva versión.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              {(selectedRelease
                .packages ??
                []).map(
                (item) => (
                  <Link
                    key={
                      item.id
                    }
                    href={
                      "/admin/juegos/" +
                      encodeURIComponent(
                        slug
                      ) +
                      "/actualizacion?release=" +
                      encodeURIComponent(
                        selectedRelease.id
                      ) +
                      "&package=" +
                      encodeURIComponent(
                        item.id
                      )
                    }
                    className={
                      styles.tableAction
                    }
                    aria-current={
                      selectedPackage
                        ?.id ===
                      item.id
                        ? "page"
                        : undefined
                    }
                  >
                    {item.label ??
                      item.id}
                    {" · "}
                    {item.kind.toUpperCase()}
                  </Link>
                )
              )}
            </div>
          </section>

          <section
            className={
              styles.editorPanel
            }
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <div>
                <span>
                  NUEVA VERSIÓN
                </span>
                <h2>
                  Publicar para{" "}
                  {releasePlatform}
                </h2>
              </div>
              <p>
                Se actualiza la
                versión y el
                paquete seleccionado
                dentro de una sola
                transacción
                editorial.
              </p>
            </div>

            <form
              className={
                styles.editorForm
              }
              method="post"
              action={updateAction}
            >
              <input
                type="hidden"
                name="expectedRevision"
                value={
                  item.revision
                }
              />
              <input
                type="hidden"
                name="releaseId"
                value={
                  selectedRelease.id
                }
              />

              <fieldset
                disabled={
                  !canPublish
                }
                className={
                  styles.fieldWide
                }
                style={{
                  border: 0,
                  padding: 0,
                  margin: 0,
                  display:
                    "contents",
                }}
              >
                <label>
                  <span>
                    Nueva versión
                  </span>
                  <input
                    name="version"
                    maxLength={80}
                    placeholder="Ej. 1.1.0"
                    required
                  />
                </label>

                <label>
                  <span>
                    Tipo de aviso
                  </span>
                  <select
                    name="type"
                    defaultValue="update"
                  >
                    <option value="update">
                      Actualización
                    </option>
                    <option value="content">
                      Nuevo contenido
                    </option>
                    <option value="fix">
                      Corrección
                    </option>
                    <option value="improvement">
                      Mejora
                    </option>
                  </select>
                </label>

                <label>
                  <span>
                    Destacar
                  </span>
                  <select
                    name="featured"
                    defaultValue="false"
                  >
                    <option value="false">
                      No
                    </option>
                    <option value="true">
                      Sí
                    </option>
                  </select>
                </label>

                <label>
                  <span>
                    ID del paquete
                  </span>
                  <input
                    name="packageId"
                    defaultValue={
                      selectedPackage
                        ?.id ??
                      "principal"
                    }
                    pattern="[a-z0-9][a-z0-9._-]*"
                    maxLength={160}
                    required
                  />
                </label>

                <label>
                  <span>
                    Formato
                  </span>
                  <select
                    name="packageKind"
                    defaultValue={
                      selectedPackage
                        ?.kind ??
                      (
                        selectedRelease
                          .platformId ===
                        "pc-windows"
                          ? "installer"
                          : "archive"
                      )
                    }
                  >
                    <option value="installer">
                      Instalador
                    </option>
                    <option value="archive">
                      Archivo
                    </option>
                    <option value="portable">
                      Portable
                    </option>
                    <option value="iso">
                      ISO
                    </option>
                    <option value="chd">
                      CHD
                    </option>
                    <option value="cso">
                      CSO
                    </option>
                    <option value="rvz">
                      RVZ
                    </option>
                    <option value="gdi">
                      GDI
                    </option>
                    <option value="pkg">
                      PKG
                    </option>
                    <option value="patch">
                      Parche
                    </option>
                    <option value="other">
                      Otro
                    </option>
                  </select>
                </label>

                <label>
                  <span>
                    Tamaño (GB)
                  </span>
                  <input
                    name="sizeGb"
                    type="number"
                    min="0.01"
                    max="100000"
                    step="0.01"
                    defaultValue={
                      selectedPackage
                        ?.sizeGb ??
                      ""
                    }
                  />
                </label>

                <label>
                  <span>
                    Cantidad de
                    archivos
                  </span>
                  <input
                    name="fileCount"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    defaultValue={
                      selectedPackage
                        ?.fileCount ??
                      ""
                    }
                  />
                </label>

                <label>
                  <span>
                    Canal
                  </span>
                  <select
                    name="channel"
                    defaultValue={
                      selectedPackage
                        ?.channel ??
                      ""
                    }
                  >
                    <option value="">
                      Sin definir
                    </option>
                    <option value="stable">
                      Estable
                    </option>
                    <option value="beta">
                      Beta
                    </option>
                    <option value="testing">
                      Pruebas
                    </option>
                  </select>
                </label>

                <label
                  className={
                    styles.fieldWide
                  }
                >
                  <span>
                    SHA-256
                  </span>
                  <input
                    name="checksumSha256"
                    minLength={64}
                    maxLength={64}
                    defaultValue=""
                    spellCheck={
                      false
                    }
                    placeholder="Nuevo SHA-256 opcional"
                  />
                  <small>
                    El checksum anterior nunca se hereda en una versión nueva.
                    {selectedPackage
                      ?.checksumSha256
                      ? " El paquete actual sí tiene un SHA-256 publicado."
                      : ""}
                    {" "}
                    {selectedPackage
                      ?.channel
                      ? channelLabels[
                          selectedPackage
                            .channel
                        ]
                      : "Sin canal"}
                  </small>
                </label>

                <label
                  className={
                    styles.fieldWide
                  }
                >
                  <span>
                    Resumen público
                  </span>
                  <textarea
                    name="summary"
                    maxLength={1500}
                    rows={5}
                    required
                  />
                </label>

                <div
                  className={
                    styles.fieldWide
                  }
                >
                  <GameDownloadEditor
                    initialSources={
                      initialSources
                    }
                  />
                </div>

                <div
                  className={
                    styles.formActions
                  }
                >
                  <p>
                    Al confirmar sólo
                    cambia{" "}
                    {releasePlatform}.
                    Los demás releases
                    permanecen
                    intactos.
                  </p>
                  <button type="submit">
                    <RefreshCcw
                      size={15}
                      aria-hidden="true"
                    />
                    Publicar nueva
                    versión
                  </button>
                </div>
              </fieldset>
            </form>
          </section>

          <section
            className={
              styles.editorPanel
            }
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <div>
                <span>
                  VERSIONES
                </span>
                <h2>
                  Historial público de{" "}
                  {releasePlatform}
                </h2>
              </div>
              <p>
                Esta cronología es
                contenido público
                legítimo; no es un
                sistema de
                restauración
                editorial.
              </p>
            </div>

            {relatedUpdates.length ? (
              <div
                className={
                  styles.tableWrap
                }
              >
                <table>
                  <thead>
                    <tr>
                      <th>
                        Versión
                      </th>
                      <th>
                        Tipo
                      </th>
                      <th>
                        Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedUpdates.map(
                      (update) => (
                        <tr
                          key={
                            update.key
                          }
                        >
                          <th scope="row">
                            {
                              update
                                .payload
                                .version
                            }
                          </th>
                          <td>
                            {
                              update
                                .payload
                                .type
                            }
                          </td>
                          <td>
                            {new Date(
                              update
                                .payload
                                .publishedAt
                            ).toLocaleDateString(
                              "es"
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p
                className={
                  styles.emptyState
                }
              >
                Todavía no hay
                versiones registradas
                para este release.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
