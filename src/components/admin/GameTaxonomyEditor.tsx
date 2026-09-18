"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import type { CSSProperties } from "react";
import {
  useMemo,
  useState,
} from "react";

import TaxonomyIcon from "@/components/taxonomy/TaxonomyIcon";
import {
  taxonomyIconOptions,
  taxonomyToneOptions,
  withTaxonomyVisualDefaults,
} from "@/lib/games/taxonomy-presentation";
import type {
  GameTaxonomy,
  GameTaxonomyIcon,
  GameTaxonomyKind,
  GameTaxonomyTerm,
  GameTaxonomyTone,
} from "@/types/game-taxonomy";

import styles from "./GameTaxonomyEditor.module.css";

type Usage = Record<
  GameTaxonomyKind,
  Record<string, number>
>;

type Section = {
  kind: GameTaxonomyKind;
  title: string;
  eyebrow: string;
  description: string;
  singular: string;
};

type IconUploadResponse = {
  publicPath?: unknown;
  format?: unknown;
  error?: unknown;
};

const customIconPattern =
  /^\/media\/editorial\/taxonomy-icons\/[a-f0-9]{64}\.(?:svg|webp)$/;
const TERMS_PER_PAGE = 12;

const sections: Section[] = [
  {
    kind: "classifications",
    title: "Clasificaciones",
    eyebrow: "CLASIFICACIÓN MAESTRA",
    description:
      "Acción, Aventura, RPG, Carreras, Puzzle y el resto viven en una única lista. Desde aquí controlas nombre, icono, color, orden y estado para toda la web.",
    singular: "clasificación",
  },
  {
    kind: "tags",
    title: "Etiquetas",
    eyebrow: "ATRIBUTOS DESCRIPTIVOS",
    description:
      "Mundo abierto, Cooperativo, Ciencia ficción y otros atributos complementarios. Se mantienen separados porque describen al juego, pero no reemplazan su clasificación.",
    singular: "etiqueta",
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function keyFromLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

function availableKey(
  base: string,
  terms: GameTaxonomyTerm[]
) {
  const used = new Set(terms.map((term) => term.key));
  const safeBase = base || "termino";
  if (!used.has(safeBase)) return safeBase;

  for (let index = 2; index < 10_000; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${safeBase.slice(
      0,
      160 - suffix.length
    )}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  return "";
}

function visualizedTaxonomy(
  taxonomy: GameTaxonomy
): GameTaxonomy {
  return {
    classifications: taxonomy.classifications.map(
      withTaxonomyVisualDefaults
    ),
    tags: taxonomy.tags,
  };
}

export default function GameTaxonomyEditor({
  initialTaxonomy,
  revision,
  usage,
  section,
}: {
  initialTaxonomy: GameTaxonomy;
  revision: number;
  usage: Usage;
  section: GameTaxonomyKind;
}) {
  const [taxonomy, setTaxonomy] = useState(() =>
    visualizedTaxonomy(initialTaxonomy)
  );
  const [draftLabels, setDraftLabels] = useState<
    Record<GameTaxonomyKind, string>
  >({
    classifications: "",
    tags: "",
  });
  const [feedback, setFeedback] = useState("");
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const serialized = useMemo(
    () => JSON.stringify(taxonomy),
    [taxonomy]
  );
  const currentSection =
    sections.find((candidate) => candidate.kind === section) ?? sections[0];
  const terms = taxonomy[currentSection.kind];
  const active = terms.filter((term) => term.active).length;
  const normalizedQuery = normalize(query);
  const matchingTerms = terms
    .map((term, index) => ({ term, index }))
    .filter(({ term }) =>
      !normalizedQuery ||
      normalize(`${term.label} ${term.key}`).includes(normalizedQuery)
    );
  const pageCount = Math.max(
    1,
    Math.ceil(matchingTerms.length / TERMS_PER_PAGE)
  );
  const currentPage = Math.min(page, pageCount - 1);
  const visibleTerms = matchingTerms.slice(
    currentPage * TERMS_PER_PAGE,
    (currentPage + 1) * TERMS_PER_PAGE
  );
  const hasVisuals = currentSection.kind === "classifications";
  const returnSection = hasVisuals ? "clasificaciones" : "etiquetas";

  function updateTerms(
    kind: GameTaxonomyKind,
    update: (terms: GameTaxonomyTerm[]) => GameTaxonomyTerm[]
  ) {
    setTaxonomy((current) => ({
      ...current,
      [kind]: update(current[kind]),
    }));
  }

  function addTerm(sectionDefinition: Section) {
    const label = draftLabels[sectionDefinition.kind].trim();
    if (!label) return;

    const currentTerms = taxonomy[sectionDefinition.kind];
    if (
      currentTerms.some(
        (term) => normalize(term.label) === normalize(label)
      )
    ) {
      setFeedback(
        `Ya existe una ${sectionDefinition.singular} con ese nombre o uno equivalente.`
      );
      return;
    }

    const key = availableKey(keyFromLabel(label), currentTerms);
    if (!key) {
      setFeedback(
        "No se pudo generar un identificador único para el término."
      );
      return;
    }

    const base: GameTaxonomyTerm = {
      key,
      label,
      active: true,
    };
    const term =
      sectionDefinition.kind === "tags"
        ? base
        : withTaxonomyVisualDefaults(base, currentTerms.length);

    updateTerms(sectionDefinition.kind, (current) => [
      ...current,
      term,
    ]);
    setQuery("");
    setPage(Math.floor(currentTerms.length / TERMS_PER_PAGE));
    setDraftLabels((current) => ({
      ...current,
      [sectionDefinition.kind]: "",
    }));
    setFeedback("");
  }

  function renameTerm(
    kind: GameTaxonomyKind,
    key: string,
    label: string
  ) {
    updateTerms(kind, (currentTerms) =>
      currentTerms.map((term) =>
        term.key === key
          ? { ...term, label }
          : term
      )
    );
  }

  function setVisual(
    kind: GameTaxonomyKind,
    key: string,
    field: "icon" | "tone",
    value: GameTaxonomyIcon | GameTaxonomyTone
  ) {
    updateTerms(kind, (currentTerms) =>
      currentTerms.map((term) => {
        if (term.key !== key) return term;

        if (field === "icon") {
          return {
            ...term,
            icon: value as GameTaxonomyIcon,
            iconAsset: undefined,
          };
        }

        return {
          ...term,
          tone: value as GameTaxonomyTone,
        };
      })
    );
  }

  function clearCustomIcon(
    kind: GameTaxonomyKind,
    key: string
  ) {
    updateTerms(kind, (currentTerms) =>
      currentTerms.map((term) =>
        term.key === key
          ? { ...term, iconAsset: undefined }
          : term
      )
    );
    setFeedback(
      "Se volvió al icono de biblioteca. Guarda clasificaciones para confirmar el cambio."
    );
  }

  async function uploadCustomIcon(
    kind: GameTaxonomyKind,
    key: string,
    file: File
  ) {
    const type = file.type.toLowerCase();

    if (
      type !== "image/svg+xml" &&
      type !== "image/webp"
    ) {
      setFeedback(
        "El icono debe ser SVG o WebP. Para WebP usa fondo transparente."
      );
      return;
    }

    setUploadingKey(key);
    setFeedback("");

    try {
      const body = new FormData();
      body.set("expectedRevision", String(revision));
      body.set("icon", file);

      const response = await fetch(
        "/api/admin/content/catalogs/icon-upload",
        {
          method: "POST",
          body,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
        }
      );
      const payload = (await response
        .json()
        .catch(() => null)) as IconUploadResponse | null;

      if (
        !response.ok ||
        typeof payload?.publicPath !== "string" ||
        !customIconPattern.test(payload.publicPath)
      ) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "No se pudo cargar el icono.";
        setFeedback(message);
        return;
      }

      updateTerms(kind, (currentTerms) =>
        currentTerms.map((term) =>
          term.key === key
            ? {
                ...term,
                iconAsset: payload.publicPath as string,
              }
            : term
        )
      );

      const format =
        payload.format === "svg" ? "SVG" : "WebP";
      setFeedback(
        `Icono ${format} cargado. Ya toma el color elegido; usa “Guardar clasificaciones” para conservarlo.`
      );
    } catch {
      setFeedback(
        "No se pudo conectar con el almacén de iconos. Intenta nuevamente."
      );
    } finally {
      setUploadingKey(null);
    }
  }

  function moveTerm(
    kind: GameTaxonomyKind,
    index: number,
    direction: -1 | 1
  ) {
    updateTerms(kind, (currentTerms) => {
      const target = index + direction;
      if (target < 0 || target >= currentTerms.length) return currentTerms;

      const next = [...currentTerms];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleTerm(
    kind: GameTaxonomyKind,
    key: string
  ) {
    updateTerms(kind, (currentTerms) =>
      currentTerms.map((term) =>
        term.key === key
          ? { ...term, active: !term.active }
          : term
      )
    );
  }

  function removeTerm(
    kind: GameTaxonomyKind,
    key: string
  ) {
    if ((usage[kind][key] ?? 0) > 0) return;
    updateTerms(kind, (currentTerms) =>
      currentTerms.filter((term) => term.key !== key)
    );
  }

  return (
    <form
      method="post"
      action={`/api/admin/content/catalogs/games?seccion=${returnSection}`}
      className={styles.root}
    >
      <input
        type="hidden"
        name="expectedRevision"
        value={revision}
      />
      <input
        type="hidden"
        name="taxonomyJson"
        value={serialized}
      />

      <div className={styles.summary}>
        <div>
          <strong>{currentSection.title}</strong>
          <p>
            {hasVisuals
              ? "Esta ventana gobierna la clasificación visible de los juegos. Un mismo nombre existe una sola vez y conserva un único contador en Inicio y Juegos."
              : "Esta ventana contiene solamente atributos descriptivos. Así puedes trabajar las etiquetas sin mezclar ni desplazar las clasificaciones principales."}
          </p>
        </div>
        <span>Revisión {revision}</span>
      </div>

      {feedback && (
        <div className={styles.feedback} role="status">
          {feedback}
        </div>
      )}

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <span>{currentSection.eyebrow}</span>
            <h2>{currentSection.title}</h2>
            <p>{currentSection.description}</p>
          </div>
          <div className={styles.counts}>
            <strong>{active}</strong>
            <span>activos · {terms.length} total</span>
          </div>
        </header>

        <div className={styles.addRow}>
          <input
            value={draftLabels[currentSection.kind]}
            onChange={(event) =>
              setDraftLabels((current) => ({
                ...current,
                [currentSection.kind]: event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTerm(currentSection);
              }
            }}
            maxLength={80}
            placeholder={`Nueva ${currentSection.singular}`}
            aria-label={`Nueva ${currentSection.singular}`}
          />
          <button
            type="button"
            data-brand-action="true"
            onClick={() => addTerm(currentSection)}
          >
            <Plus size={15} aria-hidden="true" />
            Agregar
          </button>
        </div>

        {terms.length > 0 && (
          <div className={styles.termToolbar}>
            <label className={styles.termSearch}>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder={`Buscar ${currentSection.title.toLocaleLowerCase("es")}…`}
                aria-label={`Buscar en ${currentSection.title.toLocaleLowerCase("es")}`}
              />
            </label>

            <div className={styles.pagination} aria-label="Paginación del catálogo">
              <span>
                {matchingTerms.length === terms.length
                  ? `${terms.length} términos`
                  : `${matchingTerms.length} de ${terms.length}`}
              </span>
              <button
                type="button"
                aria-label="Página anterior"
                disabled={currentPage === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <b>{currentPage + 1}/{pageCount}</b>
              <button
                type="button"
                aria-label="Página siguiente"
                disabled={currentPage >= pageCount - 1}
                onClick={() =>
                  setPage((value) => Math.min(pageCount - 1, value + 1))
                }
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {terms.length === 0 ? (
          <p className={styles.empty}>
            Todavía no hay términos en este catálogo.
          </p>
        ) : matchingTerms.length === 0 ? (
          <p className={styles.empty} role="status">
            No hay términos que coincidan con la búsqueda actual.
          </p>
        ) : (
          <>
            <div
              className={`${styles.columnHeader} ${
                hasVisuals ? "" : styles.columnHeaderSimple
              }`}
              aria-hidden="true"
            >
              <span>Nombre e identificador</span>
              {hasVisuals && <span>Apariencia</span>}
              <span>Uso</span>
              <span>Orden</span>
              <span>Estado</span>
              <span />
            </div>

            <div className={styles.termList}>
              {visibleTerms.map(({ term, index }) => {
                const used = usage[currentSection.kind][term.key] ?? 0;
                const tone = taxonomyToneOptions.find(
                  (option) => option.key === term.tone
                );
                const uploading = uploadingKey === term.key;

                return (
                  <div
                    key={term.key}
                    data-taxonomy-term-row="true"
                    className={`${styles.termRow} ${
                      hasVisuals ? "" : styles.termRowSimple
                    }`}
                  >
                    <div className={styles.termMain}>
                      <input
                        value={term.label}
                        readOnly={used > 0}
                        onChange={(event) =>
                          renameTerm(
                            currentSection.kind,
                            term.key,
                            event.target.value
                          )
                        }
                        maxLength={80}
                        aria-label={`Nombre de ${term.label}`}
                      />
                      <code>{term.key}</code>
                    </div>

                    {hasVisuals && term.icon && term.tone && (
                      <div className={styles.visualEditor}>
                        <span
                          className={styles.visualPreview}
                          style={
                            {
                              "--taxonomy-accent": tone?.color ?? "var(--brand)",
                            } as CSSProperties
                          }
                        >
                          <TaxonomyIcon
                            icon={term.icon}
                            asset={term.iconAsset}
                            size={23}
                          />
                        </span>

                        <div className={styles.visualControls}>
                          <div className={styles.visualFields}>
                            <label>
                              <span>Icono de biblioteca</span>
                              <select
                                value={term.icon}
                                onChange={(event) =>
                                  setVisual(
                                    currentSection.kind,
                                    term.key,
                                    "icon",
                                    event.target.value as GameTaxonomyIcon
                                  )
                                }
                              >
                                {taxonomyIconOptions.map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label>
                              <span>Color</span>
                              <select
                                value={term.tone}
                                onChange={(event) =>
                                  setVisual(
                                    currentSection.kind,
                                    term.key,
                                    "tone",
                                    event.target.value as GameTaxonomyTone
                                  )
                                }
                              >
                                {taxonomyToneOptions.map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className={styles.customIconRow}>
                            <label
                              className={styles.iconUpload}
                              data-busy={uploading ? "true" : "false"}
                            >
                              <Upload size={14} aria-hidden="true" />
                              <span>
                                {uploading
                                  ? "Subiendo icono..."
                                  : term.iconAsset
                                    ? "Reemplazar icono propio"
                                    : "Subir SVG o WebP"}
                              </span>
                              <input
                                type="file"
                                accept=".svg,.webp,image/svg+xml,image/webp"
                                disabled={uploading}
                                aria-label={`Subir icono propio para ${term.label}`}
                                onChange={(event) => {
                                  const input = event.currentTarget;
                                  const file = input.files?.[0];

                                  if (!file) return;

                                  void uploadCustomIcon(
                                    currentSection.kind,
                                    term.key,
                                    file
                                  ).finally(() => {
                                    input.value = "";
                                  });
                                }}
                              />
                            </label>

                            {term.iconAsset ? (
                              <>
                                <span className={styles.customBadge}>
                                  Icono propio · color editable
                                </span>
                                <button
                                  type="button"
                                  className={styles.clearCustomButton}
                                  onClick={() =>
                                    clearCustomIcon(
                                      currentSection.kind,
                                      term.key
                                    )
                                  }
                                >
                                  <RotateCcw size={13} aria-hidden="true" />
                                  Usar biblioteca
                                </button>
                              </>
                            ) : (
                              <small className={styles.iconHint}>
                                SVG recomendado. WebP sólo con transparencia. El color se aplica desde este panel.
                              </small>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <span className={styles.usage}>
                      {used === 0
                        ? "Sin uso"
                        : `${used} ${used === 1 ? "juego" : "juegos"}`}
                    </span>

                    <div className={styles.orderButtons}>
                      <button
                        type="button"
                        disabled={Boolean(normalizedQuery) || index === 0}
                        title={
                          normalizedQuery
                            ? "Limpia la búsqueda para reordenar el catálogo completo."
                            : undefined
                        }
                        aria-label={`Subir ${term.label}`}
                        onClick={() =>
                          moveTerm(currentSection.kind, index, -1)
                        }
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={
                          Boolean(normalizedQuery) ||
                          index === terms.length - 1
                        }
                        title={
                          normalizedQuery
                            ? "Limpia la búsqueda para reordenar el catálogo completo."
                            : undefined
                        }
                        aria-label={`Bajar ${term.label}`}
                        onClick={() =>
                          moveTerm(currentSection.kind, index, 1)
                        }
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                    </div>

                    <button
                      type="button"
                      className={
                        term.active
                          ? styles.activeButton
                          : styles.inactiveButton
                      }
                      onClick={() =>
                        toggleTerm(currentSection.kind, term.key)
                      }
                    >
                      {term.active ? "Activo" : "Inactivo"}
                    </button>

                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={used > 0}
                      title={
                        used > 0
                          ? "Un término usado por juegos se conserva; puedes desactivarlo."
                          : "Eliminar término sin uso"
                      }
                      aria-label={`Eliminar ${term.label}`}
                      onClick={() =>
                        removeTerm(currentSection.kind, term.key)
                      }
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <div className={styles.actions}>
        <p>
          {hasVisuals
            ? "El orden de esta ventana es el mismo orden que se reutiliza públicamente. El contador considera cada juego una sola vez por clasificación. Los iconos propios conservan el mismo selector de color."
            : "Las etiquetas usadas no se eliminan para proteger las fichas existentes; puedes desactivarlas y mantener el historial editorial."}
        </p>
        <button type="submit" data-brand-action="true">
          Guardar {hasVisuals ? "clasificaciones" : "etiquetas"}
        </button>
      </div>
    </form>
  );
}
