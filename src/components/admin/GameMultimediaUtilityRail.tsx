"use client";

import {
  CheckCircle2,
  Clapperboard,
  FolderOpen,
  ImageIcon,
  Images,
  Info,
  MonitorPlay,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";

import AdminMediaLibraryPreview from "@/components/admin/AdminMediaLibraryPreview";
import AdminMediaThumbnail from "@/components/admin/AdminMediaThumbnail";
import ContextualMediaDialog from "@/components/admin/ContextualMediaDialog";
import GameMediaUploadForm from "@/components/admin/GameMediaUploadForm";
import GameVideoLibraryEditor from "@/components/admin/GameVideoLibraryEditor";
import {
  useGameMultimediaWorkspace,
} from "@/components/admin/GameMultimediaWorkspaceProvider";
import {
  GAME_MEDIA_MODES_BY_TARGET,
  type GameMediaModeTarget,
} from "@/lib/media/game-media-mode-policy";
import {
  formatMultimediaBytes,
  type MultimediaLibraryResource,
  type MultimediaLibraryState,
  multimediaShortName,
} from "@/components/admin/game-multimedia-library-types";
import type {
  GameDestinationMediaMode,
  GameGalleryItem,
} from "@/types/game";

import railStyles from "./GameMultimediaUtilityRail.module.css";
import shellStyles from "./GameMultimediaShell.module.css";

type Props = {
  slug: string;
};

type AddKind = "image" | "video";
type LibraryFilter = "all" | "active" | "unused";

const EMPTY_RESOURCES: MultimediaLibraryResource[] = [];

function resourceDetail(resource: MultimediaLibraryResource) {
  if (resource.kind === "video") {
    return `Video WebM · ${formatMultimediaBytes(resource.bytes)}`;
  }
  if (resource.width !== null && resource.height !== null) {
    return `${resource.width}×${resource.height} · ${formatMultimediaBytes(resource.bytes)}`;
  }
  return `Imagen · ${formatMultimediaBytes(resource.bytes)}`;
}

function statusLabel(resource: MultimediaLibraryResource) {
  const status = resource.hygiene?.status;
  if (status === "active") return "En uso";
  if (status === "reserved") return "Reserva";
  if (status === "published-only") return "Publicado";
  if (status === "unused") return "Sin uso";
  return "Disponible";
}

function statusTone(resource: MultimediaLibraryResource) {
  if (resource.hygiene?.blocksPublication) return "warning";
  if (
    resource.hygiene?.status === "active" ||
    resource.hygiene?.status === "reserved"
  ) {
    return "ready";
  }
  return "neutral";
}

function isProtectedResource(resource: MultimediaLibraryResource) {
  const status = resource.hygiene?.status;
  return status === "active" ||
    status === "reserved" ||
    status === "published-only";
}

function libraryFilterMatch(
  resource: MultimediaLibraryResource,
  filter: LibraryFilter
) {
  if (filter === "all") return true;
  if (filter === "unused") return resource.hygiene?.blocksPublication === true;
  return isProtectedResource(resource);
}

function mediaModeLabel(mode: GameDestinationMediaMode) {
  if (mode === "hover-video") return "Imagen + hover";
  if (mode === "video") return "Video";
  return "Imagen";
}

function modeLabel(mode: GameDestinationMediaMode | null | undefined) {
  return mode ? mediaModeLabel(mode) : "Global";
}

function modeOptionsLabel(target: GameMediaModeTarget) {
  return GAME_MEDIA_MODES_BY_TARGET[target].map(mediaModeLabel).join(" / ");
}

function firstGalleryItem(state: MultimediaLibraryState | null): GameGalleryItem | null {
  return state?.gallery?.[0] ?? null;
}

export default function GameMultimediaUtilityRail({
  slug,
}: Props) {
  const {
    workspace: state,
    loading,
    error,
    currentRevision,
    stale,
    libraryOpen,
    openLibrary,
    closeLibrary,
  } = useGameMultimediaWorkspace();
  const [helpOpen, setHelpOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [previewResource, setPreviewResource] = useState<MultimediaLibraryResource | null>(null);

  const resources = state?.resources ?? EMPTY_RESOURCES;
  const sortedResources = useMemo(
    () => [...resources].sort((left, right) => {
      const leftBlocking = left.hygiene?.blocksPublication ? 1 : 0;
      const rightBlocking = right.hygiene?.blocksPublication ? 1 : 0;
      if (leftBlocking !== rightBlocking) return rightBlocking - leftBlocking;
      return multimediaShortName(left.src).localeCompare(multimediaShortName(right.src), "es");
    }),
    [resources]
  );
  const images = useMemo(
    () => sortedResources.filter((resource) => resource.kind === "image"),
    [sortedResources]
  );
  const videos = useMemo(
    () => sortedResources.filter((resource) => resource.kind === "video"),
    [sortedResources]
  );
  const filteredImages = useMemo(
    () => images.filter((resource) => libraryFilterMatch(resource, libraryFilter)),
    [images, libraryFilter]
  );
  const filteredVideos = useMemo(
    () => videos.filter((resource) => libraryFilterMatch(resource, libraryFilter)),
    [videos, libraryFilter]
  );
  const previewResources = sortedResources.slice(0, 3);
  const hygiene = state?.hygiene;
  const requirements = state?.requirements;
  const protectedCount =
    (hygiene?.active ?? 0) +
    (hygiene?.reserved ?? 0) +
    (hygiene?.publishedOnly ?? 0);
  const essentialMediaStates = requirements
    ? [
        requirements.cover.cropReady,
        requirements.hero.cropReady,
        requirements.card.cropReady,
        requirements.detail.cropReady,
        requirements.gallery.cropReady,
        ...(requirements.background.active
          ? [requirements.background.cropReady]
          : []),
      ]
    : [];
  const essentialMediaReadyCount =
    essentialMediaStates.filter(Boolean).length;
  const essentialMediaTotal = essentialMediaStates.length;

  function resourceBySrc(src: string | null | undefined) {
    return src
      ? resources.find((resource) => resource.src === src) ?? null
      : null;
  }

  const assignments = state?.assignments;
  const cardClip = assignments?.resolvedCardVideo?.src;
  const galleryLead = firstGalleryItem(state);

  function statusPreview(
    items: Array<{ kind: "image" | "video"; src: string | null | undefined }>
  ) {
    const visible = items
      .map((item) => ({ ...item, resource: resourceBySrc(item.src) }))
      .filter((item) => item.src && item.resource)
      .slice(0, 2);

    if (!visible.length) return null;

    return (
      <span className={railStyles.statusPreviewSet} aria-hidden="true">
        {visible.map((item) => (
          <AdminMediaThumbnail
            key={`${item.kind}:${item.src}`}
            kind={item.kind}
            src={item.src!}
            mode="source"
            label=""
            sizes="46px"
            className={railStyles.statusThumb}
            playIndicator={false}
          />
        ))}
      </span>
    );
  }

  function deleteForm(resource: MultimediaLibraryResource) {
    if (resource.kind === "image" && resource.origin === "bundled") {
      return <span className={shellStyles.libraryBundledBadge}>Base</span>;
    }

    if (resource.hygiene?.status !== "unused") {
      return (
        <span
          className={shellStyles.libraryBundledBadge}
          title={
            resource.hygiene?.status === "published-only"
              ? "Protegido porque lo utiliza la publicación pública actual"
              : "Protegido porque forma parte del borrador"
          }
        >
          Protegido
        </span>
      );
    }

    return (
      <form
        action={`/api/admin/content/games/${encodeURIComponent(slug)}/media-resource-delete`}
        method="post"
        onSubmit={(event) => {
          if (!window.confirm("Este master no está referenciado por el borrador ni por la publicación actual. Se eliminará de la biblioteca y del almacenamiento. ¿Continuar?")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="expectedRevision" value={currentRevision} />
        <input
          type="hidden"
          name="target"
          value={resource.kind === "image" ? "image-delete" : "video-delete"}
        />
        <input type="hidden" name="resource" value={resource.src} />
        <button
          type="submit"
          className={shellStyles.libraryDeleteButton}
          disabled={stale}
          aria-label={`Eliminar ${multimediaShortName(resource.src)} de la biblioteca`}
          title="Eliminar master sin uso"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </form>
    );
  }

  function renderLibraryGroup(
    title: string,
    kind: "image" | "video",
    group: MultimediaLibraryResource[]
  ) {
    return (
      <section className={shellStyles.libraryDialogGroup}>
        <div className={shellStyles.libraryDialogHeading}>
          <div>
            {kind === "image" ? <ImageIcon size={17} aria-hidden="true" /> : <Clapperboard size={17} aria-hidden="true" />}
            <strong>{title}</strong>
          </div>
          <span>{group.length} recurso{group.length === 1 ? "" : "s"}</span>
        </div>
        {group.length ? (
          <div className={shellStyles.libraryDialogGrid}>
            {group.map((resource) => (
              <article
                key={`${resource.kind}:${resource.src}`}
                className={`${shellStyles.libraryResourceCard} ${railStyles.hygieneResource}`}
                data-hygiene={statusTone(resource)}
              >
                <div className={shellStyles.libraryArtworkWrap}>
                  <button
                    type="button"
                    className={shellStyles.libraryArtworkButton}
                    onClick={() => setPreviewResource(resource)}
                    aria-label={`Abrir vista grande de ${multimediaShortName(resource.src)}`}
                  >
                    <AdminMediaThumbnail
                      kind={resource.kind}
                      src={resource.src}
                      mode="source"
                      label={multimediaShortName(resource.src)}
                      sizes="220px"
                      playIndicator={resource.kind === "video"}
                    />
                  </button>
                  {deleteForm(resource)}
                </div>
                <div className={shellStyles.libraryResourceMeta}>
                  <strong title={resource.src}>{multimediaShortName(resource.src)}</strong>
                  <small>{resourceDetail(resource)}</small>
                </div>
                <div className={railStyles.libraryUsageRow}>
                  <span data-tone={statusTone(resource)}>{statusLabel(resource)}</span>
                  {(resource.hygiene?.usage ?? []).map((usage) => (
                    <span key={usage}>{usage}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={shellStyles.libraryEmptyGroup}>
            {libraryFilter === "all"
              ? `No hay ${kind === "image" ? "imágenes" : "videos"} guardados todavía.`
              : "No hay recursos que coincidan con este filtro."}
          </div>
        )}
      </section>
    );
  }

  return (
    <aside className={shellStyles.utilityRail} aria-label="Herramientas multimedia">
      <section className={shellStyles.utilityCard}>
        <div className={shellStyles.utilityHeading}>
          <div>
            <span className={shellStyles.utilityIcon}><FolderOpen size={17} aria-hidden="true" /></span>
            <div>
              <strong>Biblioteca multimedia</strong>
              <small>Masters reutilizables</small>
            </div>
          </div>
          <span className={shellStyles.libraryTotal}>{resources.length}</span>
        </div>

        {loading ? (
          <div className={shellStyles.utilityStatus}>Cargando recursos…</div>
        ) : error ? (
          <div className={shellStyles.utilityStatus} role="alert">{error}</div>
        ) : (
          <>
            <div className={shellStyles.libraryCounts}>
              <span><ImageIcon size={14} aria-hidden="true" />{images.length} imágenes</span>
              <span><Clapperboard size={14} aria-hidden="true" />{videos.length} videos</span>
            </div>

            <div
              className={hygiene?.ready ? railStyles.libraryHygieneReady : railStyles.libraryHygieneWarning}
              role={hygiene?.ready ? "status" : "alert"}
            >
              {hygiene?.ready
                ? <CheckCircle2 size={15} aria-hidden="true" />
                : <TriangleAlert size={15} aria-hidden="true" />}
              <span>
                {hygiene?.ready
                  ? "Sin masters editoriales huérfanos"
                  : `${hygiene?.blockingCount ?? 0} master${hygiene?.blockingCount === 1 ? "" : "s"} sin referencia por asignar o eliminar antes de publicar`}
              </span>
            </div>

            {previewResources.length ? (
              <div className={shellStyles.libraryMiniGrid}>
                {previewResources.map((resource) => (
                  <button
                    key={`${resource.kind}:${resource.src}`}
                    type="button"
                    className={`${shellStyles.libraryMiniButton} ${railStyles.hygieneResource}`}
                    data-hygiene={statusTone(resource)}
                    onClick={() => setPreviewResource(resource)}
                    title={`${multimediaShortName(resource.src)} · ${statusLabel(resource)}`}
                  >
                    <AdminMediaThumbnail
                      kind={resource.kind}
                      src={resource.src}
                      mode="source"
                      label={multimediaShortName(resource.src)}
                      sizes="88px"
                      playIndicator={resource.kind === "video"}
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className={shellStyles.utilityEmpty}>
                <Images size={22} aria-hidden="true" />
                <span>La biblioteca todavía está vacía.</span>
              </div>
            )}
          </>
        )}

        <div className={shellStyles.utilityActions}>
          <button type="button" className={shellStyles.brandAction} onClick={() => openLibrary()} disabled={loading || Boolean(error)}>
            <FolderOpen size={16} aria-hidden="true" />
            Abrir biblioteca
          </button>
          <button type="button" className={shellStyles.secondaryAction} onClick={() => setAddKind("image")} disabled={stale}>
            <Plus size={16} aria-hidden="true" />
            Agregar recurso
          </button>
        </div>
      </section>

      <section className={shellStyles.utilityCard}>
        <div className={railStyles.statusCardHeading}>
          <div>
            <span className={shellStyles.utilityIcon}><CheckCircle2 size={17} aria-hidden="true" /></span>
            <div>
              <strong>Estado multimedia</strong>
              <small>Destinos esenciales activos</small>
            </div>
          </div>
          <strong className={requirements?.ready ? railStyles.statusScoreReady : railStyles.statusScorePending}>
            {requirements ? `${essentialMediaReadyCount}/${essentialMediaTotal}` : "—"}
          </strong>
        </div>

        {requirements ? (
          <div className={railStyles.statusRows}>
            <div data-ready={requirements.cover.cropReady}>
              {statusPreview([
                { kind: "image", src: assignments?.coverImage },
              ])}
              <span><strong>Portada · 4:5</strong><small>Imagen</small></span>
              {requirements.cover.cropReady ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
            </div>
            <div data-ready={requirements.hero.cropReady}>
              {statusPreview([
                { kind: "image", src: assignments?.heroMode !== "video" ? assignments?.heroImage : null },
                { kind: "video", src: assignments?.heroMode !== "image" ? assignments?.heroVideo?.clip : null },
              ])}
              <span><strong>Hero · 3:1</strong><small>{modeLabel(assignments?.heroMode)}</small></span>
              {requirements.hero.cropReady ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
            </div>
            <div data-ready={requirements.card.cropReady}>
              {statusPreview([
                { kind: "image", src: assignments?.cardImage },
                { kind: "video", src: assignments?.cardMode !== "image" ? cardClip : null },
              ])}
              <span><strong>Card · 3:2</strong><small>{modeLabel(assignments?.cardMode)}</small></span>
              {requirements.card.cropReady ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
            </div>
            <div data-ready={requirements.detail.cropReady}>
              {statusPreview([
                { kind: "image", src: assignments?.detailMode !== "video" ? assignments?.detailImage : null },
                { kind: "video", src: assignments?.detailMode !== "image" ? assignments?.detailVideo?.clip : null },
              ])}
              <span><strong>Contenedor</strong><small>{modeLabel(assignments?.detailMode)} · adaptable</small></span>
              {requirements.detail.cropReady ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
            </div>
            <div data-ready={requirements.gallery.cropReady}>
              {galleryLead ? statusPreview([{ kind: galleryLead.kind, src: galleryLead.src }]) : null}
              <span><strong>Galería · {requirements.gallery.count}/8</strong><small>{requirements.gallery.imageCount} img · {requirements.gallery.videoCount} video</small></span>
              {requirements.gallery.cropReady ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
            </div>
            <div
              data-ready={!requirements.background.active || requirements.background.cropReady}
              data-optional={requirements.background.active ? undefined : "true"}
            >
              <span className={railStyles.statusOptionalIcon}><Sparkles size={15} aria-hidden="true" /></span>
              <span><strong>Fondo</strong><small>{requirements.background.active ? `${modeLabel(assignments?.backgroundMode)} · esencial activo` : "Global · opcional"}</small></span>
              {!requirements.background.active || requirements.background.cropReady ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
            </div>
          </div>
        ) : (
          <div className={shellStyles.utilityStatus}>Cargando estado…</div>
        )}

        <button type="button" className={shellStyles.secondaryAction} onClick={() => setHelpOpen(true)}>
          <Info size={16} aria-hidden="true" />
          Ver requisitos multimedia
        </button>
      </section>

      {stale && (
        <div className={shellStyles.utilityStale} role="alert">
          Esta página quedó detrás de la revisión multimedia actual. Recarga antes de editar.
        </div>
      )}

      {libraryOpen && (
        <ContextualMediaDialog
          eyebrow="BIBLIOTECA MULTIMEDIA"
          title="Biblioteca multimedia compartida"
          description="Administra masters reutilizables. Los recursos que sostienen el borrador o la publicación actual se conservan protegidos."
          onClose={() => closeLibrary()}
        >
          <div className={shellStyles.libraryDialogTopbar}>
            <div>
              <strong>{resources.length} recursos</strong>
              <span>{images.length} imágenes · {videos.length} videos</span>
            </div>
            <button type="button" className={shellStyles.brandAction} onClick={() => setAddKind("image")} disabled={stale}>
              <Upload size={16} aria-hidden="true" />
              Agregar nuevo recurso
            </button>
          </div>

          <div className={railStyles.libraryFilters} role="group" aria-label="Filtrar biblioteca">
            <button type="button" data-active={libraryFilter === "all"} onClick={() => setLibraryFilter("all")}>Todos · {resources.length}</button>
            <button type="button" data-active={libraryFilter === "active"} onClick={() => setLibraryFilter("active")}>Referenciados · {protectedCount}</button>
            <button type="button" data-active={libraryFilter === "unused"} onClick={() => setLibraryFilter("unused")}>Por resolver · {hygiene?.blockingCount ?? 0}</button>
          </div>

          {!hygiene?.ready && (
            <div className={railStyles.libraryDialogWarning} role="alert">
              <TriangleAlert size={17} aria-hidden="true" />
              <div>
                <strong>La publicación quedará bloqueada mientras existan masters editoriales realmente huérfanos.</strong>
                <span>Asígnalos a un destino o Galería, o elimínalos. Los masters necesarios para la publicación actual o para un snapshot histórico restaurable se identifican como protegidos y no se tratan como basura.</span>
              </div>
            </div>
          )}

          <div className={shellStyles.libraryDialogGroups}>
            {renderLibraryGroup("IMÁGENES", "image", filteredImages)}
            {renderLibraryGroup("VIDEOS", "video", filteredVideos)}
          </div>
        </ContextualMediaDialog>
      )}

      {helpOpen && (
        <ContextualMediaDialog
          eyebrow="AYUDA MULTIMEDIA"
          title="Reglas de los destinos"
          description="Consulta estas reglas cuando las necesites; el área principal queda reservada para el trabajo editorial."
          onClose={() => setHelpOpen(false)}
        >
          <div className={shellStyles.helpRules}>
            <div><ImageIcon size={18} aria-hidden="true" /><p><strong>Portada · 4:5</strong><span>Sólo imagen. Selecciona un recurso y confirma su único recorte 4:5.</span></p></div>
            <div><MonitorPlay size={18} aria-hidden="true" /><p><strong>Hero · 3:1</strong><span>Modos disponibles: {modeOptionsLabel("hero")}. Imagen + hover exige ambos recursos y sus recortes.</span></p></div>
            <div><Clapperboard size={18} aria-hidden="true" /><p><strong>Card · 3:2</strong><span>La imagen base 3:2 es obligatoria. Modos disponibles: {modeOptionsLabel("card")}. Video agrega un WebM con recorte 3:2 propio.</span></p></div>
            <div><Sparkles size={18} aria-hidden="true" /><p><strong>Fondo · adaptable</strong><span>Es opcional mientras usa el fondo global. Al activar un Fondo propio pasa a ser un destino esencial para publicar. Modos disponibles: {modeOptionsLabel("background")}.</span></p></div>
            <div><MonitorPlay size={18} aria-hidden="true" /><p><strong>Contenedor · adaptable</strong><span>Es obligatorio e independiente del Hero. Modos disponibles: {modeOptionsLabel("detail")}; adapta foco y zoom al tamaño real de la ficha.</span></p></div>
            <div><Images size={18} aria-hidden="true" /><p><strong>Galería · mínimo 1 recurso</strong><span>Admite hasta 8 imágenes y videos combinados. Cada elemento confirma su propio recorte y conserva su orden editorial.</span></p></div>
            <div><CheckCircle2 size={18} aria-hidden="true" /><p><strong>Higiene de masters</strong><span>Sólo un master editorial sin referencia en el borrador ni en la publicación actual es un archivo huérfano. Los demás aparecen protegidos y no pueden eliminarse desde Biblioteca.</span></p></div>
          </div>
        </ContextualMediaDialog>
      )}

      {addKind && (
        <ContextualMediaDialog
          eyebrow="BIBLIOTECA COMPARTIDA"
          title="Agregar nuevo recurso"
          description="Crea o importa el master una sola vez. Después asígnalo a un destino o a Galería antes de publicar."
          onClose={() => setAddKind(null)}
        >
          <div className={shellStyles.addTabs} role="group" aria-label="Tipo de recurso">
            <button type="button" data-active={addKind === "image"} onClick={() => setAddKind("image")}>
              <ImageIcon size={16} aria-hidden="true" /> Imagen
            </button>
            <button type="button" data-active={addKind === "video"} onClick={() => setAddKind("video")}>
              <Clapperboard size={16} aria-hidden="true" /> Video
            </button>
          </div>
          {addKind === "image" ? (
            <div className={shellStyles.addResourceBody}>
              <p>El WebP queda guardado por hash. Si no lo asignas y ningún snapshot lo necesita, Biblioteca lo marcará como pendiente y Publicación no permitirá dejarlo como archivo huérfano.</p>
              <GameMediaUploadForm
                slug={slug}
                revision={currentRevision}

              />
            </div>
          ) : (
            <div className={shellStyles.addResourceBody}>
              <p>El WebM editorial se crea como master reutilizable. Los recortes de cada destino se guardan después como metadata y el master debe quedar asignado antes de publicar si ningún snapshot existente lo protege.</p>
              <GameVideoLibraryEditor slug={slug} revision={currentRevision} />
            </div>
          )}
        </ContextualMediaDialog>
      )}

      {previewResource && (
        <AdminMediaLibraryPreview
          kind={previewResource.kind}
          src={previewResource.src}
          name={multimediaShortName(previewResource.src)}
          details={resourceDetail(previewResource)}
          usage={previewResource.hygiene?.usage ?? []}
          onClose={() => setPreviewResource(null)}
        />
      )}
    </aside>
  );
}
