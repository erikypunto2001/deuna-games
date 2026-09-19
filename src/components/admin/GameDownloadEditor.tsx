"use client";

import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  GameDownloadSource,
  GameDownloadSourceStatus,
} from "@/types/game";

import styles from "./GameDownloadEditor.module.css";

type GameDownloadEditorProps = {
  id?: string;
  initialSources: GameDownloadSource[];
};

const MAX_EDITOR_SOURCES = 6;

const statusOptions: Array<{
  value: GameDownloadSourceStatus;
  label: string;
}> = [
  { value: "available", label: "Disponible" },
  { value: "down", label: "Caído" },
  { value: "maintenance", label: "Mantenimiento" },
];

function normalizeIdentifier(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 160);
}

function normalizeSource(
  source: GameDownloadSource
): GameDownloadSource {
  return {
    ...source,
    id: normalizeIdentifier(source.id),
    enabled: source.enabled !== false,
    status: source.status ?? "available",
  };
}

function emptySource(
  sources: GameDownloadSource[]
): GameDownloadSource {
  let index = sources.length + 1;
  let id = `source-${index}`;
  const used = new Set(
    sources.map((source) => normalizeIdentifier(source.id))
  );

  while (used.has(id)) {
    index += 1;
    id = `source-${index}`;
  }

  return {
    id,
    name: "",
    href: "",
    label: "",
    enabled: true,
    status: "available",
  };
}

export default function GameDownloadEditor({
  id,
  initialSources,
}: GameDownloadEditorProps) {
  const [sources, setSources] = useState<
    GameDownloadSource[]
  >(() =>
    initialSources
      .slice(0, MAX_EDITOR_SOURCES)
      .map(normalizeSource)
  );

  const serialized = useMemo(
    () =>
      JSON.stringify(
        sources.map((source) => ({
          id: normalizeIdentifier(source.id),
          name: source.name.trim(),
          href: source.href.trim(),
          ...(source.label?.trim()
            ? { label: source.label.trim() }
            : {}),
          enabled: source.enabled !== false,
          status: source.status ?? "available",
        }))
      ),
    [sources]
  );

  function patchSource(
    index: number,
    patch: Partial<GameDownloadSource>
  ) {
    setSources((current) =>
      current.map((source, sourceIndex) =>
        sourceIndex === index
          ? { ...source, ...patch }
          : source
      )
    );
  }

  function removeSource(index: number) {
    setSources((current) =>
      current.filter(
        (_, sourceIndex) => sourceIndex !== index
      )
    );
  }

  function moveSource(
    index: number,
    direction: -1 | 1
  ) {
    setSources((current) => {
      const target = index + direction;

      if (
        target < 0 ||
        target >= current.length
      ) {
        return current;
      }

      const next = [...current];
      const [source] = next.splice(index, 1);
      next.splice(target, 0, source);
      return next;
    });
  }

  function addSource() {
    setSources((current) =>
      current.length >= MAX_EDITOR_SOURCES
        ? current
        : [...current, emptySource(current)]
    );
  }

  return (
    <div id={id} className={styles.root}>
      <input
        type="hidden"
        name="sourcesJson"
        value={serialized}
      />

      <div className={styles.heading}>
        <div>
          <strong>Fuentes de descarga</strong>
          <span>
            El orden de esta lista será el orden mostrado al visitante. Puedes ocultar una fuente sin borrarla o marcarla como caída.
          </span>
        </div>
        <button
          type="button"
          className={styles.addButton}
          onClick={addSource}
          disabled={sources.length >= MAX_EDITOR_SOURCES}
        >
          <Plus size={15} aria-hidden="true" />
          Agregar fuente
        </button>
      </div>

      {sources.length === 0 ? (
        <div className={styles.empty}>
          Este juego todavía no tiene fuentes de descarga configuradas.
        </div>
      ) : (
        <div className={styles.list}>
          {sources.map((source, index) => {
            const enabled = source.enabled !== false;

            return (
              <fieldset
                key={index}
                className={styles.source}
                data-enabled={enabled ? "true" : "false"}
              >
                <legend>
                  Fuente {index + 1}
                  {!enabled && " · oculta"}
                </legend>

                <div className={styles.sourceToolbar}>
                  <button
                    type="button"
                    onClick={() => moveSource(index, -1)}
                    disabled={index === 0}
                    aria-label={`Subir fuente ${index + 1}`}
                    title="Subir"
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSource(index, 1)}
                    disabled={index === sources.length - 1}
                    aria-label={`Bajar fuente ${index + 1}`}
                    title="Bajar"
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.visibilityButton}
                    onClick={() =>
                      patchSource(index, {
                        enabled: !enabled,
                      })
                    }
                    aria-pressed={enabled}
                    aria-label={
                      enabled
                        ? `Ocultar fuente ${index + 1}`
                        : `Mostrar fuente ${index + 1}`
                    }
                    title={enabled ? "Ocultar" : "Mostrar"}
                  >
                    {enabled ? (
                      <Eye size={14} aria-hidden="true" />
                    ) : (
                      <EyeOff size={14} aria-hidden="true" />
                    )}
                  </button>
                </div>

                <label>
                  <span>Identificador</span>
                  <input
                    value={source.id}
                    onChange={(event) =>
                      patchSource(index, {
                        id: event.target.value,
                      })
                    }
                    onBlur={(event) =>
                      patchSource(index, {
                        id: normalizeIdentifier(
                          event.target.value
                        ),
                      })
                    }
                    maxLength={160}
                    pattern="[a-z0-9][a-z0-9._-]*"
                    title="Se guarda en minúsculas y sin espacios; por ejemplo: server-1"
                    placeholder="mediafire"
                    required
                  />
                  <small>
                    Se normaliza automáticamente: “Server 1” → “server-1”.
                  </small>
                </label>

                <label>
                  <span>Nombre visible</span>
                  <input
                    value={source.name}
                    onChange={(event) =>
                      patchSource(index, {
                        name: event.target.value,
                      })
                    }
                    maxLength={100}
                    placeholder="MediaFire"
                    required
                  />
                </label>

                <label>
                  <span>Estado</span>
                  <select
                    value={source.status ?? "available"}
                    onChange={(event) =>
                      patchSource(index, {
                        status: event.target.value as GameDownloadSourceStatus,
                      })
                    }
                  >
                    {statusOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.hrefField}>
                  <span>Dirección</span>
                  <input
                    value={source.href}
                    onChange={(event) =>
                      patchSource(index, {
                        href: event.target.value,
                      })
                    }
                    maxLength={2048}
                    placeholder="HTTPS o ruta interna"
                    required
                  />
                </label>

                <label>
                  <span>Texto del botón</span>
                  <input
                    value={source.label ?? ""}
                    onChange={(event) =>
                      patchSource(index, {
                        label: event.target.value,
                      })
                    }
                    maxLength={240}
                    placeholder="Ir al enlace"
                  />
                </label>

                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeSource(index)}
                  aria-label={`Eliminar fuente ${index + 1}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Eliminar
                </button>
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}