"use client";

import {
  Check,
  Search,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";

import type {
  GameTaxonomyTerm,
} from "@/types/game-taxonomy";

import styles from "./GameTaxonomyMultiSelect.module.css";

export type GameTaxonomyEditorTerm = GameTaxonomyTerm & {
  missingFromCatalog?: boolean;
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export default function GameTaxonomyMultiSelect({
  name,
  label,
  terms,
  initialValues,
  maximum,
}: {
  name: string;
  label: string;
  terms: GameTaxonomyEditorTerm[];
  initialValues: string[];
  maximum: number;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(initialValues);
  const selectedKeys = useMemo(
    () => new Set(selected.map(normalized)),
    [selected]
  );
  const visibleTerms = useMemo(() => {
    const needle = normalized(query);

    return terms.filter((term) => {
      const selectedTerm = selectedKeys.has(
        normalized(term.label)
      );

      if (!term.active && !selectedTerm) return false;
      if (!needle) return true;

      return normalized(term.label).includes(needle);
    });
  }, [query, selectedKeys, terms]);

  function toggle(term: GameTaxonomyEditorTerm) {
    const key = normalized(term.label);
    const exists = selectedKeys.has(key);

    if (exists) {
      setSelected((current) =>
        current.filter((value) => normalized(value) !== key)
      );
      return;
    }

    if (!term.active || selected.length >= maximum) return;

    setSelected((current) => [...current, term.label]);
  }

  return (
    <fieldset className={styles.fieldset}>
      <input
        type="hidden"
        name={name}
        value={selected.join(", ")}
      />

      <div className={styles.heading}>
        <div>
          <legend>{label}</legend>
          <p>
            Selecciona valores administrados en Catálogos. Los términos inactivos o fuera de Catálogos que ya utiliza el juego pueden retirarse, pero no volver a añadirse.
          </p>
        </div>
        <span>
          {selected.length}/{maximum}
        </span>
      </div>

      <label className={styles.search}>
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Buscar ${label.toLocaleLowerCase("es")}`}
          maxLength={80}
          autoComplete="off"
        />
      </label>

      <div className={styles.options}>
        {visibleTerms.map((term) => {
          const active = selectedKeys.has(normalized(term.label));
          const status = term.missingFromCatalog
            ? "Fuera de Catálogos"
            : !term.active
              ? "Inactivo"
              : null;

          return (
            <button
              key={term.key}
              type="button"
              className={active ? styles.selected : styles.option}
              aria-pressed={active}
              data-missing-catalog={term.missingFromCatalog ? "true" : undefined}
              onClick={() => toggle(term)}
              title={
                term.missingFromCatalog
                  ? "Este término sigue guardado en el juego pero ya no existe en Catálogos. Puedes retirarlo, pero no volver a añadirlo."
                  : term.active
                    ? undefined
                    : "Término inactivo conservado por compatibilidad"
              }
            >
              <span>{term.label}</span>
              {status && <small>{status}</small>}
              {active && <Check size={14} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {visibleTerms.length === 0 && (
        <p className={styles.empty}>
          No hay términos disponibles con esa búsqueda.
        </p>
      )}
    </fieldset>
  );
}
