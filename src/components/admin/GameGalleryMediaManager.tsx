"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clapperboard,
  ImageIcon,
  Images,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

import AdminMediaThumbnail from "@/components/admin/AdminMediaThumbnail";
import ContextualMediaDialog from "@/components/admin/ContextualMediaDialog";
import GameGalleryVideoViewportEditor from "@/components/admin/GameGalleryVideoViewportEditor";
import GameMediaUploadForm from "@/components/admin/GameMediaUploadForm";
import GameVideoLibraryEditor from "@/components/admin/GameVideoLibraryEditor";
import ImageViewportEditor from "@/components/admin/ImageViewportEditor";
import {
  type MultimediaLibraryResource,
  type MultimediaLibraryState,
  multimediaShortName,
} from "@/components/admin/game-multimedia-library-types";
import {
  useGameMultimediaWorkspace,
} from "@/components/admin/GameMultimediaWorkspaceProvider";
import {
  MAX_GAME_GALLERY_ITEMS,
} from "@/lib/media/game-gallery-media";
import {
  gameImageCropAspectLabel,
  resolveGameImageCropAspectRatio,
} from "@/lib/media/image-viewport";
import type {
  GameGalleryItem,
  GameVideoViewport,
} from "@/types/game";

import galleryStyles from "./GameGalleryMediaManager.module.css";
import shellStyles from "./GameMultimediaShell.module.css";

type Props = {
  slug: string;
};

type PickerKind = "image" | "video";

const EMPTY_GALLERY: GameGalleryItem[] = [];
const EMPTY_RESOURCES: MultimediaLibraryResource[] = [];

function videoAspectRatio(viewport: GameVideoViewport) {
  if (viewport.aspect === "16:9") return 16 / 9;
  if (viewport.aspect === "3:2") return 3 / 2;
  if (viewport.aspect === "1:1") return 1;
  if (viewport.aspect === "4:5") return 4 / 5;
  if (viewport.aspect === "9:16") return 9 / 16;
  return undefined;
}

function videoCropLabel(viewport: GameVideoViewport) {
  return viewport.aspect === "source" ? "Original" : viewport.aspect;
}

function missingRequirementMessage(
  requirements: NonNullable<MultimediaLibraryState["requirements"]>
) {
  const missing: string[] = [];
  if (!requirements.cover.cropReady) missing.push("Portada 4:5");
  if (!requirements.hero.cropReady) missing.push("Hero 3:1");
  if (!requirements.card.cropReady) missing.push("Card 3:2");
  if (!requirements.detail.cropReady) missing.push("Contenedor adaptable");
  if (requirements.background.active && !requirements.background.cropReady) {
    missing.push("Fondo adaptable");
  }
  if (!requirements.gallery.cropReady) missing.push("Galería");

  if (missing.length === 0) return "Revisa los destinos multimedia pendientes.";
  if (missing.length === 1) return `Falta completar ${missing[0]}.`;
  return `Falta completar: ${missing.join(", ")}.`;
}

function ResourceIcon({ kind }: { kind: PickerKind }) {
  return kind === "image"
    ? <ImageIcon size={16} aria-hidden="true" />
    : <Clapperboard size={16} aria-hidden="true" />;
}

export default function GameGalleryMediaManager({ slug }: Props) {
  const {
    workspace,
    loading,
    error,
    currentRevision,
    stale,
  } = useGameMultimediaWorkspace();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<PickerKind>("image");
  const [addResourceKind, setAddResourceKind] = useState<PickerKind | null>(null);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [editingVideo, setEditingVideo] = useState<Extract<GameGalleryItem, { kind: "video" }> | null>(null);

  const gallery = workspace?.gallery ?? EMPTY_GALLERY;
  const resources = workspace?.resources ?? EMPTY_RESOURCES;
  const imageMedia = workspace?.assignments.imageMedia ?? null;
  const requirements = workspace?.requirements;
  const assignedKeys = useMemo(
    () => new Set(gallery.map((item) => `${item.kind}:${item.src}`)),
    [gallery]
  );
  const pickerResources = resources.filter(
    (resource): resource is MultimediaLibraryResource =>
      resource.kind === pickerKind &&
      !assignedKeys.has(`${resource.kind}:${resource.src}`)
  );
  const pendingCount = gallery.filter((item) =>
    item.kind === "image"
      ? imageMedia?.gallery?.[item.src]?.confirmed !== true
      : item.viewport.confirmed !== true
  ).length;

  function assignmentForm(
    operation: "gallery-add" | "gallery-remove" | "gallery-move",
    kind: PickerKind,
    resource: string,
    direction?: "up" | "down"
  ) {
    return (
      <form
        action={`/api/admin/content/games/${encodeURIComponent(slug)}/gallery-media`}
        method="post"
      >
        <input type="hidden" name="expectedRevision" value={currentRevision} />
        <input type="hidden" name="target" value={operation} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="resource" value={resource} />
        {direction && <input type="hidden" name="direction" value={direction} />}
        {operation === "gallery-add" ? (
          <button type="submit" className={shellStyles.galleryPickerChoice} disabled={stale}>
            <span className={shellStyles.galleryPickerThumb}>
              <AdminMediaThumbnail
                kind={kind}
                src={resource}
                mode="source"
                label={`Recurso ${multimediaShortName(resource)}`}
                sizes="88px"
                playIndicator={kind === "video"}
              />
            </span>
            <span>
              <strong>{multimediaShortName(resource)}</strong>
              <small>{kind === "image" ? "Imagen" : "Video WebM"}</small>
            </span>
            <Plus size={16} aria-hidden="true" />
          </button>
        ) : operation === "gallery-remove" ? (
          <button type="submit" className={shellStyles.galleryDangerButton} disabled={stale}>
            <Trash2 size={15} aria-hidden="true" />
            Quitar
          </button>
        ) : (
          <button
            type="submit"
            className={shellStyles.galleryIconButton}
            disabled={stale}
            aria-label={direction === "up" ? "Mover antes" : "Mover después"}
            title={direction === "up" ? "Mover antes" : "Mover después"}
          >
            {direction === "up"
              ? <ArrowUp size={15} aria-hidden="true" />
              : <ArrowDown size={15} aria-hidden="true" />}
          </button>
        )}
      </form>
    );
  }

  function openNewResource(kind: PickerKind) {
    setPickerOpen(false);
    setAddResourceKind(kind);
  }

  return (
    <section id="gallery-minimum" className={shellStyles.galleryPanel} aria-labelledby="professional-gallery-heading">
      <div className={shellStyles.galleryHeading}>
        <div>
          <span className={shellStyles.eyebrow}>GALERÍA MULTIMEDIA</span>
          <h2 id="professional-gallery-heading">Galería del juego</h2>
          <p>Imágenes y videos comparten un orden editorial. Cada elemento conserva su recorte sin duplicar ni modificar el master.</p>
        </div>
        <div className={galleryStyles.galleryHeadingActions}>
          <div className={shellStyles.galleryCount} aria-label={`${gallery.length} de ${MAX_GAME_GALLERY_ITEMS} elementos`}>
            <strong>{gallery.length}</strong>
            <span>/ {MAX_GAME_GALLERY_ITEMS}</span>
          </div>
          <button
            type="button"
            className={shellStyles.brandAction}
            disabled={stale || gallery.length >= MAX_GAME_GALLERY_ITEMS}
            onClick={() => setPickerOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Agregar a galería
          </button>
        </div>
      </div>

      {loading ? (
        <div className={shellStyles.galleryMessage} role="status">Cargando Galería multimedia…</div>
      ) : error ? (
        <div className={shellStyles.galleryMessage} role="alert">{error}</div>
      ) : (
        <>
          {stale && (
            <div className={shellStyles.galleryWarning} role="alert">
              <TriangleAlert size={17} aria-hidden="true" />
              <span>La revisión cambió desde que se abrió la página. Recarga antes de modificar Galería.</span>
            </div>
          )}

          <div className={shellStyles.galleryStats}>
            <span><ImageIcon size={15} aria-hidden="true" />{requirements?.gallery.imageCount ?? 0} imágenes</span>
            <span><Clapperboard size={15} aria-hidden="true" />{requirements?.gallery.videoCount ?? 0} videos</span>
            <span className={pendingCount ? shellStyles.galleryPendingStat : shellStyles.galleryReadyStat}>
              {pendingCount ? <TriangleAlert size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
              {pendingCount ? `${pendingCount} recorte${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"}` : "Recortes listos"}
            </span>
          </div>

          {gallery.length === 0 ? (
            <div className={shellStyles.galleryEmpty}>
              <Images size={27} aria-hidden="true" />
              <strong>Agrega al menos un recurso</strong>
              <span>Puede ser una imagen o un video WebM de la biblioteca compartida.</span>
              <button type="button" className={shellStyles.brandAction} onClick={() => setPickerOpen(true)} disabled={stale}>
                <Plus size={16} aria-hidden="true" />
                Elegir recurso
              </button>
            </div>
          ) : (
            <div className={shellStyles.galleryList}>
              {gallery.map((item, index) => {
                const imageViewport = item.kind === "image"
                  ? imageMedia?.gallery?.[item.src]
                  : undefined;
                const confirmed = item.kind === "image"
                  ? imageViewport?.confirmed === true
                  : item.viewport.confirmed === true;
                const cropLabel = item.kind === "image"
                  ? gameImageCropAspectLabel(imageViewport)
                  : videoCropLabel(item.viewport);

                return (
                  <article
                    key={`${item.kind}:${item.src}`}
                    className={`${shellStyles.galleryItem} ${confirmed ? shellStyles.galleryItemReady : shellStyles.galleryItemPending}`}
                  >
                    <span className={shellStyles.galleryItemOrder}>{index + 1}</span>
                    <div className={shellStyles.galleryItemPreview}>
                      {item.kind === "image" ? (
                        <AdminMediaThumbnail
                          kind="image"
                          src={item.src}
                          viewport={imageViewport}
                          mode="destination"
                          frameAspect={resolveGameImageCropAspectRatio(imageViewport)}
                          label={`Galería · ${multimediaShortName(item.src)}`}
                          sizes="120px"
                        />
                      ) : (
                        <AdminMediaThumbnail
                          kind="video"
                          src={item.src}
                          viewport={item.viewport}
                          mode="destination"
                          frameAspect={videoAspectRatio(item.viewport)}
                          label={`Video de Galería · ${multimediaShortName(item.src)}`}
                          sizes="120px"
                          playIndicator
                        />
                      )}
                    </div>
                    <div className={shellStyles.galleryItemMeta}>
                      <div className={shellStyles.galleryItemTitleRow}>
                        <ResourceIcon kind={item.kind} />
                        <strong title={item.src}>{multimediaShortName(item.src)}</strong>
                      </div>
                      <small>{item.kind === "image" ? "Imagen" : "Video WebM"} · {cropLabel}</small>
                      <span className={confirmed ? shellStyles.galleryCropReady : shellStyles.galleryCropPending}>
                        {confirmed ? <CheckCircle2 size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
                        {confirmed ? `Recorte ${cropLabel} confirmado` : "Recorte pendiente de confirmar"}
                      </span>
                    </div>
                    <div className={shellStyles.galleryItemActions}>
                      {gallery.length > 1 && (
                        <div className={shellStyles.galleryOrderActions}>
                          {index > 0 && assignmentForm("gallery-move", item.kind, item.src, "up")}
                          {index < gallery.length - 1 && assignmentForm("gallery-move", item.kind, item.src, "down")}
                        </div>
                      )}
                      <button
                        type="button"
                        className={shellStyles.galleryEditButton}
                        disabled={stale}
                        onClick={() => {
                          if (item.kind === "image") setEditingImage(item.src);
                          else setEditingVideo(item);
                        }}
                      >
                        <Pencil size={15} aria-hidden="true" />
                        {confirmed ? "Editar recorte" : "Confirmar recorte"}
                      </button>
                      {assignmentForm("gallery-remove", item.kind, item.src)}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {pendingCount > 0 && gallery.length > 0 && (
            <div className={shellStyles.galleryPendingNotice}>
              <TriangleAlert size={17} aria-hidden="true" />
              <span>Hay {pendingCount} recorte{pendingCount === 1 ? "" : "s"} pendiente{pendingCount === 1 ? "" : "s"}. Usa “Confirmar recorte” en el recurso correspondiente.</span>
            </div>
          )}

          {requirements && (
            <div className={shellStyles.continueGate}>
              <div>
                <strong>{requirements.ready ? "Multimedia completa" : "No puedes avanzar todavía"}</strong>
                <span>{requirements.ready ? "Todos los destinos obligatorios y la Galería están listos." : missingRequirementMessage(requirements)}</span>
              </div>
              {requirements.ready ? (
                <Link href={`/admin/juegos/${encodeURIComponent(slug)}?seccion=descargas`} className={shellStyles.continueButton}>
                  Continuar a Descargas
                </Link>
              ) : (
                <button type="button" className={shellStyles.continueButton} disabled>Continuar a Descargas</button>
              )}
            </div>
          )}
        </>
      )}

      {pickerOpen && (
        <ContextualMediaDialog
          eyebrow="GALERÍA MULTIMEDIA"
          title="Agregar a galería"
          description={`Elige una imagen o video existente. Galería admite hasta ${MAX_GAME_GALLERY_ITEMS} elementos totales y conserva el orden editorial.`}
          onClose={() => setPickerOpen(false)}
        >
          <div className={shellStyles.pickerTabs} role="group" aria-label="Tipo de recurso">
            <button type="button" data-active={pickerKind === "image"} onClick={() => setPickerKind("image")}>
              <ImageIcon size={16} aria-hidden="true" /> Imágenes
            </button>
            <button type="button" data-active={pickerKind === "video"} onClick={() => setPickerKind("video")}>
              <Clapperboard size={16} aria-hidden="true" /> Videos
            </button>
          </div>
          {pickerResources.length ? (
            <div className={shellStyles.galleryPickerGrid}>
              {pickerResources.map((resource) => (
                <div key={`${resource.kind}:${resource.src}`}>
                  {assignmentForm("gallery-add", resource.kind, resource.src)}
                </div>
              ))}
            </div>
          ) : (
            <div className={shellStyles.galleryMessage}>
              No hay {pickerKind === "image" ? "imágenes" : "videos"} disponibles sin asignar.
            </div>
          )}
          <div className={galleryStyles.galleryPickerCreateActions}>
            <button type="button" className={shellStyles.secondaryAction} onClick={() => openNewResource("image")} disabled={stale}>
              <ImageIcon size={16} aria-hidden="true" />
              Agregar imagen nueva
            </button>
            <button type="button" className={shellStyles.secondaryAction} onClick={() => openNewResource("video")} disabled={stale}>
              <Clapperboard size={16} aria-hidden="true" />
              Agregar video nuevo
            </button>
          </div>
        </ContextualMediaDialog>
      )}

      {addResourceKind && (
        <ContextualMediaDialog
          eyebrow="GALERÍA · NUEVO MASTER"
          title={addResourceKind === "image" ? "Agregar imagen nueva" : "Agregar video nuevo"}
          description="El recurso se guarda primero como master reutilizable. Después vuelve a Galería para asignarlo y confirmar su recorte."
          onClose={() => setAddResourceKind(null)}
        >
          {addResourceKind === "image" ? (
            <GameMediaUploadForm
              slug={slug}
              revision={currentRevision}

            />
          ) : (
            <GameVideoLibraryEditor
              slug={slug}
              revision={currentRevision}
            />
          )}
        </ContextualMediaDialog>
      )}

      {editingImage && (
        <ContextualMediaDialog
          eyebrow="EDITAR GALERÍA"
          title="Recorte de la imagen"
          description="Elige 16:9, 3:2, 1:1, 4:5, 9:16 o Libre. El archivo original permanece intacto y reutilizable."
          onClose={() => setEditingImage(null)}
        >
          <ImageViewportEditor
            slug={slug}
            revision={currentRevision}
            target="gallery"
            src={editingImage}
            resource={editingImage}
            label={`Galería · ${multimediaShortName(editingImage)}`}
            initialViewport={imageMedia?.gallery?.[editingImage]}
            onClose={() => setEditingImage(null)}
          />
        </ContextualMediaDialog>
      )}

      {editingVideo && (
        <ContextualMediaDialog
          eyebrow="EDITAR GALERÍA"
          title="Recorte del video"
          description="Elige Original o una relación fija. El WebM master no se recodifica: sólo guardamos el encuadre de presentación."
          onClose={() => setEditingVideo(null)}
        >
          <GameGalleryVideoViewportEditor
            slug={slug}
            revision={currentRevision}
            clip={editingVideo.src}
            label={`Galería · ${multimediaShortName(editingVideo.src)}`}
            initialViewport={editingVideo.viewport}
            onClose={() => setEditingVideo(null)}
          />
        </ContextualMediaDialog>
      )}
    </section>
  );
}
