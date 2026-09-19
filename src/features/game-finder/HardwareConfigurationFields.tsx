"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cpuCatalog, gpuCatalog, findGpuById } from "./hardware-catalog";
import type { MemoryMode } from "./types";
import overlayStyles from "./GameFinderOverlay.module.css";
import styles from "./GameFinderClient.module.css";

const UNCONFIRMED_OS_OPTION = "Otro / no estoy seguro";

export type ManualDraft = {
  cpuId: string;
  gpuId: string;
  ramGb: string;
  os: string;
  memoryMode: MemoryMode;
};

type ManualSelectOption = {
  value: string;
  label: string;
};

const RAM_MANUAL_OPTIONS: ManualSelectOption[] = [
  1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64, 96, 128, 192, 256,
].map((ram) => ({ value: String(ram), label: `${ram} GB` }));

const OS_MANUAL_OPTIONS: ManualSelectOption[] = [
  "Windows 10/11 64-bit",
  "Windows 10/11",
  "Windows 11 64-bit",
  "Windows 10 64-bit",
  "Linux 64-bit",
  UNCONFIRMED_OS_OPTION,
].map((os) => ({ value: os, label: os }));

const CPU_MANUAL_OPTIONS: ManualSelectOption[] = cpuCatalog.map((cpu) => ({
  value: cpu.id,
  label: cpu.name,
}));

const GPU_MANUAL_OPTIONS: ManualSelectOption[] = gpuCatalog.map((gpu) => ({
  value: gpu.id,
  label: gpu.name,
}));

function normalizeManualSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function manualOptionMatches(option: ManualSelectOption, query: string) {
  const terms = normalizeManualSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;

  const searchable = normalizeManualSearch(`${option.label} ${option.value}`);
  return terms.every((term) => searchable.includes(term));
}

function filterManualOptions(
  options: ManualSelectOption[],
  query: string,
  selectedValue: string
) {
  const matches = query.trim()
    ? options.filter((option) => manualOptionMatches(option, query))
    : options;

  const selected = selectedValue
    ? options.find((option) => option.value === selectedValue)
    : undefined;

  if (selected && !matches.some((option) => option.value === selected.value)) {
    return [selected, ...matches];
  }

  return matches;
}

function SearchableManualSelect({
  fieldId,
  name,
  label,
  searchPlaceholder,
  emptyLabel,
  options,
  value,
  onValueChange,
}: {
  fieldId: string;
  name: string;
  label: string;
  searchPlaceholder: string;
  emptyLabel: string;
  options: ManualSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchFocusFrameRef = useRef<number | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );
  const visibleOptions = useMemo(
    () => filterManualOptions(options, searchValue, value),
    [options, searchValue, value]
  );
  const matchCount = searchValue.trim()
    ? options.filter((option) => manualOptionMatches(option, searchValue)).length
    : options.length;

  useEffect(() => {
    if (!open) return;

    searchFocusFrameRef.current = window.requestAnimationFrame(() => {
      searchFocusFrameRef.current = null;
      searchInputRef.current?.focus();
    });

    function handleOutsidePointer(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setSearchValue("");
      }
    }

    window.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      if (searchFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(searchFocusFrameRef.current);
        searchFocusFrameRef.current = null;
      }
      window.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, [open]);

  function closePicker(returnFocus = false) {
    if (searchFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(searchFocusFrameRef.current);
      searchFocusFrameRef.current = null;
    }

    setOpen(false);
    setSearchValue("");

    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }

  function selectOption(nextValue: string) {
    onValueChange(nextValue);
    closePicker(true);
  }

  function focusOption(current: HTMLElement, direction: 1 | -1) {
    const optionNodes = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-manual-option]") ?? []
    );
    const index = optionNodes.indexOf(current as HTMLButtonElement);
    if (index < 0 || optionNodes.length === 0) return;
    const nextIndex = (index + direction + optionNodes.length) % optionNodes.length;
    optionNodes[nextIndex]?.focus();
  }

  return (
    <div ref={rootRef} className={styles.configField}>
      <span id={`${fieldId}-label`} className={styles.configFieldLabel}>{label}</span>

      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        className={`${styles.configPickerTrigger} ${open ? styles.configPickerTriggerOpen : ""}`}
        aria-labelledby={`${fieldId}-label ${fieldId}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${fieldId}-listbox`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span
          id={`${fieldId}-value`}
          className={selectedOption ? styles.configPickerValue : styles.configPickerPlaceholder}
        >
          {selectedOption?.label ?? emptyLabel}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.configPickerMenu}>
          <div className={styles.configPickerSearch}>
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              role="combobox"
              value={searchValue}
              placeholder={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              aria-label={`Buscar ${label.toLocaleLowerCase("es")}`}
              aria-controls={`${fieldId}-listbox`}
              aria-expanded="true"
              aria-autocomplete="list"
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closePicker(true);
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  rootRef.current
                    ?.querySelector<HTMLButtonElement>("[data-manual-option]")
                    ?.focus();
                  return;
                }
                if (event.key === "Enter" && matchCount === 1) {
                  const onlyMatch = options.find((option) => manualOptionMatches(option, searchValue));
                  if (onlyMatch) {
                    event.preventDefault();
                    selectOption(onlyMatch.value);
                  }
                }
              }}
            />
            <span aria-live="polite">{matchCount}</span>
          </div>

          <div
            id={`${fieldId}-listbox`}
            className={styles.configPickerList}
            role="listbox"
            aria-labelledby={`${fieldId}-label`}
          >
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              data-manual-option
              className={styles.configPickerOption}
              onClick={() => selectOption("")}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closePicker(true);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusOption(event.currentTarget, 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusOption(event.currentTarget, -1);
                }
              }}
            >
              <span>{emptyLabel}</span>
              {value === "" && <Check size={14} aria-hidden="true" />}
            </button>

            {visibleOptions.length ? (
              visibleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  data-manual-option
                  className={`${styles.configPickerOption} ${option.value === value ? styles.configPickerOptionSelected : ""}`}
                  onClick={() => selectOption(option.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      closePicker(true);
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      focusOption(event.currentTarget, 1);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      focusOption(event.currentTarget, -1);
                    }
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check size={14} aria-hidden="true" />}
                </button>
              ))
            ) : (
              <div className={styles.configPickerEmpty} role="status">
                No encontramos coincidencias. Prueba con otro término.
              </div>
            )}
          </div>

          <div className={styles.configPickerFooter}>
            {searchValue.trim()
              ? `${matchCount} coincidencia${matchCount === 1 ? "" : "s"}`
              : `${options.length} opciones disponibles`}
          </div>
        </div>
      )}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}


export default function HardwareConfigurationFields({ draft, onChange, idPrefix = "manual", showOperatingSystem = true, disabled = false }: {
  draft: ManualDraft;
  onChange: (draft: ManualDraft) => void;
  idPrefix?: string;
  showOperatingSystem?: boolean;
  disabled?: boolean;
}) {
  const selectedManualGpu = findGpuById(draft.gpuId);
  const ramOptions = draft.ramGb && !RAM_MANUAL_OPTIONS.some((option) => option.value === draft.ramGb)
    ? [...RAM_MANUAL_OPTIONS, { value: draft.ramGb, label: `${draft.ramGb} GB` }]
    : RAM_MANUAL_OPTIONS;
  return (
    <fieldset disabled={disabled} aria-label="Componentes de tu PC" className={`${styles.configGrid} ${overlayStyles.configuration}`}>
      <SearchableManualSelect
        fieldId={`${idPrefix}-cpu`}
        name="cpuId"
        label="Procesador"
        searchPlaceholder="Buscar CPU: Ryzen 5 5600G, i5-12400..."
        emptyLabel="Selecciona tu CPU"
        options={CPU_MANUAL_OPTIONS}
        value={draft.cpuId}
        onValueChange={(value) => onChange({ ...draft, cpuId: value })}
      />

      <SearchableManualSelect
        fieldId={`${idPrefix}-gpu`}
        name="gpuId"
        label="Tarjeta gráfica"
        searchPlaceholder="Buscar GPU: GTX 1660 SUPER, RX 6600..."
        emptyLabel="Selecciona tu GPU"
        options={GPU_MANUAL_OPTIONS}
        value={draft.gpuId}
        onValueChange={(value) => onChange({ ...draft, gpuId: value })}
      />

      <SearchableManualSelect
        fieldId={`${idPrefix}-ram`}
        name="ramGb"
        label="Memoria RAM física"
        searchPlaceholder="Buscar cantidad: 16 GB, 32 GB..."
        emptyLabel="Selecciona tu RAM"
        options={ramOptions}
        value={draft.ramGb}
        onValueChange={(value) => onChange({ ...draft, ramGb: value })}
      />

      {showOperatingSystem && (
        <SearchableManualSelect
          fieldId={`${idPrefix}-os`}
          name="os"
          label="Sistema operativo"
          searchPlaceholder="Buscar Windows, Linux..."
          emptyLabel="Selecciona tu sistema"
          options={OS_MANUAL_OPTIONS}
          value={draft.os}
          onValueChange={(value) => onChange({ ...draft, os: value })}
        />
      )}

      {selectedManualGpu?.integrated ? (
        <label>
          <span>Canales de memoria</span>
          <select name="memoryMode" value={draft.memoryMode} onChange={(event) => onChange({ ...draft, memoryMode: event.target.value as MemoryMode })}>
            <option value="unknown">No lo sé</option>
            <option value="single">Single-channel / un módulo</option>
            <option value="dual">Dual-channel / dos módulos</option>
          </select>
        </label>
      ) : <input type="hidden" name="memoryMode" value="unknown" />}
    </fieldset>
  );
}
