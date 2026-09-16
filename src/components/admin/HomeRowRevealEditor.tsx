"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ResolvedHomeConfig } from "@/data/home-config";
import {
  homeCardRevealModesFromSections,
  homeGameRowSectionIds,
  isHomeCardRevealMode,
  type HomeCardRevealMode,
  type HomeCardRevealModes,
  type HomeGameRowSectionId,
} from "@/lib/home/card-row-reveal";

import styles from "./HomeRowRevealEditor.module.css";
import { useInitialSessionStorageSnapshot } from "./useInitialSessionStorageSnapshot";

const ROW_REVEAL_DRAFT_KEY =
  "deuna:home-row-reveal-draft:latest";

const rowLabels: Record<HomeGameRowSectionId, string> = {
  popular: "Juegos populares",
  recent: "Añadidos recientemente",
  lowSpec: "Según tu equipo",
  recommended: "Juegos recomendados",
};

const modeCopy: Record<
  HomeCardRevealMode,
  { label: string; description: string }
> = {
  interaction: {
    label: "Al interactuar",
    description:
      "Conserva la Portada en reposo y muestra multimedia + información al interactuar.",
  },
  "static-detail": {
    label: "Detalle visible",
    description:
      "Muestra imagen o video de Card junto con su información, sin ampliar, inclinar ni mover las tarjetas.",
  },
};

type RowRevealDraft = {
  revision: number;
  modes: HomeCardRevealModes;
};

function buildPayload(modes: HomeCardRevealModes) {
  return JSON.stringify(modes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseModes(value: unknown): HomeCardRevealModes | null {
  if (!isRecord(value)) return null;

  const modes = {} as HomeCardRevealModes;

  for (const id of homeGameRowSectionIds) {
    const mode = value[id];
    if (!isHomeCardRevealMode(mode)) return null;
    modes[id] = mode;
  }

  return modes;
}

function parseRecoveryDraft(raw: string | null): RowRevealDraft | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      typeof parsed.revision !== "number" ||
      !Number.isInteger(parsed.revision) ||
      parsed.revision < 0
    ) {
      return null;
    }

    const modes = parseModes(parsed.modes);
    return modes
      ? { revision: parsed.revision, modes }
      : null;
  } catch {
    return null;
  }
}

function clearRecoveryDraft() {
  try {
    sessionStorage.removeItem(ROW_REVEAL_DRAFT_KEY);
  } catch {
    // El servidor sigue siendo la fuente de verdad.
  }
}

export default function HomeRowRevealEditor({
  config,
  revision,
}: {
  config: ResolvedHomeConfig;
  revision: number;
}) {
  const baselineModes = useMemo(
    () => homeCardRevealModesFromSections(config.sections),
    [config.sections]
  );
  const baselinePayload = useMemo(
    () => buildPayload(baselineModes),
    [baselineModes]
  );
  const [modes, setModes] = useState<HomeCardRevealModes>(
    () => ({ ...baselineModes })
  );
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const {
    ready: recoveryReady,
    value: storedDraft,
  } = useInitialSessionStorageSnapshot(ROW_REVEAL_DRAFT_KEY);

  const serialized = useMemo(
    () => buildPayload(modes),
    [modes]
  );
  const dirty = serialized !== baselinePayload;
  const recovery = useMemo(() => {
    if (!storedDraft || recoveryDismissed) return null;
    const candidate = parseRecoveryDraft(storedDraft);
    if (!candidate) return null;

    return buildPayload(candidate.modes) === baselinePayload
      ? null
      : candidate;
  }, [baselinePayload, recoveryDismissed, storedDraft]);
  const recoveryMatchesRevision = recovery?.revision === revision;
  const recoveryRequiresDecision = Boolean(recovery);

  useEffect(() => {
    if (!recoveryReady || recovery) return;

    try {
      if (!dirty) {
        clearRecoveryDraft();
        return;
      }

      sessionStorage.setItem(
        ROW_REVEAL_DRAFT_KEY,
        JSON.stringify({
          revision,
          modes,
        } satisfies RowRevealDraft)
      );
    } catch {
      // Storage puede estar bloqueado; el formulario sigue funcionando.
    }
  }, [dirty, modes, recovery, recoveryReady, revision]);

  function setMode(
    id: HomeGameRowSectionId,
    mode: HomeCardRevealMode
  ) {
    setModes((current) => ({
      ...current,
      [id]: mode,
    }));
  }

  return (
    <form
      method="post"
      action="/api/admin/content/home/presentation"
      className={styles.root}
      data-home-editor-dirty={dirty ? "true" : "false"}
    >
      <input
        type="hidden"
        name="expectedRevision"
        value={revision}
      />
      <input
        type="hidden"
        name="rowRevealJson"
        value={serialized}
      />

      {recovery && (
        <div
          className={styles.recovery}
          role={recoveryMatchesRevision ? "status" : "alert"}
        >
          <div>
            <strong>Cambios locales recuperables</strong>
            <span>
              {recoveryMatchesRevision
                ? "Hay una copia local de la visualización de filas que todavía no fue guardada."
                : `La copia local pertenece a la revisión ${recovery.revision} y el servidor ya está en la ${revision}. Descártala para evitar mezclar revisiones.`}
            </span>
          </div>
          <div>
            <button
              type="button"
              disabled={!recoveryMatchesRevision}
              onClick={() => {
                if (!recoveryMatchesRevision) return;
                setModes({ ...recovery.modes });
                setRecoveryDismissed(true);
              }}
            >
              {recoveryMatchesRevision ? "Recuperar" : "Copia obsoleta"}
            </button>
            <button
              type="button"
              onClick={() => {
                clearRecoveryDraft();
                setRecoveryDismissed(true);
              }}
            >
              Descartar copia
            </button>
          </div>
        </div>
      )}

      <section className={styles.panel} inert={recoveryRequiresDecision}>
        <header className={styles.header}>
          <div>
            <strong>Visualización de las filas de juegos</strong>
            <p>
              Decide si cada fila conserva la interacción normal o muestra directamente multimedia e información. El modo Detalle visible no aplica zoom, expansión, tilt ni efectos de hover.
            </p>
          </div>
          <span data-dirty={dirty ? "true" : "false"}>
            {dirty ? "Cambios sin guardar" : `Revisión ${revision}`}
          </span>
        </header>

        <div className={styles.rows}>
          {homeGameRowSectionIds.map((id) => (
            <div className={styles.row} key={id}>
              <div className={styles.rowIdentity}>
                <strong>{rowLabels[id]}</strong>
                <span>
                  {modes[id] === "static-detail"
                    ? "Todas las Cards muestran su cara informativa; sólo las visibles reproducen video."
                    : "Comportamiento actual de Portada + interacción."}
                </span>
              </div>

              <div
                className={styles.modeGroup}
                role="group"
                aria-label={`Visualización de ${rowLabels[id]}`}
              >
                {(["interaction", "static-detail"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={modes[id] === mode}
                    data-active={modes[id] === mode ? "true" : "false"}
                    onClick={() => setMode(id, mode)}
                  >
                    <strong>{modeCopy[mode].label}</strong>
                    <span>{modeCopy[mode].description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <footer className={styles.actions}>
          <p>
            Guardar crea una nueva revisión de Inicio; la web pública no cambia hasta publicar.
          </p>
          <button type="submit" disabled={!dirty || recoveryRequiresDecision}>
            Guardar visualización
          </button>
        </footer>
      </section>
    </form>
  );
}
