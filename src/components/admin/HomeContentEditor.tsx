"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import type { ResolvedHomeConfig } from "@/data/home-config";
import {
  homeGameRowSectionIds,
  isHomeCardRevealMode,
} from "@/lib/home/card-row-reveal";
import type { Game } from "@/types/game";

import HomeCurationEditor from "./HomeCurationEditor";
import HomePresentationEditor from "./HomePresentationEditor";
import HomeRowRevealEditor from "./HomeRowRevealEditor";
import styles from "./HomeContentEditor.module.css";

const combinedAction = "/api/admin/content/home/content";
const dirtySelector = 'form[data-home-editor-dirty="true"]';

type HomeContentStep = "structure" | "curation" | "cards";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeRowRevealIntoPresentation(
  presentationJson: string,
  rowRevealJson: string
) {
  const presentation: unknown = JSON.parse(presentationJson);
  const rowReveal: unknown = JSON.parse(rowRevealJson);

  if (
    !isRecord(presentation) ||
    !Array.isArray(presentation.sections) ||
    !isRecord(rowReveal)
  ) {
    throw new Error("La presentación coordinada no tiene la forma esperada.");
  }

  for (const id of homeGameRowSectionIds) {
    if (!isHomeCardRevealMode(rowReveal[id])) {
      throw new Error(`Modo de visualización inválido para ${id}.`);
    }
  }

  return JSON.stringify({
    ...presentation,
    sections: presentation.sections.map((section) => {
      if (
        !isRecord(section) ||
        typeof section.id !== "string" ||
        !homeGameRowSectionIds.some((id) => id === section.id)
      ) {
        return section;
      }

      return {
        ...section,
        cardRevealMode: rowReveal[section.id],
      };
    }),
  });
}

function saveFailureMessage(status: number) {
  if (status === 403) {
    return "El servidor rechazó la solicitud segura de guardado. Recarga la página para renovar el contexto del Admin y vuelve a intentarlo; los cambios locales siguen conservados.";
  }

  if (status === 413) {
    return "La revisión supera el tamaño permitido para un guardado de Inicio. Los cambios locales siguen conservados.";
  }

  return `No se pudo guardar Resto de Inicio (respuesta ${status}). Los cambios locales siguen conservados.`;
}

export default function HomeContentEditor({
  config,
  games,
  publishedSlugs,
  revision,
  rankingReferenceTime,
}: {
  config: ResolvedHomeConfig;
  games: Game[];
  publishedSlugs: string[];
  revision: number;
  rankingReferenceTime: number;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasDirtyChanges, setHasDirtyChanges] = useState(false);
  const [activeStep, setActiveStep] =
    useState<HomeContentStep>("structure");
  const presentationConfig: ResolvedHomeConfig = {
    ...config,
    sections: config.sections.map((section) => ({
      id: section.id,
      visible: section.visible,
    })),
  };

  const saveAll = useCallback(async (root: HTMLElement) => {
    if (savingRef.current) return;

    const curation = root.querySelector<HTMLInputElement>(
      'input[name="curationJson"]'
    );
    const presentation = root.querySelector<HTMLInputElement>(
      'input[name="presentationJson"]'
    );
    const rowReveal = root.querySelector<HTMLInputElement>(
      'input[name="rowRevealJson"]'
    );

    if (!curation || !presentation || !rowReveal) {
      setSaveError(
        "Falta una parte del editor coordinado. Recarga Resto de Inicio antes de volver a guardar."
      );
      return;
    }

    let mergedPresentation: string;
    try {
      mergedPresentation = mergeRowRevealIntoPresentation(
        presentation.value,
        rowReveal.value
      );
    } catch {
      setSaveError(
        "No se pudo ensamblar la visualización de las filas con la presentación. Los cambios siguen conservados en esta pestaña."
      );
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);

    // readTrustedAdminForm acepta deliberadamente sólo urlencoded. Mantener
    // este transporte alineado con los formularios nativos preserva el
    // contrato CSRF/origin del Admin y evita abrir multipart innecesariamente.
    const body = new URLSearchParams();
    body.set("expectedRevision", String(revision));
    body.set("curationJson", curation.value);
    body.set("presentationJson", mergedPresentation);

    try {
      const response = await fetch(combinedAction, {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
      });

      if (!response.ok) {
        savingRef.current = false;
        setSaving(false);
        setSaveError(saveFailureMessage(response.status));
        return;
      }

      if (response.redirected) {
        const target = new URL(response.url);
        const outcome = target.searchParams.get("estado");
        const saved = outcome === "guardado";

        if (!saved) {
          savingRef.current = false;
          setSaving(false);
          setSaveError(
            outcome === "conflicto"
              ? "La revisión cambió mientras editabas. Tus cambios locales siguen conservados; revisa el aviso y resuelve el conflicto antes de volver a guardar."
              : "El servidor no confirmó el guardado de la revisión. Tus cambios locales siguen conservados."
          );
        }

        router.replace(`${target.pathname}${target.search}`);
      } else {
        // La ruta coordinada normalmente responde mediante redirect. Si un
        // middleware cambia ese contrato, no dejes el editor bloqueado.
        savingRef.current = false;
        setSaving(false);
      }

      router.refresh();
    } catch {
      savingRef.current = false;
      setSaving(false);
      setSaveError(
        "No se pudo conectar con el guardado de Resto de Inicio. Tus cambios siguen conservados en esta pestaña."
      );
    }
  }, [revision, router]);

  const requestSave = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    void saveAll(root);
  }, [saveAll]);

  const interceptChildSubmit = useCallback(
    (event: FormEvent<HTMLDivElement>) => {
      const form = event.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement)) return;
      if (
        !form.querySelector('input[name="curationJson"]') &&
        !form.querySelector('input[name="presentationJson"]') &&
        !form.querySelector('input[name="rowRevealJson"]')
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void saveAll(event.currentTarget);
    },
    [saveAll]
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const syncDirtyState = () => {
      setHasDirtyChanges(Boolean(root.querySelector(dirtySelector)));
    };

    syncDirtyState();
    const observer = new MutationObserver(syncDirtyState);
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-home-editor-dirty"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const hasUnsavedChanges = () =>
      Boolean(rootRef.current?.querySelector(dirtySelector));

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const protectLinks = (event: MouseEvent) => {
      if (
        !hasUnsavedChanges() ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      ) {
        return;
      }

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      if (
        !window.confirm(
          "Tienes cambios sin guardar en Resto de Inicio. ¿Quieres salir?"
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", protectLinks, true);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", protectLinks, true);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-saving={saving ? "true" : "false"}
      aria-busy={saving}
      onSubmitCapture={interceptChildSubmit}
    >
      <div
        className={styles.notice}
        data-kind={saveError ? "error" : "info"}
        role={saveError ? "alert" : "status"}
      >
        <div>
          <strong>
            {saveError
              ? "El guardado conjunto no pudo completarse"
              : "Resto de Inicio es una sola revisión"}
          </strong>
          <span>
            {saveError
              ? saveError
              : "Estructura, textos, curaduría y visualización de Cards se guardan juntos. Guardar nunca publica: la web pública cambia únicamente desde Publicación."}
          </span>
        </div>
        <b>{saving ? "GUARDANDO…" : `REVISIÓN ${revision}`}</b>
      </div>

      <div className={styles.saveBar}>
        <nav
          className={styles.workflow}
          aria-label="Flujo de edición de Resto de Inicio"
        >
          <a
            href="#home-content-structure"
            data-active={activeStep === "structure" ? "true" : "false"}
            aria-current={activeStep === "structure" ? "step" : undefined}
            onClick={() => setActiveStep("structure")}
          >
            <span>1</span>
            <strong>Estructura y textos</strong>
          </a>
          <a
            href="#home-content-curation"
            data-active={activeStep === "curation" ? "true" : "false"}
            aria-current={activeStep === "curation" ? "step" : undefined}
            onClick={() => setActiveStep("curation")}
          >
            <span>2</span>
            <strong>Curaduría</strong>
          </a>
          <a
            href="#home-content-cards"
            data-active={activeStep === "cards" ? "true" : "false"}
            aria-current={activeStep === "cards" ? "step" : undefined}
            onClick={() => setActiveStep("cards")}
          >
            <span>3</span>
            <strong>Cards</strong>
          </a>
        </nav>
        <div className={styles.saveAction} aria-live="polite">
          <span>
            {saving
              ? "Guardando la revisión completa…"
              : hasDirtyChanges
                ? "Hay cambios pendientes en Resto de Inicio"
                : "Todo coincide con la revisión guardada"}
          </span>
          <button
            type="button"
            onClick={requestSave}
            disabled={saving || !hasDirtyChanges}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      <section
        id="home-content-structure"
        className={styles.step}
        hidden={activeStep !== "structure"}
        aria-labelledby="home-content-structure-title"
      >
        <header className={styles.stepHeader}>
          <span>1</span>
          <div>
            <h2 id="home-content-structure-title">Estructura y textos</h2>
            <p>
              Primero define el orden y la visibilidad de Inicio, después ajusta los textos de cada bloque.
            </p>
          </div>
        </header>
        <HomePresentationEditor
          config={presentationConfig}
          revision={revision}
        />
      </section>

      <section
        id="home-content-curation"
        className={styles.step}
        hidden={activeStep !== "curation"}
        aria-labelledby="home-content-curation-title"
      >
        <header className={styles.stepHeader}>
          <span>2</span>
          <div>
            <h2 id="home-content-curation-title">Curaduría de juegos</h2>
            <p>
              Decide qué juegos alimentan Populares, Según tu equipo y Recomendados, y cómo interviene el ranking automático.
            </p>
          </div>
        </header>
        <HomeCurationEditor
          config={config}
          games={games}
          publishedSlugs={publishedSlugs}
          revision={revision}
          rankingReferenceTime={rankingReferenceTime}
          excludeHero
        />
      </section>

      <section
        id="home-content-cards"
        className={styles.step}
        hidden={activeStep !== "cards"}
        aria-labelledby="home-content-cards-title"
      >
        <header className={styles.stepHeader}>
          <span>3</span>
          <div>
            <h2 id="home-content-cards-title">Visualización de Cards</h2>
            <p>
              Por último define si cada fila muestra la Portada en reposo o el detalle completo de sus Cards.
            </p>
          </div>
        </header>
        <HomeRowRevealEditor
          config={config}
          revision={revision}
        />
      </section>
    </div>
  );
}
