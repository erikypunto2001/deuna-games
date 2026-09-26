"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  PlatformCatalog,
  PlatformDefinition,
  PlatformFamily,
} from "@/types/platform";

import adminStyles from "../../app/admin/admin.module.css";
import styles from "./PlatformCatalogEditor.module.css";

type Props = {
  revision: number;
  initialCatalog: PlatformCatalog;
};

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

export default function PlatformCatalogEditor({
  revision,
  initialCatalog,
}: Props) {
  const [families, setFamilies] = useState<PlatformFamily[]>(
    () => structuredClone(initialCatalog.families)
  );
  const [platforms, setPlatforms] = useState<PlatformDefinition[]>(
    () => structuredClone(initialCatalog.platforms)
  );
  const [lockedFamilyIds] = useState(
    () =>
      new Set(
        initialCatalog.families.map(
          (item) => item.id
        )
      )
  );
  const [lockedPlatformIds] = useState(
    () =>
      new Set(
        initialCatalog.platforms.map(
          (item) => item.id
        )
      )
  );

  const serialized = useMemo(
    () =>
      JSON.stringify({
        families: families.map((item) => ({
          ...item,
          id: id(item.id),
          name: item.name.trim(),
        })),
        platforms: platforms.map((item) => ({
          ...item,
          id: id(item.id),
          familyId: id(item.familyId),
          name: item.name.trim(),
          shortName: item.shortName?.trim() || undefined,
        })),
      }),
    [families, platforms]
  );

  function patchFamily(index: number, patch: Partial<PlatformFamily>) {
    setFamilies((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function patchPlatform(
    index: number,
    patch: Partial<PlatformDefinition>
  ) {
    setPlatforms((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function addFamily() {
    setFamilies((current) => [
      ...current,
      {
        id: nextId("familia", current.map((item) => item.id)),
        name: "",
        order: (current.length + 1) * 10,
        active: true,
      },
    ]);
  }

  function addPlatform() {
    const familyId = families.find((item) => item.active)?.id ?? families[0]?.id;
    if (!familyId) return;
    setPlatforms((current) => [
      ...current,
      {
        id: nextId("plataforma", current.map((item) => item.id)),
        familyId,
        name: "",
        kind: "console",
        order: (current.length + 1) * 10,
        active: true,
      },
    ]);
  }

  return (
    <form
      method="post"
      action="/api/admin/content/platforms"
      className={adminStyles.editorForm}
    >
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="catalogJson" value={serialized} />

      <div className={styles.root + " " + adminStyles.fieldWide}>
        <section className={styles.section}>
          <div className={styles.header}>
            <div>
              <strong>Familias</strong>
              <p>
                Agrupan consolas relacionadas, por ejemplo PlayStation,
                Nintendo o Sega.
              </p>
            </div>
            <button type="button" className={styles.add} onClick={addFamily}>
              <Plus size={14} aria-hidden="true" />
              Nueva familia
            </button>
          </div>

          <div className={styles.list}>
            {families.map((family, index) => {
              const locked = lockedFamilyIds.has(family.id);
              return (
                <div
                  key={family.id + ":" + index}
                  className={styles.row + " " + styles.familyRow}
                >
                  <label>
                    <span>ID permanente</span>
                    <input
                      value={family.id}
                      disabled={locked}
                      onChange={(event) =>
                        patchFamily(index, { id: id(event.target.value) })
                      }
                      required
                    />
                    {locked && (
                      <small className={styles.locked}>No cambia.</small>
                    )}
                  </label>
                  <label>
                    <span>Nombre</span>
                    <input
                      value={family.name}
                      onChange={(event) =>
                        patchFamily(index, { name: event.target.value })
                      }
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    <span>Orden</span>
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      value={family.order}
                      onChange={(event) =>
                        patchFamily(index, {
                          order: Number(event.target.value),
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>Estado</span>
                    <select
                      value={family.active ? "true" : "false"}
                      onChange={(event) =>
                        patchFamily(index, {
                          active: event.target.value === "true",
                        })
                      }
                    >
                      <option value="true">Activa</option>
                      <option value="false">Inactiva</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={locked}
                    onClick={() =>
                      setFamilies((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Quitar
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.header}>
            <div>
              <strong>Plataformas y consolas</strong>
              <p>
                Los IDs ya guardados son permanentes. Puedes renombrar,
                reordenar o desactivar una consola sin romper sus juegos.
              </p>
            </div>
            <button
              type="button"
              className={styles.add}
              onClick={addPlatform}
              disabled={families.length === 0}
            >
              <Plus size={14} aria-hidden="true" />
              Nueva plataforma
            </button>
          </div>

          {platforms.length ? (
            <div className={styles.list}>
              {platforms.map((platform, index) => {
                const locked = lockedPlatformIds.has(platform.id);
                return (
                  <div
                    key={platform.id + ":" + index}
                    className={styles.row}
                  >
                    <label>
                      <span>ID permanente</span>
                      <input
                        value={platform.id}
                        disabled={locked}
                        onChange={(event) =>
                          patchPlatform(index, { id: id(event.target.value) })
                        }
                        required
                      />
                    </label>
                    <label>
                      <span>Nombre</span>
                      <input
                        value={platform.name}
                        onChange={(event) =>
                          patchPlatform(index, { name: event.target.value })
                        }
                        maxLength={100}
                        required
                      />
                    </label>
                    <label>
                      <span>Familia</span>
                      <select
                        value={platform.familyId}
                        onChange={(event) =>
                          patchPlatform(index, {
                            familyId: event.target.value,
                          })
                        }
                      >
                        {families.map((family) => (
                          <option key={family.id} value={family.id}>
                            {family.name || family.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Tipo</span>
                      <select
                        value={platform.kind}
                        onChange={(event) =>
                          patchPlatform(index, {
                            kind: event.target.value as
                              | "pc"
                              | "console"
                              | "handheld",
                          })
                        }
                      >
                        <option value="pc">PC</option>
                        <option value="console">Consola</option>
                        <option value="handheld">Portátil</option>
                      </select>
                    </label>
                    <label>
                      <span>Orden</span>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={platform.order}
                        onChange={(event) =>
                          patchPlatform(index, {
                            order: Number(event.target.value),
                          })
                        }
                        required
                      />
                    </label>
                    <button
                      type="button"
                      className={styles.danger}
                      disabled={locked}
                      onClick={() =>
                        setPlatforms((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Quitar
                    </button>
                    <label>
                      <span>Nombre corto</span>
                      <input
                        value={platform.shortName ?? ""}
                        onChange={(event) =>
                          patchPlatform(index, {
                            shortName: event.target.value,
                          })
                        }
                        maxLength={40}
                        placeholder="PS2"
                      />
                    </label>
                    <label>
                      <span>Estado</span>
                      <select
                        value={platform.active ? "true" : "false"}
                        onChange={(event) =>
                          patchPlatform(index, {
                            active: event.target.value === "true",
                          })
                        }
                      >
                        <option value="true">Activa</option>
                        <option value="false">Inactiva</option>
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.empty}>No hay plataformas definidas.</div>
          )}
        </section>
      </div>

      <div className={adminStyles.formActions}>
        <p>
          Guardar modifica el borrador del catálogo. Publicar aplica los
          nombres y nuevas consolas a la web.
        </p>
        <button type="submit">Guardar plataformas</button>
      </div>
    </form>
  );
}
