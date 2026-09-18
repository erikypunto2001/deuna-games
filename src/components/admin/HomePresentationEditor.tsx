"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  HomeCopy,
  HomeSectionConfig,
  ResolvedHomeConfig,
} from "@/data/home-config";

import styles from "./HomePresentationEditor.module.css";

const sectionLabels: Record<HomeSectionConfig["id"], string> = {
  hero: "Hero principal",
  popular: "Juegos populares",
  finder: "Compatibilidad rápida",
  classifications: "Clasificaciones destacadas",
  recent: "Añadidos recientemente",
  updates: "Últimas actualizaciones",
  lowSpec: "Según tu equipo",
  recommended: "Juegos recomendados",
  trust: "Bloque de confianza",
};

type EditableHomeCopy = Omit<HomeCopy, "hero"> & {
  hero: Pick<HomeCopy["hero"], "accessibleTitle">;
};
function editableCopyFromConfig(
  copy: HomeCopy
): EditableHomeCopy {
  const cloned = structuredClone(copy);
  const { hero, ...rest } = cloned;

  return {
    ...rest,
    hero: {
      accessibleTitle: hero.accessibleTitle,
    },
  };
}

function buildPayload(
  sections: HomeSectionConfig[],
  copy: EditableHomeCopy
) {
  return JSON.stringify({ sections, copy });
}

export default function HomePresentationEditor({
  config,
  revision,
}: {
  config: ResolvedHomeConfig;
  revision: number;
}) {
  const baselineSections = useMemo(
    () => config.sections.map((section) => ({ ...section })),
    [config.sections]
  );
  const baselineCopy = useMemo(
    () => editableCopyFromConfig(config.copy),
    [config.copy]
  );
  const baselinePayload = useMemo(
    () => buildPayload(baselineSections, baselineCopy),
    [baselineCopy, baselineSections]
  );
  const [sections, setSections] = useState<HomeSectionConfig[]>(
    () => baselineSections.map((section) => ({ ...section }))
  );
  const [copy, setCopy] = useState<EditableHomeCopy>(
    () => structuredClone(baselineCopy)
  );

  const serialized = useMemo(
    () => buildPayload(sections, copy),
    [copy, sections]
  );
  const dirty = serialized !== baselinePayload;
  function moveSection(index: number, direction: -1 | 1) {
    setSections((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = current.map((section) => ({ ...section }));
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleSection(id: HomeSectionConfig["id"]) {
    setSections((current) =>
      current.map((section) =>
        section.id === id
          ? { ...section, visible: !section.visible }
          : section
      )
    );
  }

  function setCopyField<
    Section extends keyof EditableHomeCopy,
    Field extends keyof EditableHomeCopy[Section],
  >(
    section: Section,
    field: Field,
    value: EditableHomeCopy[Section][Field]
  ) {
    setCopy((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
      },
    }));
  }

  function setTupleValue(
    section: "finder" | "lowSpec",
    field: "features" | "optionTitles" | "optionSubtitles",
    index: number,
    value: string
  ) {
    setCopy((current) => {
      const target = current[section] as Record<string, unknown>;
      const list = [...((target[field] as readonly string[]) ?? [])];
      list[index] = value;
      return {
        ...current,
        [section]: {
          ...current[section],
          [field]: list,
        },
      } as EditableHomeCopy;
    });
  }

  function setTrustValue(
    index: number,
    field: "title" | "text",
    value: string
  ) {
    setCopy((current) => {
      const items = current.trust.items.map((item) => ({ ...item })) as EditableHomeCopy["trust"]["items"];
      items[index] = { ...items[index], [field]: value };
      return { ...current, trust: { items } };
    });
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
        name="presentationJson"
        value={serialized}
      />

      <div className={styles.summary}>
        <div>
          <strong>Presentación pública de Inicio</strong>
          <p>
            Ordena, muestra u oculta bloques y edita sus textos. El Hero tiene un editor propio para juegos y geometría; aquí también controlas el título SEO y accesible de la página.
          </p>
        </div>
        <span data-dirty={dirty ? "true" : "false"}>
          {dirty ? "Cambios sin guardar" : `Revisión ${revision}`}
        </span>
      </div>

      <section className={styles.structurePanel}>
        <p className={styles.structureIntro}>
          El orden se reutiliza directamente al renderizar Inicio. Ocultar un bloque no borra su configuración ni sus juegos seleccionados.
        </p>
        <div className={styles.sectionList}>
          {sections.map((section, index) => (
            <div key={section.id} className={styles.sectionRow}>
              <div className={styles.sectionIdentity}>
                <span className={styles.sectionOrder}>{index + 1}</span>
                <strong>{sectionLabels[section.id]}</strong>
              </div>
              <div className={styles.orderButtons}>
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Subir ${sectionLabels[section.id]}`}
                  onClick={() => moveSection(index, -1)}
                >
                  <ArrowUp size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={index === sections.length - 1}
                  aria-label={`Bajar ${sectionLabels[section.id]}`}
                  onClick={() => moveSection(index, 1)}
                >
                  <ArrowDown size={15} aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                className={styles.visibilityButton}
                data-visible={section.visible}
                onClick={() => toggleSection(section.id)}
              >
                {section.visible ? "Visible" : "Oculto"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.copyPanel}>
        <div className={styles.copyHeader}>
          <strong>Textos de los bloques</strong>
          <p>
            El contenido visible del Hero sale directamente del juego. Aquí editas los textos de las demás secciones y el título de página que comparten accesibilidad, metadata y previews sociales.
          </p>
        </div>

        <div className={styles.copyGroups}>
          <details className={styles.copyGroup}>
            <summary>SEO y accesibilidad de Inicio</summary>
            <div className={styles.copyFields}>
              <label data-wide="true">
                <span>Título SEO/accesible</span>
                <input
                  value={copy.hero.accessibleTitle}
                  maxLength={180}
                  onChange={(event) =>
                    setCopyField(
                      "hero",
                      "accessibleTitle",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          </details>

          {([
            ["popular", "Juegos populares"],
            ["classifications", "Clasificaciones destacadas"],
            ["recent", "Añadidos recientemente"],
          ] as const).map(([section, label]) => (
            <details key={section} className={styles.copyGroup}>
              <summary>{label}</summary>
              <div className={styles.copyFields}>
                <label>
                  <span>Título</span>
                  <input
                    value={copy[section].title}
                    maxLength={180}
                    onChange={(event) =>
                      setCopyField(section, "title", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Destacado</span>
                  <input
                    value={copy[section].highlight}
                    maxLength={180}
                    onChange={(event) =>
                      setCopyField(section, "highlight", event.target.value)
                    }
                  />
                </label>
                <label data-wide="true">
                  <span>Texto del enlace</span>
                  <input
                    value={copy[section].linkLabel}
                    maxLength={100}
                    onChange={(event) =>
                      setCopyField(section, "linkLabel", event.target.value)
                    }
                  />
                </label>
              </div>
            </details>
          ))}

          <details className={styles.copyGroup}>
            <summary>Compatibilidad rápida</summary>
            <div className={styles.copyFields}>
              <label><span>Eyebrow</span><input value={copy.finder.eyebrow} maxLength={100} onChange={(event) => setCopyField("finder", "eyebrow", event.target.value)} /></label>
              <label><span>Título</span><input value={copy.finder.title} maxLength={180} onChange={(event) => setCopyField("finder", "title", event.target.value)} /></label>
              <label><span>Destacado</span><input value={copy.finder.highlight} maxLength={180} onChange={(event) => setCopyField("finder", "highlight", event.target.value)} /></label>
              <label><span>CTA</span><input value={copy.finder.cta} maxLength={100} onChange={(event) => setCopyField("finder", "cta", event.target.value)} /></label>
              <label data-wide="true"><span>Descripción</span><textarea value={copy.finder.text} maxLength={900} onChange={(event) => setCopyField("finder", "text", event.target.value)} /></label>
              {copy.finder.features.map((feature, index) => (
                <label key={index}>
                  <span>Señal {index + 1}</span>
                  <input value={feature} maxLength={100} onChange={(event) => setTupleValue("finder", "features", index, event.target.value)} />
                </label>
              ))}
            </div>
          </details>

          <details className={styles.copyGroup}>
            <summary>Últimas actualizaciones</summary>
            <div className={styles.copyFields}>
              {([
                ["title", "Título"],
                ["highlight", "Destacado"],
                ["linkLabel", "Enlace general"],
                ["badgeLabel", "Badge de tarjeta"],
                ["detailsLabel", "Acción de tarjeta"],
              ] as const).map(([field, label]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input value={copy.updates[field]} maxLength={180} onChange={(event) => setCopyField("updates", field, event.target.value)} />
                </label>
              ))}
            </div>
          </details>

          <details className={styles.copyGroup}>
            <summary>Según tu equipo</summary>
            <div className={styles.copyFields}>
              {([
                ["eyebrow", "Eyebrow"],
                ["title", "Título"],
                ["highlight", "Destacado"],
                ["cta", "CTA"],
                ["listTitle", "Título de lista"],
                ["listHighlight", "Destacado de lista"],
                ["listLinkLabel", "Enlace de lista"],
              ] as const).map(([field, label]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input value={copy.lowSpec[field]} maxLength={180} onChange={(event) => setCopyField("lowSpec", field, event.target.value)} />
                </label>
              ))}
              <label data-wide="true"><span>Descripción</span><textarea value={copy.lowSpec.text} maxLength={900} onChange={(event) => setCopyField("lowSpec", "text", event.target.value)} /></label>
              {copy.lowSpec.optionTitles.map((title, index) => (
                <label key={`option-title-${index}`}>
                  <span>Opción {index + 1} · título</span>
                  <input value={title} maxLength={180} onChange={(event) => setTupleValue("lowSpec", "optionTitles", index, event.target.value)} />
                </label>
              ))}
              {copy.lowSpec.optionSubtitles.map((subtitle, index) => (
                <label key={`option-subtitle-${index}`}>
                  <span>Opción {index + 1} · descripción</span>
                  <input value={subtitle} maxLength={900} onChange={(event) => setTupleValue("lowSpec", "optionSubtitles", index, event.target.value)} />
                </label>
              ))}
            </div>
          </details>

          <details className={styles.copyGroup}>
            <summary>Juegos recomendados</summary>
            <div className={styles.copyFields}>
              {([
                ["eyebrow", "Eyebrow"],
                ["title", "Título"],
                ["highlight", "Destacado"],
                ["linkLabel", "Texto del enlace"],
              ] as const).map(([field, label]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input value={copy.recommended[field]} maxLength={180} onChange={(event) => setCopyField("recommended", field, event.target.value)} />
                </label>
              ))}
              <label data-wide="true"><span>Descripción</span><textarea value={copy.recommended.text} maxLength={900} onChange={(event) => setCopyField("recommended", "text", event.target.value)} /></label>
            </div>
          </details>

          <details className={styles.copyGroup}>
            <summary>Bloque de confianza</summary>
            <div className={styles.copyFields}>
              {copy.trust.items.map((item, index) => (
                <div key={index}>
                  <label><span>Tarjeta {index + 1} · título</span><input value={item.title} maxLength={180} onChange={(event) => setTrustValue(index, "title", event.target.value)} /></label>
                  <label><span>Tarjeta {index + 1} · texto</span><textarea value={item.text} maxLength={900} onChange={(event) => setTrustValue(index, "text", event.target.value)} /></label>
                </div>
              ))}
            </div>
          </details>
        </div>
      </section>

      <div className={styles.actions}>
        <p>
          Guardar sólo modifica el borrador de Portada. El orden, visibilidad y textos públicos no cambian hasta publicar.
        </p>
        <button type="submit" disabled={!dirty}>
          {dirty ? "Guardar presentación" : "Presentación guardada"}
        </button>
      </div>
    </form>
  );
}
