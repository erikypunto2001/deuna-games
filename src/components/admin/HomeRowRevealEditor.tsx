"use client";

import { useMemo, useState } from "react";

import type { ResolvedHomeConfig } from "@/data/home-config";
import {
  homeCardRevealModesFromSections,
  homeGameRowSectionIds,
  type HomeCardRevealMode,
  type HomeCardRevealModes,
  type HomeGameRowSectionId,
} from "@/lib/home/card-row-reveal";

import styles from "./HomeRowRevealEditor.module.css";

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

function buildPayload(modes: HomeCardRevealModes) {
  return JSON.stringify(modes);
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

  const serialized = useMemo(
    () => buildPayload(modes),
    [modes]
  );
  const dirty = serialized !== baselinePayload;
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

      <section className={styles.panel}>
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
          <button type="submit" disabled={!dirty}>
            Guardar visualización
          </button>
        </footer>
      </section>
    </form>
  );
}
