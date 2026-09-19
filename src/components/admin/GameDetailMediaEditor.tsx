"use client";

import {
  CheckCircle2,
  Info,
  MonitorPlay,
  PanelsTopLeft,
} from "lucide-react";
import { useState } from "react";

import AdminMediaThumbnail from "@/components/admin/AdminMediaThumbnail";
import ContextualMediaDialog from "@/components/admin/ContextualMediaDialog";
import GameVideoViewportEditor from "@/components/admin/GameVideoViewportEditor";
import ImageViewportEditor from "@/components/admin/ImageViewportEditor";
import {
  STANDARD_GAME_MEDIA_MODES,
} from "@/lib/media/game-media-mode-policy";
import type {
  GameDestinationMediaMode,
  GameDetailVideo,
  GameImageViewport,
} from "@/types/game";

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

type DetailAssignment = {
  mode: GameDestinationMediaMode;
  image: string | null;
  imageViewport: GameImageViewport | null;
  video: GameDetailVideo | null;
};

type Props = {
  slug: string;
  revision: number;
  endpoint: string;
  resources: LibraryResource[];
  assignment: DetailAssignment;
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
  return filename.length <= 22
    ? filename
    : `${filename.slice(0, 10)}…${filename.slice(-9)}`;
}

function requirementActionClass(complete: boolean) {
  return complete
    ? contextualStyles.requirementActionComplete
    : contextualStyles.requirementActionMissing;
}

function RequirementIcon({ complete }: { complete: boolean }) {
  return complete
    ? <CheckCircle2 size={17} aria-hidden="true" />
    : <Info size={17} aria-hidden="true" />;
}

function ModeSwitch({
  endpoint,
  revision,
  mode,
  disabled,
}: {
  endpoint: string;
  revision: number;
  mode: GameDestinationMediaMode;
  disabled: boolean;
}) {
  return (
    <form
      method="post"
      action={endpoint}
      className={assignmentStyles.modeSwitch}
      aria-label="Modo del Contenedor de la ficha"
    >
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="target" value="detail-mode" />
      {MODES.map((option) => (
        <button
          key={option.value}
          type="submit"
          name="resource"
          value={option.value}
          className={mode === option.value ? assignmentStyles.modeActive : ""}
          disabled={disabled}
          aria-pressed={mode === option.value}
        >
          {option.label}
        </button>
      ))}
    </form>
  );
}

function ResourcePicker({
  endpoint,
  revision,
  resources,
  kind,
  selected,
  disabled,
  onAddResource,
}: {
  endpoint: string;
  revision: number;
  resources: LibraryResource[];
  kind: "image" | "video";
  selected: string | null;
  disabled: boolean;
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
    <details className={assignmentStyles.resourcePicker}>
      <summary
        className={`${assignmentStyles.selectResourceButton} ${requirementActionClass(complete)}`}
        data-requirement-state={complete ? "complete" : "missing"}
        title={complete ? `Cambiar ${kind === "image" ? "imagen" : "video"}` : undefined}
      >
        <RequirementIcon complete={complete} />
        <span>{complete ? completeLabel : missingLabel}</span>
      </summary>
      <div className={assignmentStyles.resourcePickerPanel}>
        <div className={assignmentStyles.resourcePickerHeading}>
          <strong>{kind === "image" ? "Imágenes disponibles" : "Videos disponibles"}</strong>
          <span>{available.length} recurso{available.length === 1 ? "" : "s"}</span>
        </div>
        {available.length ? (
          <div className={assignmentStyles.resourceChoiceGrid}>
            {available.map((resource) => (
              <form key={resource.src} method="post" action={endpoint}>
                <input type="hidden" name="expectedRevision" value={revision} />
                <input type="hidden" name="target" value={`detail-${kind}`} />
                <input type="hidden" name="resource" value={resource.src} />
                <button
                  type="submit"
                  className={assignmentStyles.resourceChoice}
                  disabled={disabled}
                >
                  <AdminMediaThumbnail
                    kind={resource.kind}
                    src={resource.src}
                    mode="source"
                    label={`Fuente ${shortName(resource.src)}`}
                    sizes="96px"
                    className={assignmentStyles.choiceThumb}
                  />
                  <span className={assignmentStyles.choiceMeta}>
                    <strong>{shortName(resource.src)}</strong>
                    <small>{resource.kind === "video" ? `WebM · ${formatBytes(resource.bytes)}` : formatBytes(resource.bytes)}</small>
                  </span>
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p className={assignmentStyles.emptyPicker}>
            No hay {kind === "image" ? "imágenes" : "videos"} disponibles todavía.
          </p>
        )}
        <div className={contextualStyles.pickerFooter}>
          <button
            type="button"
            className={contextualStyles.pickerAddButton}
            disabled={disabled}
            onClick={() => onAddResource(kind)}
          >
            Agregar nuevo recurso
          </button>
        </div>
      </div>
    </details>
  );
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
  disabled: boolean;
  onClick: () => void;
}) {
  const medium = mediaKind === "image" ? "imagen" : "video";
  return (
    <button
      type="button"
      className={`${assignmentStyles.editDestinationButton} ${requirementActionClass(complete)}`}
      data-requirement-state={complete ? "complete" : "missing"}
      disabled={disabled || !hasResource}
      onClick={onClick}
      title={complete ? "Editar recorte adaptable" : undefined}
    >
      <RequirementIcon complete={complete} />
      {`Recorte adaptable · ${medium} ${complete ? "confirmado" : "no confirmado"}`}
    </button>
  );
}

function modeLabel(mode: GameDestinationMediaMode) {
  return mode === "video" ? "Video" : "Imagen";
}

export default function GameDetailMediaEditor({
  slug,
  revision,
  endpoint,
  resources,
  assignment,
  stale = false,
  onAddResource,
}: Props) {
  const [editing, setEditing] = useState<"image" | "video" | null>(null);
  const imageSelected = Boolean(assignment.image);
  const videoSelected = Boolean(assignment.video?.clip);
  const imageCropReady = assignment.imageViewport?.confirmed === true;
  const videoCropReady = assignment.video?.viewport.confirmed === true &&
    assignment.video.viewport.aspect === "source";
  const needsImage = assignment.mode === "image";
  const needsVideo = assignment.mode === "video";
  const ready = (!needsImage || (imageSelected && imageCropReady)) &&
    (!needsVideo || (videoSelected && videoCropReady));
  const imageResource = resources.find(
    (resource): resource is ResourceImage => resource.kind === "image" && resource.src === assignment.image
  ) ?? null;
  const videoResource = resources.find(
    (resource): resource is ResourceVideo => resource.kind === "video" && resource.src === assignment.video?.clip
  ) ?? null;
  const description = assignment.mode === "video"
    ? videoResource ? shortName(videoResource.src) : "Selecciona un video"
    : assignment.image ? shortName(assignment.image) : "Selecciona una imagen";

  return (
    <>
      <article id="detail-container-media" className={assignmentStyles.assignmentCard} aria-labelledby="game-detail-media-heading">
        <header>
          <div><span>E</span><h3 id="game-detail-media-heading">Contenedor de la ficha</h3></div>
          <small>Obligatorio · recorte adaptable</small>
        </header>

        <ModeSwitch
          endpoint={endpoint}
          revision={revision}
          mode={assignment.mode}
          disabled={stale}
        />

        <div className={assignmentStyles.currentResource}>
          {(assignment.mode === "image" && imageResource) || (assignment.mode === "video" && videoResource) ? (
            <span className={assignmentStyles.currentMediaSet}>
              {assignment.mode === "image" && imageResource && (
                <AdminMediaThumbnail
                  kind="image"
                  src={imageResource.src}
                  viewport={assignment.imageViewport ?? undefined}
                  mode="destination"
                  frameAspect={16 / 9}
                  label="Contenedor adaptable · imagen"
                  badge="ADAPTABLE"
                  className={assignmentStyles.currentThumb}
                />
              )}
              {assignment.mode === "video" && videoResource && (
                <AdminMediaThumbnail
                  kind="video"
                  src={videoResource.src}
                  viewport={assignment.video?.viewport}
                  mode="destination"
                  frameAspect={16 / 9}
                  label="Contenedor adaptable · video"
                  badge="ADAPTABLE"
                  className={assignmentStyles.currentThumb}
                />
              )}
            </span>
          ) : (
            <span className={assignmentStyles.currentIcon}>
              {assignment.mode === "video"
                ? <MonitorPlay size={20} aria-hidden="true" />
                : <PanelsTopLeft size={20} aria-hidden="true" />}
            </span>
          )}
          <div>
            <span>Recurso independiente del Hero</span>
            <strong>{modeLabel(assignment.mode)}</strong>
            <small>{description}</small>
          </div>
        </div>

        <div className={assignmentStyles.assignmentActions}>
          {needsImage && (
            <ResourcePicker
              endpoint={endpoint}
              revision={revision}
              resources={resources}
              kind="image"
              selected={assignment.image}
              disabled={stale}
              onAddResource={onAddResource}
            />
          )}
          {needsVideo && (
            <ResourcePicker
              endpoint={endpoint}
              revision={revision}
              resources={resources}
              kind="video"
              selected={assignment.video?.clip ?? null}
              disabled={stale}
              onAddResource={onAddResource}
            />
          )}
          {needsImage && (
            <RequirementButton
              complete={imageCropReady}
              hasResource={imageSelected}
              mediaKind="image"
              disabled={stale}
              onClick={() => imageSelected && setEditing("image")}
            />
          )}
          {needsVideo && (
            <RequirementButton
              complete={videoCropReady}
              hasResource={videoSelected}
              mediaKind="video"
              disabled={stale}
              onClick={() => videoSelected && setEditing("video")}
            />
          )}
        </div>

        <small className={ready ? contextualStyles.requirementReady : contextualStyles.requirementPending}>
          {ready ? <CheckCircle2 size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}
          {ready ? "RECORTE ADAPTABLE CONFIRMADO" : "RECORTE ADAPTABLE NO CONFIRMADO"}
        </small>
      </article>

      {editing === "image" && assignment.image && (
        <ContextualMediaDialog
          eyebrow="CONTENEDOR DE LA FICHA"
          title="Recorte adaptable de la imagen"
          description="Este destino es independiente del Hero. Sólo se guardan posición y zoom; el archivo físico permanece intacto."
          onClose={() => setEditing(null)}
        >
          <ImageViewportEditor
            slug={slug}
            revision={revision}
            target="detail"
            src={assignment.image}
            label={`Contenedor · ${shortName(assignment.image)}`}
            initialViewport={assignment.imageViewport ?? undefined}
            onClose={() => setEditing(null)}
          />
        </ContextualMediaDialog>
      )}

      {editing === "video" && assignment.video?.clip && (
        <ContextualMediaDialog
          eyebrow="CONTENEDOR DE LA FICHA"
          title="Recorte adaptable del video"
          description="El WebM se reutiliza por referencia. El recorte del Contenedor no altera el video ni los demás destinos."
          onClose={() => setEditing(null)}
        >
          <GameVideoViewportEditor
            slug={slug}
            revision={revision}
            target="detail"
            source="independent"
            clip={assignment.video.clip}
            label={`Contenedor · ${shortName(assignment.video.clip)}`}
            initialViewport={assignment.video.viewport}
            onClose={() => setEditing(null)}
          />
        </ContextualMediaDialog>
      )}
    </>
  );
}
