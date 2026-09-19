"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import adminStyles from "../../app/admin/admin.module.css";
import GameEditorFormActions from "./GameEditorFormActions";
import {
  multimediaShortName,
} from "./game-multimedia-library-types";
import {
  useGameMultimediaWorkspace,
} from "./GameMultimediaWorkspaceProvider";

type AccessibilityLabels = {
  cover: string;
  hero: string;
  card: string;
  detail: string;
  gallery: Record<string, string>;
};

function galleryKey(kind: "image" | "video", src: string) {
  return `${kind}:${src}`;
}

function emptyLabels(): AccessibilityLabels {
  return {
    cover: "",
    hero: "",
    card: "",
    detail: "",
    gallery: {},
  };
}

export default function GameMediaAccessibilityEditor({
  slug,
}: {
  slug: string;
}) {
  const {
    workspace,
    loading,
    error,
    stale,
  } = useGameMultimediaWorkspace();
  const [labels, setLabels] = useState<AccessibilityLabels>(emptyLabels);

  useEffect(() => {
    if (!workspace) return;

    const galleryLabels: Record<string, string> = {};
    for (const item of workspace.accessibility?.gallery ?? []) {
      galleryLabels[galleryKey(item.kind, item.src)] = item.label;
    }

    setLabels({
      cover: workspace.accessibility?.cover ?? "",
      hero: workspace.accessibility?.hero ?? "",
      card: workspace.accessibility?.card ?? "",
      detail: workspace.accessibility?.detail ?? "",
      gallery: galleryLabels,
    });
  }, [workspace]);

  const accessibilityJson = useMemo(() => {
    const compact = {
      ...(labels.cover.trim() ? { cover: labels.cover.trim() } : {}),
      ...(labels.hero.trim() ? { hero: labels.hero.trim() } : {}),
      ...(labels.card.trim() ? { card: labels.card.trim() } : {}),
      ...(labels.detail.trim() ? { detail: labels.detail.trim() } : {}),
    } as {
      cover?: string;
      hero?: string;
      card?: string;
      detail?: string;
      gallery?: Array<{
        kind: "image" | "video";
        src: string;
        label: string;
      }>;
    };

    const gallery = (workspace?.gallery ?? []).flatMap((item) => {
      const label = labels.gallery[galleryKey(item.kind, item.src)]?.trim();
      return label
        ? [{ kind: item.kind, src: item.src, label }]
        : [];
    });

    if (gallery.length > 0) compact.gallery = gallery;
    return JSON.stringify(compact);
  }, [labels, workspace?.gallery]);

  function setDestination(
    destination: "cover" | "hero" | "card" | "detail",
    value: string
  ) {
    setLabels((current) => ({
      ...current,
      [destination]: value,
    }));
  }

  function setGalleryLabel(
    kind: "image" | "video",
    src: string,
    value: string
  ) {
    const key = galleryKey(kind, src);
    setLabels((current) => ({
      ...current,
      gallery: {
        ...current.gallery,
        [key]: value,
      },
    }));
  }

  if (loading) {
    return (
      <section className={adminStyles.editorPanel} aria-live="polite">
        <div className={adminStyles.sectionHeading}>
          <div>
            <span>ACCESIBILIDAD</span>
            <h2>Textos alternativos por contexto</h2>
          </div>
        </div>
        <div className={`${adminStyles.editorNotice} ${adminStyles.fieldWide}`}>
          Cargando asignaciones multimedia del borrador…
        </div>
      </section>
    );
  }

  if (error || !workspace) {
    return (
      <section className={adminStyles.editorPanel} aria-live="polite">
        <div className={adminStyles.sectionHeading}>
          <div>
            <span>ACCESIBILIDAD</span>
            <h2>Textos alternativos por contexto</h2>
          </div>
        </div>
        <div className={`${adminStyles.editorNotice} ${adminStyles.editorNoticeWarning} ${adminStyles.fieldWide}`}>
          No se pudo cargar el workspace multimedia. Recarga el editor antes de modificar los textos accesibles.
        </div>
      </section>
    );
  }

  if (stale) {
    return (
      <section className={adminStyles.editorPanel} aria-live="polite">
        <div className={adminStyles.sectionHeading}>
          <div>
            <span>ACCESIBILIDAD</span>
            <h2>Textos alternativos por contexto</h2>
          </div>
        </div>
        <div className={`${adminStyles.editorNotice} ${adminStyles.editorNoticeWarning} ${adminStyles.fieldWide}`}>
          El contenido multimedia cambió a la revisión {workspace.revision}. Recarga esta página para editar accesibilidad sobre la revisión actual.
        </div>
      </section>
    );
  }

  const assignments = workspace.assignments;
  const hasCover = Boolean(assignments.coverImage);
  const hasHero = Boolean(assignments.heroImage);
  const hasCard = Boolean(
    assignments.cardMode !== "video" && assignments.cardImage
  );
  const hasDetail = Boolean(
    assignments.detailMode !== "video" && assignments.detailImage
  );
  const gallery = workspace.gallery ?? [];
  const action =
    `/api/admin/content/games/${encodeURIComponent(slug)}/media-accessibility`;

  return (
    <section className={adminStyles.editorPanel}>
      <div className={adminStyles.sectionHeading}>
        <div>
          <span>ACCESIBILIDAD</span>
          <h2>Textos alternativos por contexto</h2>
        </div>
        <p>
          Describe qué comunica cada recurso cuando tiene significado. El mismo archivo puede necesitar un texto distinto en Portada, Card o Galería.
        </p>
      </div>

      <form className={adminStyles.editorForm} method="post" action={action}>
        <input
          type="hidden"
          name="expectedRevision"
          value={workspace.revision}
        />
        <input
          type="hidden"
          name="accessibilityJson"
          value={accessibilityJson}
        />

        <div className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Contexto, no archivo físico</strong>
          <span>
            Fondo y capas de video puramente decorativas continúan ocultas a lectores de pantalla. Aquí documentas sólo imágenes con significado y cada elemento interactivo de Galería.
          </span>
        </div>

        {hasCover && (
          <label className={adminStyles.fieldWide}>
            <span>Portada</span>
            <input
              value={labels.cover}
              onChange={(event) => setDestination("cover", event.target.value)}
              maxLength={240}
              placeholder="Ej. Personaje principal frente a una ciudad en ruinas"
            />
            <small>
              Describe la imagen o concepto principal sin repetir “portada de”. Si queda vacío, la web conserva el texto alternativo general histórico.
            </small>
          </label>
        )}

        {hasHero && (
          <label className={adminStyles.fieldWide}>
            <span>Hero</span>
            <input
              value={labels.hero}
              onChange={(event) => setDestination("hero", event.target.value)}
              maxLength={240}
              placeholder="Descripción contextual del Hero"
            />
            <small>
              El Hero visual de la ficha es decorativo; este texto se reutiliza cuando esa imagen necesita una descripción semántica, por ejemplo en metadata social.
            </small>
          </label>
        )}

        {hasCard && (
          <label className={adminStyles.fieldWide}>
            <span>Card</span>
            <input
              value={labels.card}
              onChange={(event) => setDestination("card", event.target.value)}
              maxLength={240}
              placeholder="Descripción breve para la tarjeta del juego"
            />
            <small>
              Úsalo para describir la imagen de descubrimiento cuando aporte información distinta a la Portada.
            </small>
          </label>
        )}

        {hasDetail && (
          <label className={adminStyles.fieldWide}>
            <span>Contenedor de la ficha</span>
            <input
              value={labels.detail}
              onChange={(event) => setDestination("detail", event.target.value)}
              maxLength={240}
              placeholder="Descripción contextual del recurso principal de la ficha"
            />
            <small>
              Se conserva como metadata contextual aunque el contenedor visual actual de la ficha sea decorativo.
            </small>
          </label>
        )}

        <div className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Galería · {gallery.length} recurso{gallery.length === 1 ? "" : "s"}</strong>
          <span>
            Cada imagen o video interactivo puede tener una etiqueta propia. En videos, este texto identifica el contenido ante tecnologías de asistencia.
          </span>
        </div>

        {gallery.length === 0 ? (
          <div className={`${adminStyles.editorNotice} ${adminStyles.fieldWide}`}>
            No hay elementos de Galería asignados. Cuando agregues uno aparecerá aquí sin duplicar el recurso multimedia.
          </div>
        ) : (
          gallery.map((item, index) => (
            <label
              key={galleryKey(item.kind, item.src)}
              className={adminStyles.fieldWide}
            >
              <span>
                Galería {index + 1} · {item.kind === "image" ? "Imagen" : "Video"} · {multimediaShortName(item.src)}
              </span>
              <input
                value={labels.gallery[galleryKey(item.kind, item.src)] ?? ""}
                onChange={(event) =>
                  setGalleryLabel(item.kind, item.src, event.target.value)
                }
                maxLength={240}
                placeholder={
                  item.kind === "image"
                    ? "Describe lo que aporta esta captura"
                    : "Describe el contenido del video"
                }
              />
            </label>
          ))
        )}

        <GameEditorFormActions
          note="Guardar modifica únicamente el borrador y conserva fallbacks históricos para campos todavía vacíos. La web pública cambia sólo al publicar una nueva revisión."
          action={action}
          continueTo="descargas"
          saveLabel="Guardar accesibilidad"
          continueLabel="Guardar y continuar a Distribución"
        />
      </form>
    </section>
  );
}
