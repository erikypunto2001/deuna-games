"use client";

import {
  Pause,
  Play,
  Scissors,
  SkipBack,
} from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_PREVIEW_FPS,
  MAX_PREVIEW_DURATION_SECONDS,
  PREVIEW_FPS_OPTIONS,
  PREVIEW_QUALITY_OPTIONS,
  parsePreviewTrimWindow,
  type PreviewFps,
  type PreviewQualityId,
  type PreviewQualityOption,
  type PreviewTrimWindow,
  type PreviewViewport,
} from "@/lib/media/preview-video-policy";

import styles from "./VideoTrimEditor.module.css";

const MIN_SELECTION_SECONDS = 0.1;
const KEYBOARD_STEP_SECONDS = 0.1;
const KEYBOARD_LARGE_STEP_SECONDS = 1;

type DragEdge = "start" | "end";

type PendingDrag = {
  edge: DragEdge;
  value: number;
};

type VideoTrimEditorProps = {
  src: string;
  sourceLabel: string;
  quality: PreviewQualityId;
  fps: PreviewFps;
  qualityDisabled?: boolean;
  qualityOptions?: readonly PreviewQualityOption[];
  fpsOptions?: readonly PreviewFps[];
  onQualityChange: (quality: PreviewQualityId) => void;
  onFpsChange: (fps: PreviewFps) => void;
  onTrimChange: (trim: PreviewTrimWindow | null) => void;
  /*
   * Compatibilidad de llamada durante la transición al motor único de
   * encuadre. El master siempre se guarda con fotograma completo; estos
   * campos ya no crean ni mantienen un segundo editor de crop.
   */
  viewport?: PreviewViewport;
  layoutOnly?: boolean;
  onViewportChange?: (viewport: PreviewViewport) => void;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundSeconds(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "00:00.0";
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds
    .toFixed(1)
    .padStart(4, "0")}`;
}

export default function VideoTrimEditor({
  src,
  sourceLabel,
  quality,
  fps,
  qualityDisabled = false,
  qualityOptions = PREVIEW_QUALITY_OPTIONS,
  fpsOptions = PREVIEW_FPS_OPTIONS,
  onQualityChange,
  onFpsChange,
  onTrimChange,
}: VideoTrimEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loopSelection, setLoopSelection] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const trim = useMemo(
    () => parsePreviewTrimWindow(
      String(startSeconds),
      String(endSeconds)
    ),
    [endSeconds, startSeconds]
  );

  useEffect(() => {
    onTrimChange(trim);
  }, [onTrimChange, trim]);

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
      }
      pendingDragRef.current = null;
    };
  }, []);

  function setSelection(start: number, end: number) {
    if (duration <= 0) return;

    const safeStart = clamp(
      roundSeconds(start),
      0,
      Math.max(0, duration - MIN_SELECTION_SECONDS)
    );
    const safeEnd = clamp(
      roundSeconds(end),
      safeStart + MIN_SELECTION_SECONDS,
      duration
    );
    const limitedEnd = Math.min(
      safeEnd,
      safeStart + MAX_PREVIEW_DURATION_SECONDS
    );

    setStartSeconds(safeStart);
    setEndSeconds(roundSeconds(limitedEnd));
  }

  function updateEdge(edge: DragEdge, value: number) {
    if (duration <= 0) return;

    if (edge === "start") {
      const maximumStart = Math.max(
        0,
        endSeconds - MIN_SELECTION_SECONDS
      );
      const nextStart = clamp(value, 0, maximumStart);
      const minimumStart = Math.max(
        0,
        endSeconds - MAX_PREVIEW_DURATION_SECONDS
      );
      setStartSeconds(roundSeconds(Math.max(nextStart, minimumStart)));
      return;
    }

    const minimumEnd = Math.min(
      duration,
      startSeconds + MIN_SELECTION_SECONDS
    );
    const maximumEnd = Math.min(
      duration,
      startSeconds + MAX_PREVIEW_DURATION_SECONDS
    );
    setEndSeconds(roundSeconds(clamp(value, minimumEnd, maximumEnd)));
  }

  function scheduleDrag(edge: DragEdge, value: number) {
    pendingDragRef.current = { edge, value };
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const pending = pendingDragRef.current;
      pendingDragRef.current = null;
      if (pending) updateEdge(pending.edge, pending.value);
    });
  }

  function secondsAtClientX(clientX: number) {
    const timeline = timelineRef.current;
    if (!timeline || duration <= 0) return 0;
    const rect = timeline.getBoundingClientRect();
    const ratio = rect.width <= 0
      ? 0
      : clamp((clientX - rect.left) / rect.width, 0, 1);
    return ratio * duration;
  }

  function handleTimelinePointer(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget &&
      (event.target as HTMLElement).closest("button")) {
      return;
    }
    const next = secondsAtClientX(event.clientX);
    const video = videoRef.current;
    if (video) video.currentTime = next;
    setCurrentTime(next);
  }

  function startHandleDrag(
    event: PointerEvent<HTMLButtonElement>,
    edge: DragEdge
  ) {
    event.preventDefault();
    event.stopPropagation();
    videoRef.current?.pause();
    event.currentTarget.setPointerCapture(event.pointerId);
    scheduleDrag(edge, secondsAtClientX(event.clientX));
  }

  function moveHandleDrag(
    event: PointerEvent<HTMLButtonElement>,
    edge: DragEdge
  ) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    scheduleDrag(edge, secondsAtClientX(event.clientX));
  }

  function finishHandleDrag(
    event: PointerEvent<HTMLButtonElement>,
    edge: DragEdge
  ) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    const value = secondsAtClientX(event.clientX);
    pendingDragRef.current = null;
    updateEdge(edge, value);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancelHandleDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleEdgeKey(
    event: KeyboardEvent<HTMLButtonElement>,
    edge: DragEdge
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const step = event.shiftKey
      ? KEYBOARD_LARGE_STEP_SECONDS
      : KEYBOARD_STEP_SECONDS;
    const current = edge === "start" ? startSeconds : endSeconds;
    updateEdge(edge, current + direction * step);
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video || duration <= 0) return;

    if (!video.paused) {
      video.pause();
      return;
    }

    if (trim && (video.currentTime < trim.startSeconds || video.currentTime >= trim.endSeconds)) {
      video.currentTime = trim.startSeconds;
    }
    void video.play();
  }

  function jumpToStart() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = startSeconds;
    setCurrentTime(startSeconds);
  }

  function setInAtCurrent() {
    if (duration <= 0) return;
    const nextStart = clamp(
      currentTime,
      0,
      Math.max(0, endSeconds - MIN_SELECTION_SECONDS)
    );
    setSelection(nextStart, endSeconds);
  }

  function setOutAtCurrent() {
    if (duration <= 0) return;
    const nextEnd = clamp(
      currentTime,
      startSeconds + MIN_SELECTION_SECONDS,
      duration
    );
    setSelection(startSeconds, nextEnd);
  }

  const startPercent = duration > 0
    ? (startSeconds / duration) * 100
    : 0;
  const endPercent = duration > 0
    ? (endSeconds / duration) * 100
    : 0;
  const playheadPercent = duration > 0
    ? (currentTime / duration) * 100
    : 0;
  const selectedDuration = trim?.durationSeconds ?? 0;

  return (
    <div className={styles.editor}>
      <div
        className={styles.previewStage}
        style={{ minHeight: "clamp(300px, 46vh, 500px)" }}
      >
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
          controls={false}
          onClick={togglePlayback}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            const nextDuration = Number.isFinite(video.duration)
              ? video.duration
              : 0;
            if (nextDuration <= 0) {
              setMediaError("El video no informa una duración válida para editar.");
              return;
            }
            const nextEnd = Math.min(
              nextDuration,
              MAX_PREVIEW_DURATION_SECONDS
            );
            setDuration(nextDuration);
            setCurrentTime(0);
            setStartSeconds(0);
            setEndSeconds(roundSeconds(nextEnd));
            setMediaError(null);
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            setCurrentTime(video.currentTime);
            if (
              loopSelection &&
              trim &&
              video.currentTime >= trim.endSeconds
            ) {
              video.currentTime = trim.startSeconds;
              if (video.paused) void video.play();
            } else if (
              trim &&
              !loopSelection &&
              video.currentTime >= trim.endSeconds &&
              !video.paused
            ) {
              video.pause();
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setMediaError("No se pudo reproducir esta fuente en el editor temporal.")}
        />

        <button
          type="button"
          className={styles.centerPlay}
          onClick={togglePlayback}
          aria-label={playing ? "Pausar video" : "Reproducir video"}
        >
          {playing ? <Pause size={22} aria-hidden="true" /> : <Play size={22} aria-hidden="true" />}
        </button>
      </div>

      <div className={styles.sourceRow}>
        <span>{sourceLabel}</span>
        <strong>
          {duration > 0
            ? `${formatTime(currentTime)} / ${formatTime(duration)}`
            : "Cargando duración…"}
        </strong>
      </div>

      <div
        ref={timelineRef}
        className={styles.timeline}
        role="slider"
        aria-label="Línea de tiempo del video"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={currentTime}
        tabIndex={-1}
        onPointerDown={handleTimelinePointer}
      >
        <div className={styles.timelineBase} aria-hidden="true" />
        <div
          className={styles.selection}
          style={{
            left: `${startPercent}%`,
            width: `${Math.max(0, endPercent - startPercent)}%`,
          }}
          aria-hidden="true"
        />
        <div
          className={styles.playhead}
          style={{ left: `${playheadPercent}%` }}
          aria-hidden="true"
        />
        <button
          type="button"
          className={`${styles.handle} ${styles.handleStart}`}
          style={{ left: `${startPercent}%` }}
          aria-label={`IN ${formatTime(startSeconds)}. Arrastra o usa las flechas.`}
          onPointerDown={(event) => startHandleDrag(event, "start")}
          onPointerMove={(event) => moveHandleDrag(event, "start")}
          onPointerUp={(event) => finishHandleDrag(event, "start")}
          onPointerCancel={cancelHandleDrag}
          onKeyDown={(event) => handleEdgeKey(event, "start")}
        >
          <span>IN</span>
        </button>
        <button
          type="button"
          className={`${styles.handle} ${styles.handleEnd}`}
          style={{ left: `${endPercent}%` }}
          aria-label={`OUT ${formatTime(endSeconds)}. Arrastra o usa las flechas.`}
          onPointerDown={(event) => startHandleDrag(event, "end")}
          onPointerMove={(event) => moveHandleDrag(event, "end")}
          onPointerUp={(event) => finishHandleDrag(event, "end")}
          onPointerCancel={cancelHandleDrag}
          onKeyDown={(event) => handleEdgeKey(event, "end")}
        >
          <span>OUT</span>
        </button>
      </div>

      <div className={styles.trimSummary}>
        <div>
          <span>IN</span>
          <strong>{formatTime(startSeconds)}</strong>
        </div>
        <div className={styles.selectionDuration}>
          <Scissors size={15} aria-hidden="true" />
          <strong>{selectedDuration.toFixed(1)} s</strong>
        </div>
        <div>
          <span>OUT</span>
          <strong>{formatTime(endSeconds)}</strong>
        </div>
      </div>

      <div className={styles.controls}>
        <button type="button" disabled={duration <= 0} onClick={togglePlayback}>
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {playing ? "Pausar" : "Reproducir"}
        </button>
        <button type="button" disabled={duration <= 0} onClick={jumpToStart}>
          <SkipBack size={16} aria-hidden="true" />
          Ir a IN
        </button>
        <button type="button" disabled={duration <= 0} onClick={setInAtCurrent}>
          Marcar IN aquí
        </button>
        <button type="button" disabled={duration <= 0} onClick={setOutAtCurrent}>
          Marcar OUT aquí
        </button>
        <button
          type="button"
          disabled={!trim}
          aria-pressed={loopSelection}
          onClick={() => setLoopSelection((value) => !value)}
        >
          {loopSelection ? "Bucle activo" : "Repetir selección"}
        </button>
      </div>

      <div className={styles.numericControls}>
        <label>
          <span>IN · segundos</span>
          <input
            type="number"
            min="0"
            max={Math.max(0, endSeconds - MIN_SELECTION_SECONDS)}
            step="0.001"
            value={startSeconds}
            disabled={duration <= 0}
            onChange={(event) => updateEdge("start", Number(event.target.value))}
          />
        </label>
        <label>
          <span>OUT · segundos</span>
          <input
            type="number"
            min={Math.min(duration, startSeconds + MIN_SELECTION_SECONDS)}
            max={Math.min(duration, startSeconds + MAX_PREVIEW_DURATION_SECONDS)}
            step="0.001"
            value={endSeconds}
            disabled={duration <= 0}
            onChange={(event) => updateEdge("end", Number(event.target.value))}
          />
        </label>
      </div>

      <fieldset className={styles.qualityPanel} disabled={qualityDisabled}>
        <legend>Salida del master</legend>
        <p>
          Resolución del master y FPS son ajustes independientes. El master conserva el fotograma completo; el botón de guardado usa exactamente la combinación seleccionada aquí y el servidor sólo reduce FPS si la fuente original realmente tiene menos cuadros por segundo.
        </p>
        <div className={styles.qualityGrid}>
          {qualityOptions.map((option) => (
            <label
              key={option.id}
              className={`${styles.qualityOption} ${
                quality === option.id ? styles.qualityOptionActive : ""
              }`}
            >
              <input
                type="radio"
                name="preview-quality"
                value={option.id}
                checked={quality === option.id}
                onChange={() => onQualityChange(option.id)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.targetWidth}px · resolución del master</small>
              </span>
              <em>{option.detail}</em>
            </label>
          ))}
        </div>
        <p>
          <strong>FPS del master · máximo 60</strong>. 50 FPS sigue siendo el valor recomendado por equilibrio de peso; si elegís 60, esa selección se conserva hasta el envío.
        </p>
        <div className={styles.qualityGrid} role="radiogroup" aria-label="FPS del master">
          {fpsOptions.map((option) => (
            <label
              key={option}
              className={`${styles.qualityOption} ${
                fps === option ? styles.qualityOptionActive : ""
              }`}
            >
              <input
                type="radio"
                name="preview-fps"
                value={option}
                checked={fps === option}
                onChange={() => onFpsChange(option)}
              />
              <span>
                <strong>{option} FPS</strong>
                <small>{option === DEFAULT_PREVIEW_FPS ? "Recomendado" : "Selección explícita"}</small>
              </span>
            </label>
          ))}
        </div>
        <p>
          Salida seleccionada: <strong>{quality} · {fps} FPS</strong>.
        </p>
      </fieldset>

      {mediaError ? (
        <div className={styles.error} role="alert">{mediaError}</div>
      ) : (
        <p className={styles.help}>
          Este editor sólo define el tramo temporal y la salida técnica del master. No contiene un segundo sistema de recorte espacial: todos los encuadres de imagen y video se realizan después con el mismo editor de destinos.
        </p>
      )}
    </div>
  );
}
