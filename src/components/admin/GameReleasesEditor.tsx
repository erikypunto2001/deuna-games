"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  DistributionPackage,
  DistributionPackageKind,
  GameDownloadSource,
  GameRelease,
} from "@/types/game";
import type { PlatformDefinition } from "@/types/platform";

import adminStyles from "../../app/admin/admin.module.css";
import styles from "./GameReleasesEditor.module.css";

type SoftwareOption = {
  slug: string;
  name: string;
};

type Props = {
  slug: string;
  revision: number;
  initialReleases: GameRelease[];
  platforms: PlatformDefinition[];
  software: SoftwareOption[];
};

const kinds: Array<{
  value: DistributionPackageKind;
  label: string;
}> = [
  { value: "installer", label: "Instalador" },
  { value: "archive", label: "Archivo comprimido" },
  { value: "portable", label: "Portable" },
  { value: "iso", label: "ISO" },
  { value: "chd", label: "CHD" },
  { value: "cso", label: "CSO" },
  { value: "rvz", label: "RVZ" },
  { value: "gdi", label: "GDI" },
  { value: "pkg", label: "PKG" },
  { value: "patch", label: "Parche" },
  { value: "other", label: "Otro" },
];

function normalizeId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 160);
}

function uniqueId(base: string, used: readonly string[]) {
  const root = normalizeId(base) || "item";
  if (!used.includes(root)) return root;
  let index = 2;
  while (used.includes(root + "-" + index)) index += 1;
  return (root + "-" + index).slice(0, 160);
}

function makeSource(sources: GameDownloadSource[]): GameDownloadSource {
  return {
    id: uniqueId("mirror", sources.map((item) => item.id)),
    name: "",
    href: "",
    enabled: true,
    status: "available",
  };
}

function makePackage(packages: DistributionPackage[]): DistributionPackage {
  return {
    id: uniqueId("paquete", packages.map((item) => item.id)),
    kind: "archive",
    enabled: true,
    sources: [],
  };
}

function compact(releases: GameRelease[]) {
  return releases.map((release) => ({
    ...release,
    id: normalizeId(release.id),
    label: release.label?.trim() || undefined,
    region: release.region?.trim() || undefined,
    releaseDate: release.releaseDate?.trim() || undefined,
    version: release.version?.trim() || undefined,
    recommendedSoftwareSlugs:
      release.recommendedSoftwareSlugs?.length
        ? release.recommendedSoftwareSlugs
        : undefined,
    packages: release.packages?.length
      ? release.packages.map((item) => ({
          ...item,
          id: normalizeId(item.id),
          label: item.label?.trim() || undefined,
          checksumSha256:
            item.checksumSha256?.trim().toLowerCase() || undefined,
          enabled: item.enabled !== false,
          sources: item.sources?.map((source) => ({
            ...source,
            id: normalizeId(source.id),
            name: source.name.trim(),
            href: source.href.trim(),
            label: source.label?.trim() || undefined,
            enabled: source.enabled !== false,
            status: source.status ?? "available",
          })),
        }))
      : undefined,
  }));
}

export default function GameReleasesEditor({
  slug,
  revision,
  initialReleases,
  platforms,
  software,
}: Props) {
  const [releases, setReleases] = useState<GameRelease[]>(
    () => structuredClone(initialReleases)
  );
  const [lockedIds] = useState(
    () =>
      new Set(
        initialReleases.map(
          (release) =>
            release.id
        )
      )
  );
  const serialized = useMemo(
    () => JSON.stringify(compact(releases)),
    [releases]
  );

  function patchRelease(index: number, patch: Partial<GameRelease>) {
    setReleases((current) =>
      current.map((release, itemIndex) =>
        itemIndex === index ? { ...release, ...patch } : release
      )
    );
  }

  function addRelease() {
    setReleases((current) => {
      const usedPlatforms = new Set(current.map((item) => item.platformId));
      const platform =
        platforms.find((item) => item.active && !usedPlatforms.has(item.id)) ??
        platforms.find((item) => item.active);
      if (!platform) return current;
      return [
        ...current,
        {
          id: uniqueId(platform.id, current.map((item) => item.id)),
          platformId: platform.id,
          packages: [],
        },
      ];
    });
  }

  function patchPackage(
    releaseIndex: number,
    packageIndex: number,
    patch: Partial<DistributionPackage>
  ) {
    const release = releases[releaseIndex];
    const packages = [...(release.packages ?? [])];
    packages[packageIndex] = { ...packages[packageIndex], ...patch };
    patchRelease(releaseIndex, { packages });
  }

  function addPackage(releaseIndex: number) {
    const packages = releases[releaseIndex].packages ?? [];
    patchRelease(releaseIndex, {
      packages: [...packages, makePackage(packages)],
    });
  }

  function patchSource(
    releaseIndex: number,
    packageIndex: number,
    sourceIndex: number,
    patch: Partial<GameDownloadSource>
  ) {
    const item = releases[releaseIndex].packages?.[packageIndex];
    if (!item) return;
    const sources = [...(item.sources ?? [])];
    sources[sourceIndex] = { ...sources[sourceIndex], ...patch };
    patchPackage(releaseIndex, packageIndex, { sources });
  }

  function toggleSoftware(releaseIndex: number, softwareSlug: string) {
    const current = releases[releaseIndex].recommendedSoftwareSlugs ?? [];
    patchRelease(releaseIndex, {
      recommendedSoftwareSlugs: current.includes(softwareSlug)
        ? current.filter((item) => item !== softwareSlug)
        : [...current, softwareSlug],
    });
  }

  return (
    <section className={adminStyles.editorPanel}>
      <div className={adminStyles.sectionHeading}>
        <div>
          <span>PLATAFORMAS Y DESCARGAS</span>
          <h2>Releases del juego</h2>
        </div>
        <p>
          Cada plataforma conserva su versión, formato, mirrors y programas
          relacionados. Los requisitos y FPS siguen siendo exclusivos del
          release PC.
        </p>
      </div>

      <form
        method="post"
        action={
          "/api/admin/content/games/" +
          encodeURIComponent(slug) +
          "/releases"
        }
        className={adminStyles.editorForm}
      >
        <input type="hidden" name="expectedRevision" value={revision} />
        <input type="hidden" name="releasesJson" value={serialized} />

        <div className={styles.root + " " + adminStyles.fieldWide}>
          <div className={styles.toolbar}>
            <div>
              <strong>{releases.length} releases configurados</strong>
              <p className={styles.note}>
                Las nuevas consolas se habilitan desde el catálogo de
                Plataformas y aparecen aquí automáticamente.
              </p>
            </div>
            <button type="button" className={styles.add} onClick={addRelease}>
              <Plus size={16} aria-hidden="true" />
              Agregar release
            </button>
          </div>

          {releases.length === 0 ? (
            <div className={styles.empty}>
              Agrega PC o una consola para comenzar.
            </div>
          ) : (
            releases.map((release, releaseIndex) => {
              const packages = release.packages ?? [];
              return (
                <fieldset
                  key={release.id + ":" + releaseIndex}
                  className={styles.release}
                >
                  <div className={styles.header}>
                    <div>
                      <strong>Release {releaseIndex + 1}</strong>
                      <small>{release.id}</small>
                    </div>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() =>
                        setReleases((current) =>
                          current.filter((_, index) => index !== releaseIndex)
                        )
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Quitar release
                    </button>
                  </div>

                  <div className={styles.grid}>
                    <label>
                      <span>Plataforma</span>
                      <select
                        value={release.platformId}
                        onChange={(event) =>
                          patchRelease(releaseIndex, {
                            platformId: event.target.value,
                          })
                        }
                        required
                      >
                        {platforms.map((platform) => (
                          <option
                            key={platform.id}
                            value={platform.id}
                            disabled={
                              !platform.active &&
                              platform.id !== release.platformId
                            }
                          >
                            {platform.name}
                            {!platform.active ? " · inactiva" : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>ID permanente</span>
                      <input
                        value={release.id}
                        disabled={lockedIds.has(release.id)}
                        onChange={(event) =>
                          patchRelease(releaseIndex, {
                            id: normalizeId(event.target.value),
                          })
                        }
                        required
                      />
                    </label>

                    <label>
                      <span>Nombre opcional</span>
                      <input
                        value={release.label ?? ""}
                        maxLength={240}
                        onChange={(event) =>
                          patchRelease(releaseIndex, {
                            label: event.target.value,
                          })
                        }
                        placeholder="Ej. Edición estándar"
                      />
                    </label>

                    <label>
                      <span>Versión</span>
                      <input
                        value={release.version ?? ""}
                        maxLength={240}
                        onChange={(event) =>
                          patchRelease(releaseIndex, {
                            version: event.target.value,
                          })
                        }
                        placeholder="Opcional"
                      />
                    </label>

                    <label>
                      <span>Región</span>
                      <input
                        value={release.region ?? ""}
                        maxLength={80}
                        onChange={(event) =>
                          patchRelease(releaseIndex, {
                            region: event.target.value,
                          })
                        }
                        placeholder="USA / EUR / JPN"
                      />
                    </label>

                    <label>
                      <span>Fecha de lanzamiento</span>
                      <input
                        type="date"
                        value={release.releaseDate ?? ""}
                        onChange={(event) =>
                          patchRelease(releaseIndex, {
                            releaseDate: event.target.value,
                          })
                        }
                      />
                    </label>

                    {software.length > 0 && (
                      <div className={styles.wide}>
                        <span>Programas relacionados</span>
                        <div className={styles.software}>
                          {software.map((item) => (
                            <label key={item.slug}>
                              <input
                                type="checkbox"
                                checked={(
                                  release.recommendedSoftwareSlugs ?? []
                                ).includes(item.slug)}
                                onChange={() =>
                                  toggleSoftware(releaseIndex, item.slug)
                                }
                              />
                              {item.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.packages}>
                    <div className={styles.toolbar}>
                      <strong>Paquetes</strong>
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={() => addPackage(releaseIndex)}
                      >
                        <Plus size={14} aria-hidden="true" />
                        Agregar paquete
                      </button>
                    </div>

                    {packages.length === 0 ? (
                      <div className={styles.empty}>
                        Sin paquetes. Puedes publicar una ficha sin descarga.
                      </div>
                    ) : (
                      packages.map((item, packageIndex) => (
                        <div
                          key={item.id + ":" + packageIndex}
                          className={styles.package}
                        >
                          <div className={styles.header}>
                            <strong>Paquete {packageIndex + 1}</strong>
                            <button
                              type="button"
                              className={styles.danger}
                              onClick={() =>
                                patchRelease(releaseIndex, {
                                  packages: packages.filter(
                                    (_, index) => index !== packageIndex
                                  ),
                                })
                              }
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Eliminar
                            </button>
                          </div>

                          <div className={styles.grid}>
                            <label>
                              <span>ID</span>
                              <input
                                value={item.id}
                                onChange={(event) =>
                                  patchPackage(releaseIndex, packageIndex, {
                                    id: normalizeId(event.target.value),
                                  })
                                }
                                required
                              />
                            </label>

                            <label>
                              <span>Formato</span>
                              <select
                                value={item.kind}
                                onChange={(event) =>
                                  patchPackage(releaseIndex, packageIndex, {
                                    kind: event.target
                                      .value as DistributionPackageKind,
                                  })
                                }
                              >
                                {kinds.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label>
                              <span>Texto visible</span>
                              <input
                                value={item.label ?? ""}
                                maxLength={240}
                                onChange={(event) =>
                                  patchPackage(releaseIndex, packageIndex, {
                                    label: event.target.value,
                                  })
                                }
                                placeholder="Ej. ISO original"
                              />
                            </label>

                            <label>
                              <span>Tamaño (GB)</span>
                              <input
                                type="number"
                                min="0.01"
                                max="100000"
                                step="0.01"
                                value={item.sizeGb ?? ""}
                                onChange={(event) =>
                                  patchPackage(releaseIndex, packageIndex, {
                                    sizeGb: event.target.value
                                      ? Number(event.target.value)
                                      : undefined,
                                  })
                                }
                              />
                            </label>

                            <label>
                              <span>Canal</span>
                              <select
                                value={item.channel ?? ""}
                                onChange={(event) =>
                                  patchPackage(releaseIndex, packageIndex, {
                                    channel: event.target.value
                                      ? (event.target.value as
                                          | "stable"
                                          | "beta"
                                          | "testing")
                                      : undefined,
                                  })
                                }
                              >
                                <option value="">Sin definir</option>
                                <option value="stable">Estable</option>
                                <option value="beta">Beta</option>
                                <option value="testing">Pruebas</option>
                              </select>
                            </label>

                            <label className={styles.wide}>
                              <span>SHA-256</span>
                              <input
                                value={item.checksumSha256 ?? ""}
                                maxLength={64}
                                spellCheck={false}
                                onChange={(event) =>
                                  patchPackage(releaseIndex, packageIndex, {
                                    checksumSha256: event.target.value,
                                  })
                                }
                                placeholder="Opcional · 64 caracteres hexadecimales"
                              />
                            </label>
                          </div>

                          <div className={styles.sources}>
                            <div className={styles.toolbar}>
                              <strong>Mirrors</strong>
                              <button
                                type="button"
                                className={styles.ghost}
                                onClick={() => {
                                  const sources = item.sources ?? [];
                                  patchPackage(releaseIndex, packageIndex, {
                                    sources: [
                                      ...sources,
                                      makeSource(sources),
                                    ],
                                  });
                                }}
                              >
                                <Plus size={14} aria-hidden="true" />
                                Agregar mirror
                              </button>
                            </div>

                            {(item.sources ?? []).map(
                              (source, sourceIndex) => (
                                <div
                                  key={source.id + ":" + sourceIndex}
                                  className={styles.source}
                                >
                                  <label>
                                    <span>Nombre</span>
                                    <input
                                      value={source.name}
                                      maxLength={100}
                                      onChange={(event) =>
                                        patchSource(
                                          releaseIndex,
                                          packageIndex,
                                          sourceIndex,
                                          { name: event.target.value }
                                        )
                                      }
                                      placeholder="MediaFire"
                                      required
                                    />
                                  </label>
                                  <label>
                                    <span>URL</span>
                                    <input
                                      value={source.href}
                                      maxLength={2048}
                                      onChange={(event) =>
                                        patchSource(
                                          releaseIndex,
                                          packageIndex,
                                          sourceIndex,
                                          { href: event.target.value }
                                        )
                                      }
                                      placeholder="https://..."
                                      required
                                    />
                                  </label>
                                  <label>
                                    <span>Estado</span>
                                    <select
                                      value={source.status ?? "available"}
                                      onChange={(event) =>
                                        patchSource(
                                          releaseIndex,
                                          packageIndex,
                                          sourceIndex,
                                          {
                                            status: event.target.value as
                                              | "available"
                                              | "down"
                                              | "maintenance",
                                          }
                                        )
                                      }
                                    >
                                      <option value="available">
                                        Disponible
                                      </option>
                                      <option value="down">Caído</option>
                                      <option value="maintenance">
                                        Mantenimiento
                                      </option>
                                    </select>
                                  </label>
                                  <button
                                    type="button"
                                    className={styles.danger}
                                    onClick={() =>
                                      patchPackage(
                                        releaseIndex,
                                        packageIndex,
                                        {
                                          sources: (item.sources ?? []).filter(
                                            (_, index) =>
                                              index !== sourceIndex
                                          ),
                                        }
                                      )
                                    }
                                    aria-label="Eliminar mirror"
                                  >
                                    <Trash2 size={14} aria-hidden="true" />
                                  </button>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </fieldset>
              );
            })
          )}
        </div>

        <div className={adminStyles.formActions}>
          <p>
            Guardar modifica sólo el borrador. La web cambia únicamente al
            publicar el juego.
          </p>
          <button type="submit">
            Guardar plataformas y descargas
          </button>
        </div>
      </form>
    </section>
  );
}
