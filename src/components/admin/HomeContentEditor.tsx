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
  const [error, setError] = useState(false);
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
      setError(true);
      return;
    }

    let mergedPresentation: string;
    try {
      mergedPresentation = mergeRowRevealIntoPresentation(
        presentation.value,
        rowReveal.value
      );
    } catch (mergeError) {
      console.error(
        "No se pudo ensamblar la visualización de filas con Presentación.",
        mergeError
      );
      setError(true);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(false);

    const body = new FormData();
    body.set("expectedRevision", String(revision));
    body.set("curationJson", curation.value);
    body.set("presentationJson", mergedPresentation);

    try {
      const response = await fetch(combinedAction, {
        method: "POST",
        body,
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error(
          `El guardado conjunto respondió ${response.status}.`
        );
      }

      if (response.redirected) {
        const target = new URL(response.url);
        const outcome = target.searchParams.get("estado");
        const saved = outcome === "guardado";

        if (!saved) {
          savingRef.current = false;
          setSaving(false);
          setError(true);
        }

        router.replace(`${target.pathname}${target.search}`);
      } else {
        // La ruta coordinada normalmente responde mediante redirect. Si un
        // middleware cambia ese contrato, no dejes el editor bloqueado.
        savingRef.current = false;
        setSaving(false);
      }

      router.refresh();
    } catch (saveError) {
      console.error(
        "No se pudo guardar Resto de Inicio de forma coordinada.",
        saveError
      );
      savingRef.current = false;
      setSaving(false);
      setError(true);
    }
  }, [revision, router]);

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
        data-kind={error ? "error" : "info"}
        role={error ? "alert" : "status"}
      >
        <div>
          <strong>
            {error
              ? "El guardado conjunto no pudo completarse"
              : "Resto de Inicio funciona como una sola revisión"}
          </strong>
          <span>
            {error
              ? "Tus cambios siguen conservados en esta pestaña. Revisa el aviso del editor y vuelve a guardar cuando corresponda."
              : "Curaduría, visualización de filas, orden, visibilidad y textos se guardan juntos. Pulsa Guardar en el bloque que tenga cambios para conservar todo lo pendiente antes de crear la nueva revisión."}
          </span>
        </div>
        <b>{saving ? "GUARDANDO…" : `REVISIÓN ${revision}`}</b>
      </div>

      <HomeCurationEditor
        config={config}
        games={games}
        publishedSlugs={publishedSlugs}
        revision={revision}
        rankingReferenceTime={rankingReferenceTime}
        excludeHero
      />
      <HomeRowRevealEditor
        config={config}
        revision={revision}
      />
      <HomePresentationEditor
        config={presentationConfig}
        revision={revision}
      />
    </div>
  );
}
