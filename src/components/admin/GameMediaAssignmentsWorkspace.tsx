"use client";

import {
  CheckCircle2,
  Clapperboard,
  ImageIcon,
  Info,
  MonitorPlay,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import AdminMediaThumbnail from "@/components/admin/AdminMediaThumbnail";
import ContextualMediaDialog from "@/components/admin/ContextualMediaDialog";
import GameBackgroundMediaEditor from "@/components/admin/GameBackgroundMediaEditor";
import GameDetailMediaEditor from "@/components/admin/GameDetailMediaEditor";
import GameVideoViewportEditor from "@/components/admin/GameVideoViewportEditor";
import ImageViewportEditor from "@/components/admin/ImageViewportEditor";
import {
  type MultimediaLibraryResource,
  type MultimediaLibraryState,
  multimediaShortName,
} from "@/components/admin/game-multimedia-library-types";
import {
  isImageCropConfirmed,
  isVideoCropConfirmed,
  LEGACY_DESTINATION_IMAGE_ASPECTS,
  REQUIRED_DESTINATION_ASPECTS,
} from "@/lib/media/game-media-requirements";
import type {
  GameCardVideo,
  GameCoverArtworkSource,
  GameDestinationMediaMode,
  GameVideoViewport,
} from "@/types/game";

import styles from "./GameMediaAssignmentsWorkspace.module.css";

const EMPTY_RESOURCES: MultimediaLibraryResource[] = [];
const MODES: Array<{ value: GameDestinationMediaMode; label: string }> = [
  { value: "image", label: "Imagen" },
  { value: "video", label: "Video" },
  { value: "hover-video", label: "Imagen + hover" },
];

const COVER_SOURCES: Array<{ value: GameCoverArtworkSource; label: string }> = [
  { value: "card", label: "Misma imagen que Card" },
  { value: "custom", label: "Imagen diferente" },
];

type Props = { slug: string; revision: number };
type FixedTarget = "cover" | "hero" | "card";
type EditState = { target: FixedTarget; kind: "image" | "video" } | null;

type PickerTarget =
  | "cover-image"
  | "hero-image"
  | "hero-video"
  | "card-image"
  | "card-video";

type CardModeCopy = {
  heading: string;
  summaryEyebrow: string;
  summaryDetail: (image: string | null, video: string | null) => string;
  imageRole: string;
  imageHelp: string;
  imagePickerLabel: string;
  videoRole: string | null;
  videoHelp: string | null;
  readyLabel: string;
};

function cardVideoClip(
  card: GameCardVideo | null | undefined,
  heroClip: string | null | undefined,
  legacyClip: string | null | undefined
) {
  if (card?.source === "hero") return heroClip ?? null;
  if (card?.source === "independent") return card.clip;
  return legacyClip ?? null;
}

function cardVideoViewport(card: GameCardVideo | null | undefined): GameVideoViewport | undefined {
  return card?.viewport;
}

function modeLabel(mode: GameDestinationMediaMode) {
  if (mode === "hover-video") return "Imagen + hover";
  return mode === "video" ? "Video" : "Imagen";
}

function cardModeCopy(mode: GameDestinationMediaMode): CardModeCopy {
  if (mode === "video") {
    return {
      heading: "Video principal + imagen de respaldo obligatoria.",
      summaryEyebrow: "Medio principal",
      summaryDetail: (_image, video) => video
        ? `${multimediaShortName(video)} · reproducción principal`
        : "Video principal pendiente",
      imageRole: "Imagen de respaldo obligatoria",
      imageHelp: "No compite con el video: aparece durante carga, errores, reduced motion y estados donde el video no debe reproducirse.",
      imagePickerLabel: "Imagen de respaldo 3:2",
      videoRole: "Video principal",
      videoHelp: "Es el medio que se reproduce cuando la Card permite movimiento y el recurso está disponible.",
      readyLabel: "CARD LISTA · VIDEO 3:2 + RESPALDO",
    };
  }

  if (mode === "hover-video") {
    return {
      heading: "Imagen inicial + video inmediato al hover o foco.",
      summaryEyebrow: "Estado inicial",
      summaryDetail: (image, video) => {
        const imageName = image ? multimediaShortName(image) : "imagen pendiente";
        const videoName = video ? multimediaShortName(video) : "video pendiente";
        return `${imageName} → hover: ${videoName}`;
      },
      imageRole: "Imagen inicial",
      imageHelp: "Se muestra en reposo y también funciona como fallback si el video no puede reproducirse.",
      imagePickerLabel: "Imagen inicial 3:2",
      videoRole: "Video al interactuar",
      videoHelp: "Entra sin demora artificial al hover o foco y vuelve a imagen al salir.",
      readyLabel: "CARD LISTA · IMAGEN + HOVER",
    };
  }

  return {
    heading: "Imagen 3:2 como medio principal.",
    summaryEyebrow: "Medio principal",
    summaryDetail: (image) => image
      ? `${multimediaShortName(image)} · imagen principal`
      : "Imagen principal pendiente",
    imageRole: "Imagen principal",
    imageHelp: "Es el medio permanente de la vista informativa; no se monta ningún video.",
    imagePickerLabel: "Imagen principal 3:2",
    videoRole: null,
    videoHelp: null,
    readyLabel: "CARD LISTA · IMAGEN 3:2",
  };
}

function needsImage(mode: GameDestinationMediaMode) {
  return mode !== "video";
}

function needsVideo(mode: GameDestinationMediaMode) {
  return mode !== "image";
}

function RequirementLine({ ready, text }: { ready: boolean; text: string }) {
  return (
    <div className={styles.readyLine} data-ready={ready ? "true" : "false"}>
      {ready ? <CheckCircle2 size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
      {text}
    </div>
  );
}

function ResourcePicker({
  slug,
  revision,
  target,
  kind,
  resources,
  selected,
  disabled,
  label,
}: {
  slug: string;
  revision: number;
  target: PickerTarget;
  kind: "image" | "video";
  resources: MultimediaLibraryResource[];
  selected: string | null;
  disabled: boolean;
  label: string;
}) {
  const available = resources.filter((resource) => resource.kind === kind);
  const ready = Boolean(selected);

  return (
    <details className={styles.picker}>
      <summary data-ready={ready ? "true" : "false"}>
        {ready
          ? <CheckCircle2 size={15} aria-hidden="true" />
          : kind === "image"
            ? <ImageIcon size={15} aria-hidden="true" />
            : <Clapperboard size={15} aria-hidden="true" />}
        {ready ? `${label} seleccionad${kind === "image" ? "a" : "o"}` : `Seleccionar ${label.toLocaleLowerCase("es")}`}
      </summary>
      <div className={styles.pickerPanel}>
        {available.length ? (
          <div className={styles.choices}>
            {available.map((resource) => (
              <form
                key={`${kind}:${resource.src}`}
                method="post"
                action={`/api/admin/content/games/${encodeURIComponent(slug)}/media-library`}
                className={styles.choiceForm}
              >
                <input type="hidden" name="expectedRevision" value={revision} />
                <input type="hidden" name="target" value={target} />
                <input type="hidden" name="resource" value={resource.src} />
                <button type="submit" className={styles.choice} disabled={disabled}>
                  <AdminMediaThumbnail
                    kind={resource.kind}
                    src={resource.src}
                    mode="source"
                    label={multimediaShortName(resource.src)}
                    sizes="64px"
                    playIndicator={resource.kind === "video"}
                    className={styles.choiceThumb}
                  />
                  <span className={styles.choiceCopy}>
                    <strong>{multimediaShortName(resource.src)}</strong>
                    <small>{resource.kind === "image" ? "Imagen de biblioteca" : "Video WebM editorial"}</small>
                  </span>
                </button>
              </form>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            No hay {kind === "image" ? "imágenes" : "videos"} disponibles. Agrégalo desde la Biblioteca multimedia y vuelve a esta asignación.
          </div>
        )}
      </div>
    </details>
  );
}

function ModeSwitch({
  slug,
  revision,
  target,
  mode,
  disabled,
}: {
  slug: string;
  revision: number;
  target: "hero" | "card";
  mode: GameDestinationMediaMode;
  disabled: boolean;
}) {
  return (
    <form
      method="post"
      action={`/api/admin/content/games/${encodeURIComponent(slug)}/media-library`}
      className={styles.modeSwitch}
      aria-label={`Modo de ${target === "hero" ? "Hero" : "detalle de Card"}`}
    >
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="target" value={`${target}-mode`} />
      {MODES.map((option) => (
        <button
          key={option.value}
          type="submit"
          name="resource"
          value={option.value}
          disabled={disabled}
          aria-pressed={mode === option.value}
        >
          {option.label}
        </button>
      ))}
    </form>
  );
}

function CoverSourceSwitch({
  slug,
  revision,
  source,
  disabled,
}: {
  slug: string;
  revision: number;
  source: GameCoverArtworkSource;
  disabled: boolean;
}) {
  return (
    <form
      method="post"
      action={`/api/admin/content/games/${encodeURIComponent(slug)}/media-library`}
      className={styles.modeSwitch}
      aria-label="Fuente de imagen de Portada"
    >
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="target" value="cover-source" />
      {COVER_SOURCES.map((option) => (
        <button
          key={option.value}
          type="submit"
          name="resource"
          value={option.value}
          disabled={disabled}
          aria-pressed={source === option.value}
        >
          {option.label}
        </button>
      ))}
    </form>
  );
}

function CropButton({
  ready,
  assigned,
  aspect,
  kind,
  disabled,
  onClick,
}: {
  ready: boolean;
  assigned: boolean;
  aspect: string;
  kind: "image" | "video";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.cropButton}
      data-ready={ready ? "true" : "false"}
      disabled={disabled || !assigned}
      onClick={onClick}
    >
      {ready ? <CheckCircle2 size={15} aria-hidden="true" /> : <Info size={15} aria-hidden="true" />}
      {ready
        ? `Recorte ${aspect} confirmado`
        : assigned
          ? `Confirmar recorte ${aspect} de ${kind === "image" ? "imagen" : "video"}`
          : `Falta ${kind === "image" ? "imagen" : "video"}`}
    </button>
  );
}

export default function GameMediaAssignmentsWorkspace({ slug, revision }: Props) {
  const [state, setState] = useState<MultimediaLibraryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `/api/admin/content/games/${encodeURIComponent(slug)}/media-workspace`,
          { credentials: "same-origin", cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) throw new Error("No se pudo cargar la asignación multimedia del juego.");
        const payload = await response.json() as MultimediaLibraryState;
        if (controller.signal.aborted) return;
        setState(payload);

        const hash = window.location.hash;
        if (hash === "#cover-crop") setEditing({ target: "cover", kind: "image" });
        else if (hash === "#hero-crop") setEditing({ target: "hero", kind: "image" });
        else if (hash === "#card-crop") setEditing({ target: "card", kind: "image" });
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la asignación multimedia.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [slug]);

  const resources = state?.resources ?? EMPTY_RESOURCES;
  const assignments = state?.assignments;
  const currentRevision = state?.revision ?? revision;
  const stale = state !== null && state.revision !== revision;
  const imageResources = useMemo(() => resources.filter((resource) => resource.kind === "image"), [resources]);
  const videoResources = useMemo(() => resources.filter((resource) => resource.kind === "video"), [resources]);

  if (loading) return <div className={styles.status} role="status">Cargando asignación de destinos…</div>;
  if (error || !assignments) return <div className={styles.status} role="alert">{error ?? "No se pudo leer la asignación multimedia."}</div>;

  const posterSource = assignments.coverArtworkSource;
  const posterImage = assignments.coverImage;
  const posterViewport = assignments.imageMedia?.cover;
  const posterResource = imageResources.find((resource) => resource.src === posterImage) ?? null;
  const posterReady = Boolean(
    posterImage && isImageCropConfirmed(
      posterViewport,
      REQUIRED_DESTINATION_ASPECTS.cover,
      LEGACY_DESTINATION_IMAGE_ASPECTS.cover,
      posterImage
    )
  );

  const cardMode = assignments.cardMode;
  const cardCopy = cardModeCopy(cardMode);
  const cardImage = assignments.cardImage;
  const cardImageViewport = assignments.imageMedia?.card;
  const cardImageResource = imageResources.find((resource) => resource.src === cardImage) ?? null;
  const cardImageReady = Boolean(
    cardImage && isImageCropConfirmed(
      cardImageViewport,
      REQUIRED_DESTINATION_ASPECTS.card,
      LEGACY_DESTINATION_IMAGE_ASPECTS.card,
      cardImage
    )
  );
  const resolvedCardClip = cardVideoClip(
    assignments.cardVideo,
    assignments.heroVideo?.clip,
    assignments.legacyPreviewClip
  );
  const resolvedCardViewport = cardVideoViewport(assignments.cardVideo);
  const cardVideoResource = videoResources.find((resource) => resource.src === resolvedCardClip) ?? null;
  const cardVideoReady = Boolean(
    resolvedCardClip && isVideoCropConfirmed(resolvedCardViewport, REQUIRED_DESTINATION_ASPECTS.card)
  );
  const cardDetailReady = cardImageReady && (!needsVideo(cardMode) || cardVideoReady);
  const wholeCardReady = posterReady && cardDetailReady;

  const heroMode = assignments.heroMode;
  const heroImage = assignments.heroImage;
  const heroViewport = assignments.imageMedia?.hero;
  const heroImageResource = imageResources.find((resource) => resource.src === heroImage) ?? null;
  const heroImageReady = Boolean(
    heroImage && isImageCropConfirmed(
      heroViewport,
      REQUIRED_DESTINATION_ASPECTS.hero,
      LEGACY_DESTINATION_IMAGE_ASPECTS.hero,
      heroImage
    )
  );
  const heroVideo = assignments.heroVideo;
  const heroVideoResource = videoResources.find((resource) => resource.src === heroVideo?.clip) ?? null;
  const heroVideoReady = Boolean(
    heroVideo?.clip && isVideoCropConfirmed(heroVideo.viewport, REQUIRED_DESTINATION_ASPECTS.hero)
  );
  const heroReady = (!needsImage(heroMode) || heroImageReady) && (!needsVideo(heroMode) || heroVideoReady);

  const editImage = editing?.kind === "image"
    ? editing.target === "cover" ? posterImage : editing.target === "hero" ? heroImage : cardImage
    : null;
  const editImageViewport = editing?.kind === "image"
    ? editing.target === "cover" ? posterViewport : editing.target === "hero" ? heroViewport : cardImageViewport
    : undefined;
  const editVideo = editing?.kind === "video"
    ? editing.target === "hero" ? heroVideo?.clip ?? null : editing.target === "card" ? resolvedCardClip : null
    : null;
  const editVideoViewport = editing?.kind === "video"
    ? editing.target === "hero" ? heroVideo?.viewport : editing.target === "card" ? resolvedCardViewport : undefined
    : undefined;

  return (
    <div className={styles.root}>
      <section className={styles.intro}>
        <div>
          <span>ASIGNACIÓN DE DESTINOS</span>
          <h2>Card es la presentación principal del juego</h2>
          <p>Card conserva siempre una imagen base 3:2. En modo Video esa imagen no compite con el WebM: funciona como respaldo estable durante carga, errores, reduced motion y estados donde el video no debe reproducirse. Portada puede compartir el mismo master con crop 4:5 independiente.</p>
        </div>
        <span className={styles.revision}>REVISIÓN {currentRevision}</span>
      </section>

      {stale && <div className={styles.stale} role="alert"><TriangleAlert size={16} aria-hidden="true" />La revisión cambió. Recarga antes de modificar destinos.</div>}

      <div className={styles.grid}>
        <article className={styles.cardDestination} aria-labelledby="card-destination-heading">
          <header className={styles.destinationHeader}>
            <div><b>A</b><h3 id="card-destination-heading">Card del juego</h3></div>
            <small>Portada 4:5 + media 3:2</small>
          </header>
          <p className={styles.cardIntro}>La Portada es el estado inicial 4:5. La Vista informativa siempre conserva una imagen 3:2 segura; el modo elegido define si esa imagen es principal, inicial o respaldo del video.</p>

          <div className={styles.cardLayers}>
            <section className={styles.layer} id="cover-crop" aria-labelledby="card-poster-heading">
              <div className={styles.layerHeader}>
                <div><strong id="card-poster-heading">Portada inicial</strong><span>Imagen limpia para poster y ficha.</span></div>
                <span className={styles.aspect}>4:5</span>
              </div>
              <CoverSourceSwitch slug={slug} revision={currentRevision} source={posterSource} disabled={stale} />
              <div className={styles.current}>
                {posterResource ? <AdminMediaThumbnail kind="image" src={posterResource.src} viewport={posterViewport} mode="destination" frameAspect={4 / 5} label="Card · portada inicial" sizes="96px" className={`${styles.thumb} ${styles.thumbPoster}`} /> : <ImageIcon size={28} aria-hidden="true" />}
                <div className={styles.currentMeta}>
                  <span>{posterSource === "card" ? "Imagen compartida con Card" : "Imagen propia de Portada"}</span>
                  <strong>{posterImage ? multimediaShortName(posterImage) : "Sin imagen asignada"}</strong>
                  <small>{posterSource === "card" ? "Comparte el master, no el recorte: Portada conserva su crop 4:5 propio." : "La Portada usa un master independiente de la imagen 3:2 de Card."}</small>
                </div>
              </div>
              <div className={styles.actions}>
                {posterSource === "custom" && <ResourcePicker slug={slug} revision={currentRevision} target="cover-image" kind="image" resources={imageResources} selected={posterImage} disabled={stale} label="Imagen de portada" />}
                <CropButton ready={posterReady} assigned={Boolean(posterImage)} aspect="4:5" kind="image" disabled={stale} onClick={() => setEditing({ target: "cover", kind: "image" })} />
              </div>
              <RequirementLine ready={posterReady} text={posterReady ? "PORTADA LISTA · 4:5" : "FALTA COMPLETAR LA PORTADA 4:5"} />
            </section>

            <section className={styles.layer} id="card-crop" aria-labelledby="card-detail-heading">
              <div className={styles.layerHeader}>
                <div><strong id="card-detail-heading">Vista informativa</strong><span>{cardCopy.heading}</span></div>
                <span className={styles.aspect}>3:2</span>
              </div>
              <ModeSwitch slug={slug} revision={currentRevision} target="card" mode={cardMode} disabled={stale} />
              <div className={styles.modeNote} data-card-mode-note={cardMode}>
                {cardMode === "video" ? <Clapperboard size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}
                <span>
                  {cardMode === "video"
                    ? "Video es el medio principal. La imagen se mantiene sólo como fallback seguro y nunca reemplaza al video mientras éste pueda reproducirse."
                    : cardMode === "hover-video"
                      ? "Imagen es el estado inicial. El video entra al hover o foco y vuelve a la imagen al salir."
                      : "Imagen es el único medio de esta vista; no se monta video."}
                </span>
              </div>
              <div className={styles.current}>
                {cardMode === "video"
                  ? cardVideoResource
                    ? <AdminMediaThumbnail kind="video" src={cardVideoResource.src} viewport={resolvedCardViewport} mode="destination" frameAspect={3 / 2} label="Card · video principal 3:2" sizes="96px" playIndicator className={`${styles.thumb} ${styles.thumbDetail}`} />
                    : <Clapperboard size={28} aria-hidden="true" />
                  : cardImageResource
                    ? <AdminMediaThumbnail kind="image" src={cardImageResource.src} viewport={cardImageViewport} mode="destination" frameAspect={3 / 2} label="Card · imagen 3:2" sizes="96px" className={`${styles.thumb} ${styles.thumbDetail}`} />
                    : <ImageIcon size={28} aria-hidden="true" />}
                <div className={styles.currentMeta}>
                  <span>{cardCopy.summaryEyebrow}</span>
                  <strong>{modeLabel(cardMode)}</strong>
                  <small>{cardCopy.summaryDetail(cardImage, resolvedCardClip)}</small>
                </div>
              </div>

              <div className={styles.requirementGroup} data-card-media-role={cardMode === "video" ? "fallback" : "primary"}>
                <div className={styles.requirementGroupHeader}>
                  <ImageIcon size={16} aria-hidden="true" />
                  <div><strong>{cardCopy.imageRole}</strong><span>{cardCopy.imageHelp}</span></div>
                </div>
                <div className={styles.actions}>
                  <ResourcePicker slug={slug} revision={currentRevision} target="card-image" kind="image" resources={imageResources} selected={cardImage} disabled={stale} label={cardCopy.imagePickerLabel} />
                  <CropButton ready={cardImageReady} assigned={Boolean(cardImage)} aspect="3:2" kind="image" disabled={stale} onClick={() => setEditing({ target: "card", kind: "image" })} />
                </div>
              </div>

              {needsVideo(cardMode) && cardCopy.videoRole && cardCopy.videoHelp && (
                <div className={styles.requirementGroup} data-card-media-role="video">
                  <div className={styles.requirementGroupHeader}>
                    <Clapperboard size={16} aria-hidden="true" />
                    <div><strong>{cardCopy.videoRole}</strong><span>{cardCopy.videoHelp}</span></div>
                  </div>
                  <div className={styles.actions}>
                    <ResourcePicker slug={slug} revision={currentRevision} target="card-video" kind="video" resources={videoResources} selected={resolvedCardClip} disabled={stale} label="Video 3:2" />
                    <CropButton ready={cardVideoReady} assigned={Boolean(resolvedCardClip)} aspect="3:2" kind="video" disabled={stale} onClick={() => setEditing({ target: "card", kind: "video" })} />
                  </div>
                </div>
              )}

              <RequirementLine ready={cardDetailReady} text={cardDetailReady ? cardCopy.readyLabel : "FALTA COMPLETAR LA MEDIA 3:2"} />
            </section>
          </div>
          <div className={styles.destinationBody}><RequirementLine ready={wholeCardReady} text={wholeCardReady ? "CARD COMPLETA · PORTADA + MEDIA" : "CARD INCOMPLETA · REVISA SUS DOS CAPAS"} /></div>
        </article>

        <article className={styles.destination} aria-labelledby="hero-destination-heading">
          <header className={styles.destinationHeader} id="hero-crop"><div><b>B</b><h3 id="hero-destination-heading">Hero de inicio</h3></div><small>Obligatorio · 3:1</small></header>
          <div className={styles.destinationBody}>
            <ModeSwitch slug={slug} revision={currentRevision} target="hero" mode={heroMode} disabled={stale} />
            <div className={styles.current}>
              {heroImageResource
                ? <AdminMediaThumbnail kind="image" src={heroImageResource.src} viewport={heroViewport} mode="destination" frameAspect={3} label="Hero 3:1" sizes="96px" className={`${styles.thumb} ${styles.thumbDetail}`} />
                : heroVideoResource
                  ? <AdminMediaThumbnail kind="video" src={heroVideoResource.src} viewport={heroVideo?.viewport} mode="destination" frameAspect={3} label="Hero video 3:1" sizes="96px" playIndicator className={`${styles.thumb} ${styles.thumbDetail}`} />
                  : <MonitorPlay size={28} aria-hidden="true" />}
              <div className={styles.currentMeta}><span>Modo Hero</span><strong>{modeLabel(heroMode)}</strong><small>Destino panorámico independiente de la Card.</small></div>
            </div>
            <div className={styles.actions}>
              {needsImage(heroMode) && <><ResourcePicker slug={slug} revision={currentRevision} target="hero-image" kind="image" resources={imageResources} selected={heroImage} disabled={stale} label="Imagen Hero" /><CropButton ready={heroImageReady} assigned={Boolean(heroImage)} aspect="3:1" kind="image" disabled={stale} onClick={() => setEditing({ target: "hero", kind: "image" })} /></>}
              {needsVideo(heroMode) && <><ResourcePicker slug={slug} revision={currentRevision} target="hero-video" kind="video" resources={videoResources} selected={heroVideo?.clip ?? null} disabled={stale} label="Video Hero" /><CropButton ready={heroVideoReady} assigned={Boolean(heroVideo?.clip)} aspect="3:1" kind="video" disabled={stale} onClick={() => setEditing({ target: "hero", kind: "video" })} /></>}
            </div>
            <RequirementLine ready={heroReady} text={heroReady ? "HERO LISTO · 3:1" : "HERO INCOMPLETO · 3:1"} />
          </div>
        </article>

        <GameBackgroundMediaEditor slug={slug} revision={currentRevision} resources={resources} assignment={{ mode: assignments.backgroundMode, image: assignments.backgroundImage, imageViewport: assignments.imageMedia?.background ?? null, video: assignments.backgroundVideo }} stale={stale} />
        <GameDetailMediaEditor slug={slug} revision={currentRevision} endpoint={`/api/admin/content/games/${encodeURIComponent(slug)}/media-library`} resources={resources} assignment={{ mode: assignments.detailMode, image: assignments.detailImage, imageViewport: assignments.imageMedia?.detail ?? null, video: assignments.detailVideo }} stale={stale} onAddResource={() => document.querySelector<HTMLElement>("[data-multimedia-library-open]")?.click()} />
      </div>

      <div className={styles.hint}><strong>Biblioteca compartida:</strong> los masters se crean una sola vez y se reutilizan por referencia. Card y Portada pueden compartir bytes con crops independientes. Ningún recurso se publica automáticamente desde esta vista.</div>

      {editing?.kind === "image" && editImage && (
        <ContextualMediaDialog eyebrow={editing.target === "cover" ? "CARD · PORTADA" : editing.target === "card" ? "CARD · MEDIA" : "HERO"} title={editing.target === "cover" ? "Recorte 4:5 de la Portada" : editing.target === "card" ? (cardMode === "video" ? "Recorte 3:2 de la imagen de respaldo" : "Recorte 3:2 de la imagen de Card") : "Recorte 3:1 del Hero"} description="Se guarda únicamente el encuadre editorial. El archivo físico permanece intacto y reutilizable." onClose={() => setEditing(null)}>
          <ImageViewportEditor slug={slug} revision={currentRevision} target={editing.target} src={editImage} label={editing.target === "cover" ? "Portada · 4:5" : editing.target === "card" ? (cardMode === "video" ? "Card · imagen de respaldo 3:2" : "Card · imagen 3:2") : "Hero · 3:1"} initialViewport={editImageViewport} onClose={() => setEditing(null)} />
        </ContextualMediaDialog>
      )}

      {editing?.kind === "video" && editVideo && editVideoViewport && editing.target !== "cover" && (
        <ContextualMediaDialog eyebrow={editing.target === "card" ? "CARD · VIDEO" : "HERO"} title={editing.target === "card" ? "Recorte 3:2 del video de Card" : "Recorte 3:1 del video Hero"} description="El WebM se reutiliza por referencia; este editor sólo confirma el encuadre del destino." onClose={() => setEditing(null)}>
          <GameVideoViewportEditor slug={slug} revision={currentRevision} target={editing.target} source={editing.target === "hero" ? "hero" : assignments.cardVideo?.source ?? "independent"} clip={editVideo} label={editing.target === "card" ? "Card · video 3:2" : "Hero · video 3:1"} initialViewport={editVideoViewport} onClose={() => setEditing(null)} />
        </ContextualMediaDialog>
      )}
    </div>
  );
}
