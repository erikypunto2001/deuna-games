"use client";

import {
  Check,
  Search,
  X,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";

import type {
  GameTaxonomyTerm,
} from "@/types/game-taxonomy";

import styles from "./GameTaxonomyMultiSelect.module.css";

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
  terms: GameTaxonomyTerm[];
  initialValues: string[];
  maximum: number;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(initialValues);
  const selectedKeys = useMemo(
    () => new Set(selected.map(normalized)),
    [selected]
  );
  const termByKey = useMemo(
    () => new Map(
      terms.map((term) => [normalized(term.label), term] as const)
    ),
    [terms]
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

  function remove(value: string) {
    const key = normalized(value);
    setSelected((current) =>
      current.filter((candidate) => normalized(candidate) !== key)
    );
  }

  function toggle(term: GameTaxonomyTerm) {
    const key = normalized(term.label);
    const exists = selectedKeys.has(key);

    if (exists) {
      remove(term.label);
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
            Selecciona valores administrados en Catálogos. Los términos inactivos ya utilizados pueden conservarse o retirarse, pero no volver a añadirse.
          </p>
        </div>
        <span aria-live="polite">
          {selected.length}/{maximum}
        </span>
      </div>

      <div className={styles.selectedPanel}>
        <div className={styles.selectedPanelHeading}>
          <strong>Seleccionadas</strong>
          <span>
            {selected.length === 0
              ? "Ninguna"
              : `${selected.length} de ${maximum}`}
          </span>
        </div>

        {selected.length > 0 ? (
          <div
            className={styles.selectedList}
            aria-label={`${label} seleccionadas`}
          >
            {selected.map((value) => {
              const term = termByKey.get(normalized(value));
              const missing = !term;
              const inactive = term?.active === false;

              return (
                <button
                  key={normalized(value)}
                  type="button"
                  className={`${styles.selectedChip} ${
                    missing
                      ? styles.selectedChipMissing
                      : inactive
                        ? styles.selectedChipInactive
                        : ""
                  }`}
                  onClick={() => remove(value)}
                  aria-label={`Quitar ${value} de ${label}`}
                  title={
                    missing
                      ? "Este valor sigue en el borrador, pero ya no existe en Catálogos. Pulsa para retirarlo."
                      : inactive
                        ? "Término inactivo conservado por compatibilidad. Pulsa para retirarlo."
                        : `Quitar ${value}`
                  }
                >
                  <Check size={14} aria-hidden="true" />
                  <span>{value}</span>
                  {missing && <small>No está en Catálogos</small>}
                  {!missing && inactive && <small>Inactiva</small>}
                  <X size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ) : (
          <p className={styles.selectedEmpty}>
            Todavía no hay valores seleccionados.
          </p>
        )}
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

          return (
            <button
              key={term.key}
              type="button"
              className={active ? styles.selected : styles.option}
              aria-pressed={active}
              onClick={() => toggle(term)}
              title={
                term.active
                  ? undefined
                  : "Término inactivo conservado por compatibilidad"
              }
            >
              <span>{term.label}</span>
              {!term.active && <small>Inactivo</small>}
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
