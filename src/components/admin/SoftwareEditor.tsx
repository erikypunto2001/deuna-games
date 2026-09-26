"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  DistributionPackageKind,
  GameDownloadSource,
} from "@/types/game";
import type { PlatformDefinition } from "@/types/platform";
import type {
  Software,
  SoftwarePackage,
} from "@/types/software";

import adminStyles from "../../app/admin/admin.module.css";
import styles from "./SoftwareEditor.module.css";

type Props = {
  mode: "create" | "edit";
  software?: Software;
  revision?: number;
  platforms: PlatformDefinition[];
};

const kinds: Array<{
  value: DistributionPackageKind;
  label: string;
}> = [
  { value: "installer", label: "Instalador" },
  { value: "archive", label: "Archivo comprimido" },
  { value: "portable", label: "Portable" },
  { value: "patch", label: "Parche" },
  { value: "other", label: "Otro" },
];

function id(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 160);
}

function nextId(base: string, used: string[]) {
  const root = id(base) || "item";
  if (!used.includes(root)) return root;
  let index = 2;
  while (used.includes(root + "-" + index)) index += 1;
  return (root + "-" + index).slice(0, 160);
}

function emptySource(current: GameDownloadSource[]): GameDownloadSource {
  return {
    id: nextId("mirror", current.map((item) => item.id)),
    name: "",
    href: "",
    enabled: true,
    status: "available",
  };
}

function emptyPackage(
  current: SoftwarePackage[],
  platformId: string
): SoftwarePackage {
  return {
    id: nextId("paquete", current.map((item) => item.id)),
    platformId,
    kind: "installer",
    enabled: true,
    sources: [],
  };
}

export default function SoftwareEditor({
  mode,
  software,
  revision,
  platforms,
}: Props) {
  const [slug, setSlug] = useState(software?.slug ?? "");
  const [runsOn, setRunsOn] = useState<string[]>(
    software?.runsOnPlatformIds ?? ["pc-windows"]
  );
  const [emulates, setEmulates] = useState<string[]>(
    software?.emulatesPlatformIds ?? []
  );
  const [packages, setPackages] = useState<SoftwarePackage[]>(
    () => structuredClone(software?.packages ?? [])
  );

  const packagesJson = useMemo(
    () =>
      JSON.stringify(
        packages.map((item) => ({
          ...item,
          id: id(item.id),
          label: item.label?.trim() || undefined,
          checksumSha256:
            item.checksumSha256?.trim().toLowerCase() || undefined,
          enabled: item.enabled !== false,
          sources: (item.sources ?? []).map((source) => ({
            ...source,
            id: id(source.id),
            name: source.name.trim(),
            href: source.href.trim(),
            label: source.label?.trim() || undefined,
            enabled: source.enabled !== false,
            status: source.status ?? "available",
          })),
        }))
      ),
    [packages]
  );

  function toggle(
    current: string[],
    setter: (next: string[]) => void,
    platformId: string
  ) {
    setter(
      current.includes(platformId)
        ? current.filter((item) => item !== platformId)
        : [...current, platformId]
    );
  }

  function patchPackage(
    packageIndex: number,
    patch: Partial<SoftwarePackage>
  ) {
    setPackages((current) =>
      current.map((item, index) =>
        index === packageIndex ? { ...item, ...patch } : item
      )
    );
  }

  function patchSource(
    packageIndex: number,
    sourceIndex: number,
    patch: Partial<GameDownloadSource>
  ) {
    const item = packages[packageIndex];
    const sources = [...(item.sources ?? [])];
    sources[sourceIndex] = { ...sources[sourceIndex], ...patch };
    patchPackage(packageIndex, { sources });
  }

  const activePlatforms = platforms.filter(
    (platform) => platform.active
  );

  return (
    <form
      method="post"
      action={
        mode === "create"
          ? "/api/admin/content/software"
          : "/api/admin/content/software/" +
            encodeURIComponent(software!.slug)
      }
      className={adminStyles.editorForm}
    >
      {mode === "edit" && (
        <input
          type="hidden"
          name="expectedRevision"
          value={revision}
        />
      )}
      <input type="hidden" name="runsOnJson" value={JSON.stringify(runsOn)} />
      <input
        type="hidden"
        name="emulatesJson"
        value={JSON.stringify(emulates)}
      />
      <input type="hidden" name="packagesJson" value={packagesJson} />

      <div className={styles.root + " " + adminStyles.fieldWide}>
        <div className={styles.grid}>
          {mode === "create" && (
            <label>
              <span>Slug permanente</span>
              <input
                name="slug"
                value={slug}
                onChange={(event) => setSlug(id(event.target.value))}
                minLength={1}
                maxLength={160}
                required
                placeholder="pcsx2"
              />
            </label>
          )}

          <label>
            <span>Nombre</span>
            <input
              name="name"
              defaultValue={software?.name ?? ""}
              maxLength={140}
              required
              placeholder="PCSX2"
            />
          </label>

          <label>
            <span>Tipo</span>
            <select name="kind" defaultValue={software?.kind ?? "emulator"}>
              <option value="emulator">Emulador</option>
              <option value="utility">Utilidad</option>
              <option value="upscaler">Escalado</option>
              <option value="launcher">Launcher</option>
              <option value="runtime">Runtime</option>
              <option value="other">Otro</option>
            </select>
          </label>

          <label>
            <span>Versión</span>
            <input
              name="version"
              defaultValue={software?.version ?? ""}
              maxLength={240}
              placeholder="Opcional"
            />
          </label>

          <label>
            <span>Desarrollador</span>
            <input
              name="developer"
              defaultValue={software?.developer ?? ""}
              maxLength={240}
              placeholder="Opcional"
            />
          </label>

          <label className={styles.wide}>
            <span>Descripción corta</span>
            <input
              name="shortDescription"
              defaultValue={software?.shortDescription ?? ""}
              maxLength={240}
              placeholder="Resumen para el catálogo"
            />
          </label>

          <label className={styles.wide}>
            <span>Descripción</span>
            <textarea
              name="description"
              defaultValue={software?.description ?? ""}
              rows={6}
              maxLength={3000}
              required
            />
          </label>

          <label>
            <span>Sitio oficial</span>
            <input
              name="website"
              defaultValue={software?.website ?? ""}
              maxLength={2048}
              placeholder="https://..."
            />
          </label>

          <label>
            <span>Destacado</span>
            <select
              name="featured"
              defaultValue={software?.featured ? "true" : "false"}
            >
              <option value="false">No</option>
              <option value="true">Sí</option>
            </select>
          </label>

          <div className={styles.wide}>
            <span>Se ejecuta en</span>
            <div className={styles.chips}>
              {activePlatforms.map((platform) => (
                <label key={platform.id} className={styles.chip}>
                  <input
                    type="checkbox"
                    checked={runsOn.includes(platform.id)}
                    onChange={() =>
                      toggle(runsOn, setRunsOn, platform.id)
                    }
                  />
                  {platform.name}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.wide}>
            <span>Plataformas que emula</span>
            <div className={styles.chips}>
              {activePlatforms
                .filter((platform) => platform.kind !== "pc")
                .map((platform) => (
                  <label key={platform.id} className={styles.chip}>
                    <input
                      type="checkbox"
                      checked={emulates.includes(platform.id)}
                      onChange={() =>
                        toggle(emulates, setEmulates, platform.id)
                      }
                    />
                    {platform.name}
                  </label>
                ))}
            </div>
          </div>
        </div>

        <div className={styles.packages}>
          <div className={styles.header}>
            <div>
              <strong>Paquetes de descarga</strong>
              <p>
                Cada paquete indica el sistema donde se ejecuta y puede tener
                varios mirrors.
              </p>
            </div>
            <button
              type="button"
              className={styles.add}
              onClick={() =>
                setPackages((current) => [
                  ...current,
                  emptyPackage(
                    current,
                    runsOn[0] ?? "pc-windows"
                  ),
                ])
              }
            >
              <Plus size={14} aria-hidden="true" />
              Agregar paquete
            </button>
          </div>

          {packages.length === 0 ? (
            <div className={styles.empty}>
              Puedes publicar la ficha antes de agregar una descarga.
            </div>
          ) : (
            packages.map((item, packageIndex) => (
              <div key={item.id + ":" + packageIndex} className={styles.package}>
                <div className={styles.header}>
                  <strong>Paquete {packageIndex + 1}</strong>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() =>
                      setPackages((current) =>
                        current.filter((_, index) => index !== packageIndex)
                      )
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
                        patchPackage(packageIndex, {
                          id: id(event.target.value),
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>Plataforma</span>
                    <select
                      value={item.platformId}
                      onChange={(event) =>
                        patchPackage(packageIndex, {
                          platformId: event.target.value,
                        })
                      }
                    >
                      {activePlatforms.map((platform) => (
                        <option key={platform.id} value={platform.id}>
                          {platform.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Formato</span>
                    <select
                      value={item.kind}
                      onChange={(event) =>
                        patchPackage(packageIndex, {
                          kind: event.target.value as DistributionPackageKind,
                        })
                      }
                    >
                      {kinds.map((kind) => (
                        <option key={kind.value} value={kind.value}>
                          {kind.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Etiqueta</span>
                    <input
                      value={item.label ?? ""}
                      onChange={(event) =>
                        patchPackage(packageIndex, {
                          label: event.target.value,
                        })
                      }
                      maxLength={240}
                      placeholder="Descargar para Windows"
                    />
                  </label>
                  <label className={styles.wide}>
                    <span>SHA-256</span>
                    <input
                      value={item.checksumSha256 ?? ""}
                      onChange={(event) =>
                        patchPackage(packageIndex, {
                          checksumSha256: event.target.value,
                        })
                      }
                      maxLength={64}
                      spellCheck={false}
                    />
                  </label>
                </div>

                <div className={styles.sources}>
                  <div className={styles.header}>
                    <strong>Mirrors</strong>
                    <button
                      type="button"
                      className={styles.add}
                      onClick={() => {
                        const sources = item.sources ?? [];
                        patchPackage(packageIndex, {
                          sources: [...sources, emptySource(sources)],
                        });
                      }}
                    >
                      <Plus size={14} aria-hidden="true" />
                      Agregar mirror
                    </button>
                  </div>

                  {(item.sources ?? []).map((source, sourceIndex) => (
                    <div
                      key={source.id + ":" + sourceIndex}
                      className={styles.source}
                    >
                      <label>
                        <span>Nombre</span>
                        <input
                          value={source.name}
                          onChange={(event) =>
                            patchSource(packageIndex, sourceIndex, {
                              name: event.target.value,
                            })
                          }
                          required
                        />
                      </label>
                      <label>
                        <span>URL</span>
                        <input
                          value={source.href}
                          maxLength={2048}
                          onChange={(event) =>
                            patchSource(packageIndex, sourceIndex, {
                              href: event.target.value,
                            })
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
                            patchSource(packageIndex, sourceIndex, {
                              status: event.target.value as
                                | "available"
                                | "down"
                                | "maintenance",
                            })
                          }
                        >
                          <option value="available">Disponible</option>
                          <option value="down">Caído</option>
                          <option value="maintenance">Mantenimiento</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className={styles.danger}
                        onClick={() =>
                          patchPackage(packageIndex, {
                            sources: (item.sources ?? []).filter(
                              (_, index) => index !== sourceIndex
                            ),
                          })
                        }
                        aria-label="Eliminar mirror"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={adminStyles.formActions}>
        <p>
          Guardar conserva el borrador. Publicar es una operación separada.
        </p>
        <button type="submit">
          {mode === "create" ? "Crear programa" : "Guardar programa"}
        </button>
      </div>
    </form>
  );
}
