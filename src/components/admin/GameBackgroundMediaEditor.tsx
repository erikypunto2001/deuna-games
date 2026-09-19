"use client";

import {
  CheckCircle2,
  Info,
  MonitorPlay,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import AdminMediaThumbnail from "@/components/admin/AdminMediaThumbnail";
import ContextualMediaDialog from "@/components/admin/ContextualMediaDialog";
import GameBackgroundViewportEditor from "@/components/admin/GameBackgroundViewportEditor";
import {
  STANDARD_GAME_MEDIA_MODES,
} from "@/lib/media/game-media-mode-policy";
import type {
  GameBackgroundVideo,
  GameDestinationMediaMode,
  GameImageViewport,
} from "@/types/game";

import styles from "./GameBackgroundMediaEditor.module.css";
import assignmentStyles from "./GameMultimediaEditor.module.css";
import contextualStyles from "./GameMultimediaWorkspaceContextual.module.css";

type ResourceImage = {
  kind: "image";
  origin: "editorial" | "bundled";
  src: string;
  digest: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
};

type ResourceVideo = {
  kind: "video";
  origin: "editorial";
  src: string;
  digest: string;
  bytes: number;
};

type LibraryResource = ResourceImage | ResourceVideo;

type BackgroundAssignment = {
  mode: GameDestinationMediaMode | null;
  image: string | null;
  imageViewport: GameImageViewport | null;
  video: GameBackgroundVideo | null;
};

type Props = {
  slug: string;
  revision: number;
  resources: LibraryResource[];
  assignment: BackgroundAssignment;
  stale?: boolean;
  onAddResource: (kind: "image" | "video") => void;
};

const MODES = STANDARD_GAME_MEDIA_MODES.map((value) => ({
  value,
  label: value === "video" ? "Video" : "Imagen",
}));

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function shortName(src: string) {
  const filename = src.split("/").filter(Boolean).at(-1) ?? src;
  return filename.length <= 22 ? filename : `${filename.slice(0, 10)}…${filename.slice(-9)}`;
}

function requirementActionClass(complete: boolean) {
  return complete
    ? contextualStyles.requirementActionComplete
    : contextualStyles.requirementActionMissing;
}

function RequirementActionIcon({ complete }: { complete: boolean }) {
  return complete
    ? <CheckCircle2 size={17} aria-hidden="true" />
    : <Info size={17} aria-hidden="true" />;
}

function RequirementButton({
  complete,
  hasResource,
  mediaKind,
  disabled,
  onClick,
}: {
  complete: boolean;
  hasResource: boolean;
  mediaKind: "image" | "video";
  disabled?: boolean;
  onClick: () => void;
}) {
  const medium = mediaKind === "image" ? "imagen" : "video";
  const label = `Recorte adaptable · ${medium} ${complete ? "confirmado" : "no confirmado"}`;

  return (
    <button
      type="button"
      className={`${assignmentStyles.editDestinationButton} ${requirementActionClass(complete)}`}
      data-requirement-state={complete ? "complete" : "missing"}
      disabled={disabled || !hasResource}
      onClick={onClick}
      title={complete ? "Editar recorte adaptable" : undefined}
    >
      <RequirementActionIcon complete={complete} />
      {label}
    </button>
  );
}

function ResourcePicker({
  kind,
  resources,
  selected,
  busy,
  onSelect,
  onAddResource,
}: {
  kind: "image" | "video";
  resources: LibraryResource[];
  selected: string | null;
  busy: boolean;
  onSelect: (src: string) => void;
  onAddResource: (kind: "image" | "video") => void;
}) {
  const available = resources.filter((resource) => resource.kind === kind);
  const complete = Boolean(selected);
  const missingLabel = kind === "image"
    ? "Falta seleccionar imagen"
    : "Falta seleccionar video";
  const completeLabel = kind === "image"
    ? "Imagen seleccionada"
    : "Video seleccionado";

  return (
    <details className={styles.resourcePicker}>
      <summary
        className={`${assignmentStyles.selectResourceButton} ${requirementActionClass(complete)}`}
        data-requirement-state={complete ? "complete" : "missing"}
        title={complete ? `Cambiar ${kind === "image" ? "imagen" : "video"}` : undefined}
      >
        <RequirementActionIcon complete={complete} />
        <span>{complete ? completeLabel : missingLabel}</span>
      </summary>
      <div className={styles.resourcePanel}>
        <div className={styles.resourcePanelHeading}>
          <strong>{kind === "image" ? "Imágenes disponibles" : "Videos disponibles"}</strong>
          <span>{available.length} recurso{available.length === 1 ? "" : "s"}</span>
        </div>
        {available.length ? (
          <div className={styles.resourceGrid}>
            {available.map((resource) => (
              <button
                key={resource.src}
                type="button"
                className={`${styles.resourceCard} ${selected === resource.src ? styles.resourceSelected : ""}`}
                disabled={busy}
                onClick={() => onSelect(resource.src)}
              >
                <AdminMediaThumbnail
                  kind={resource.kind}
                  src={resource.src}
                  mode="source"
                  label={`Fuente ${shortName(resource.src)}`}
                  sizes="96px"
                  className={styles.resourceThumb}
                />
                <span className={styles.resourceCopy}>
                  <strong>{shortName(resource.src)}</strong>
                  <small>{resource.kind === "video" ? `WebM · ${formatBytes(resource.bytes)}` : formatBytes(resource.bytes)}</small>
                </span>
                {selected === resource.src && <CheckCircle2 size={16} aria-label="Seleccionado" />}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.emptyResource}>
            No hay {kind === "image" ? "imágenes" : "videos"} disponibles. Agrégalos una sola vez desde la Biblioteca multimedia compartida.
          </p>
        )}
        <button
          type="button"
          className={styles.libraryLink}
          disabled={busy}
          onClick={() => onAddResource(kind)}
        >
          Agregar {kind === "image" ? "imagen" : "video"} a Biblioteca
        </button>
      </div>
    </details>
  );
}

export default function GameBackgroundMediaEditor({
  slug,
  revision,
  resources,
  assignment,
  stale = false,
  onAddResource,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<"image" | "video" | null>(null);

  const endpoint = `/api/admin/content/games/${encodeURIComponent(slug)}/background-media`;
  const mode = assignment.mode;
  const imageSelected = Boolean(assignment.image);
  const imageCropReady = assignment.imageViewport?.confirmed === true;
  const videoSelected = Boolean(assignment.video?.clip);
  const videoCropReady = assignment.video?.viewport.confirmed === true &&
    assignment.video?.viewport.aspect === "source";
  const needsImage = mode === "image";
  const needsVideo = mode === "video";
  const activeReady = Boolean(
    mode &&
      (!needsImage || (imageSelected && imageCropReady)) &&
      (!needsVideo || (videoSelected && videoCropReady))
  );
  const controlsDisabled = busy || stale;
  const currentLabel = !mode
    ? "Fondo global"
    : mode === "video"
      ? "Video"
      : "Imagen";
  const imageResource = resources.find(
    (resource): resource is ResourceImage => resource.kind === "image" && resource.src === assignment.image
  ) ?? null;
  const videoResource = resources.find(
    (resource): resource is ResourceVideo => resource.kind === "video" && resource.src === assignment.video?.clip
  ) ?? null;

  async function mutate(action: string, resource: string) {
    if (controlsDisabled) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({
          expectedRevision: String(revision),
          action,
          resource,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "No se pudo guardar el Fondo del juego.");
      }
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el Fondo del juego.");
      setBusy(false);
    }
  }

  const resourceDescription = !mode
    ? "Usa el fondo global de Juegos; no agrega un recurso propio."
    : mode === "video"
      ? videoResource ? shortName(videoResource.src) : "Selecciona un video"
      : assignment.image ? shortName(assignment.image) : "Selecciona una imagen";

  return (
    <>
      <article id="background-media" className={assignmentStyles.assignmentCard} aria-labelledby="game-background-heading">
        <header>
          <div><span>D</span><h3 id="game-background-heading">Fondo del juego</h3></div>
          <small>Opcional · recorte adaptable</small>
        </header>

        <div className={assignmentStyles.modeSwitch} aria-label="Modo del Fondo del juego">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={controlsDisabled}
              aria-pressed={mode === option.value}
              className={mode === option.value ? assignmentStyles.modeActive : ""}
              onClick={() => void mutate("mode", option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className={assignmentStyles.currentResource}>
          {(mode === "image" && imageResource) || (mode === "video" && videoResource) ? (
            <span className={assignmentStyles.currentMediaSet}>
              {mode === "image" && imageResource && (
                <AdminMediaThumbnail
                  kind="image"
                  src={imageResource.src}
                  viewport={assignment.imageViewport ?? undefined}
                  mode="destination"
                  frameAspect={16 / 9}
                  label="Fondo adaptable · imagen"
                  badge="ADAPTABLE"
                  className={assignmentStyles.currentThumb}
                />
              )}
              {mode === "video" && videoResource && (
                <AdminMediaThumbnail
                  kind="video"
                  src={videoResource.src}
                  viewport={assignment.video?.viewport}
                  mode="destination"
                  frameAspect={16 / 9}
                  label="Fondo adaptable · video"
                  badge="ADAPTABLE"
                  className={assignmentStyles.currentThumb}
                />
              )}
            </span>
          ) : (
            <span className={assignmentStyles.currentIcon}>
              {mode === "video" ? <MonitorPlay size={20} aria-hidden="true" /> : <Sparkles size={20} aria-hidden="true" />}
            </span>
          )}
          <div>
            <span>{mode ? "Modo activo" : "Fondo actual"}</span>
            <strong>{currentLabel}</strong>
            <small>{resourceDescription}</small>
          </div>
        </div>

        {mode && (
          <div className={assignmentStyles.assignmentActions}>
            {needsImage && (
              <ResourcePicker
                kind="image"
                resources={resources}
                selected={assignment.image}
                busy={controlsDisabled}
                onSelect={(src) => void mutate("select-image", src)}
                onAddResource={onAddResource}
              />
            )}
            {needsVideo && (
              <ResourcePicker
                kind="video"
                resources={resources}
                selected={assignment.video?.clip ?? null}
                busy={controlsDisabled}
                onSelect={(src) => void mutate("select-video", src)}
                onAddResource={onAddResource}
              />
            )}
            {needsImage && (
              <RequirementButton
                complete={imageCropReady}
                hasResource={imageSelected}
                mediaKind="image"
                disabled={controlsDisabled}
                onClick={() => imageSelected && setEditing("image")}
              />
            )}
            {needsVideo && (
              <RequirementButton
                complete={videoCropReady}
                hasResource={videoSelected}
                mediaKind="video"
                disabled={controlsDisabled}
                onClick={() => videoSelected && setEditing("video")}
              />
            )}
            <button
              type="button"
              className={styles.globalButton}
              disabled={controlsDisabled}
              onClick={() => void mutate("global", "global")}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Usar fondo global
            </button>
          </div>
        )}

        <small className={!mode || activeReady ? contextualStyles.requirementReady : contextualStyles.requirementPending}>
          {!mode || activeReady ? <CheckCircle2 size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}
          {!mode
            ? "FONDO GLOBAL ACTIVO · DESTINO OPCIONAL"
            : activeReady
              ? "RECORTE ADAPTABLE CONFIRMADO"
              : "RECORTE ADAPTABLE NO CONFIRMADO"}
        </small>

        {error && <div className={styles.error} role="alert">{error}</div>}
      </article>

      {editing === "image" && assignment.image && (
        <ContextualMediaDialog
          eyebrow="FONDO ADAPTABLE"
          title="Recorte adaptable de la imagen de fondo"
          description="El archivo físico permanece intacto. La posición y el zoom se adaptan a las distintas proporciones de pantalla."
          onClose={() => setEditing(null)}
        >
          <GameBackgroundViewportEditor
            slug={slug}
            revision={revision}
            kind="image"
            src={assignment.image}
            label={`Fondo · ${shortName(assignment.image)}`}
            initialViewport={assignment.imageViewport ?? undefined}
            onClose={() => setEditing(null)}
            onSaved={() => window.location.reload()}
          />
        </ContextualMediaDialog>
      )}

      {editing === "video" && assignment.video?.clip && (
        <ContextualMediaDialog
          eyebrow="FONDO ADAPTABLE"
          title="Recorte adaptable del video de fondo"
          description="El WebM físico permanece intacto. Sólo se guardan posición y zoom para su presentación adaptable."
          onClose={() => setEditing(null)}
        >
          <GameBackgroundViewportEditor
            slug={slug}
            revision={revision}
            kind="video"
            src={assignment.video.clip}
            label={`Fondo · ${shortName(assignment.video.clip)}`}
            initialViewport={assignment.video.viewport}
            onClose={() => setEditing(null)}
            onSaved={() => window.location.reload()}
          />
        </ContextualMediaDialog>
      )}
    </>
  );
}
