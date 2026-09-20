"use client";

import Image from "next/image";
import {
  Move,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import GameMedia from "@/components/ui/GameMedia";
import {
  DEFAULT_PREVIEW_VIEWPORT,
  MAX_PREVIEW_VIEWPORT_ZOOM,
  MIN_PREVIEW_VIEWPORT_ZOOM,
  PREVIEW_VIEWPORT_ASPECT_OPTIONS,
  parsePreviewViewport,
  resolvePreviewViewportCrop,
  type PreviewViewport,
  type PreviewViewportAspectId,
  type ResolvedPreviewViewportCrop,
} from "@/lib/media/preview-video-policy";

import enhancementStyles from "./MediaViewportEditorEnhancements.module.css";
import styles from "./VideoTrimEditor.module.css";

const VIEWPORT_KEYBOARD_STEP = 0.02;
const VIEWPORT_KEYBOARD_LARGE_STEP = 0.1;
const RESULT_PREVIEW_MAX_WIDTH = 320;
const RESULT_PREVIEW_MAX_HEIGHT = 220;
const DEFAULT_FREE_ASPECT_RATIO = 16 / 9;
const FREE_RESIZE_KEYBOARD_STEP = 0.02;
const FREE_RESIZE_KEYBOARD_LARGE_STEP = 0.08;
const RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const POSITION_PRESETS = [
  { label: "↖", title: "Arriba izquierda", x: 0, y: 0 },
  { label: "↑", title: "Arriba centro", x: 0.5, y: 0 },
  { label: "↗", title: "Arriba derecha", x: 1, y: 0 },
  { label: "←", title: "Centro izquierda", x: 0, y: 0.5 },
  { label: "●", title: "Centro", x: 0.5, y: 0.5 },
  { label: "→", title: "Centro derecha", x: 1, y: 0.5 },
  { label: "↙", title: "Abajo izquierda", x: 0, y: 1 },
  { label: "↓", title: "Abajo centro", x: 0.5, y: 1 },
  { label: "↘", title: "Abajo derecha", x: 1, y: 1 },
] as const;

type MediaKind = "image" | "video";
type ResizeHandle = (typeof RESIZE_HANDLES)[number];

type MediaBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PreviewSize = {
  width: number;
  height: number;
};

type ViewportDrag = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  travelX: number;
  travelY: number;
};

type ResizeDrag = {
  pointerId: number;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  startCrop: ResolvedPreviewViewportCrop;
  startViewport: PreviewViewport;
};

type Props = {
  kind: MediaKind;
  src: string;
  sourceLabel: string;
  viewport: PreviewViewport;
  requiredAspect?: PreviewViewport["aspect"];
  selectableAspects?: readonly PreviewViewportAspectId[];
  disabled?: boolean;
  onViewportChange: (viewport: PreviewViewport) => void;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundViewport(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function isResizeHandle(value: string | undefined): value is ResizeHandle {
  return Boolean(
    value &&
    (RESIZE_HANDLES as readonly string[]).includes(value)
  );
}

function aspectOption(aspect: PreviewViewport["aspect"]) {
  return PREVIEW_VIEWPORT_ASPECT_OPTIONS.find(
    (option) => option.id === aspect
  );
}

function aspectLabel(aspect: PreviewViewport["aspect"]) {
  return aspectOption(aspect)?.label ?? aspect;
}

function aspectSummary(viewport: PreviewViewport) {
  if (viewport.aspect !== "free") return viewport.aspect;
  return `Libre · ${(viewport.customAspectRatio ?? DEFAULT_FREE_ASPECT_RATIO).toFixed(2)}:1`;
}

function normalizeEditorViewport(
  viewport: PreviewViewport,
  requiredAspect?: PreviewViewport["aspect"]
) {
  const aspect = requiredAspect ?? viewport.aspect;
  const customAspectRatio = aspect === "free"
    ? viewport.customAspectRatio ?? DEFAULT_FREE_ASPECT_RATIO
    : undefined;
  return parsePreviewViewport(
    String(viewport.x),
    String(viewport.y),
    String(viewport.zoom),
    aspect,
    customAspectRatio
  ) ?? {
    ...DEFAULT_PREVIEW_VIEWPORT,
    aspect: requiredAspect ?? "16:9",
  };
}

function resolveResultPreviewSize(
  crop: ResolvedPreviewViewportCrop | null
): PreviewSize | null {
  if (!crop || crop.width <= 0 || crop.height <= 0) return null;

  const ratio = crop.width / crop.height;
  let width = RESULT_PREVIEW_MAX_WIDTH;
  let height = width / ratio;

  if (height > RESULT_PREVIEW_MAX_HEIGHT) {
    height = RESULT_PREVIEW_MAX_HEIGHT;
    width = height * ratio;
  }

  return {
    width: Math.max(2, Math.round(width)),
    height: Math.max(2, Math.round(height)),
  };
}

function viewportFromCrop(
  sourceWidth: number,
  sourceHeight: number,
  crop: ResolvedPreviewViewportCrop
): PreviewViewport | null {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    crop.width <= 0 ||
    crop.height <= 0
  ) {
    return null;
  }

  const ratio = crop.width / crop.height;
  const sourceRatio = sourceWidth / sourceHeight;
  let baseWidth = sourceWidth;

  if (sourceRatio > ratio) {
    baseWidth = sourceHeight * ratio;
  }

  const zoom = baseWidth / crop.width;
  if (
    !Number.isFinite(zoom) ||
    zoom < MIN_PREVIEW_VIEWPORT_ZOOM - 0.0001 ||
    zoom > MAX_PREVIEW_VIEWPORT_ZOOM + 0.0001
  ) {
    return null;
  }

  const travelX = sourceWidth - crop.width;
  const travelY = sourceHeight - crop.height;
  const x = travelX <= 0.0001 ? 0.5 : crop.x / travelX;
  const y = travelY <= 0.0001 ? 0.5 : crop.y / travelY;

  return parsePreviewViewport(
    String(clamp(x, 0, 1)),
    String(clamp(y, 0, 1)),
    String(clamp(zoom, MIN_PREVIEW_VIEWPORT_ZOOM, MAX_PREVIEW_VIEWPORT_ZOOM)),
    "free",
    ratio
  );
}

function resizeCrop(
  start: ResolvedPreviewViewportCrop,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  sourceWidth: number,
  sourceHeight: number
): ResolvedPreviewViewportCrop | null {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle.includes("w")) left += deltaX;
  if (handle.includes("e")) right += deltaX;
  if (handle.includes("n")) top += deltaY;
  if (handle.includes("s")) bottom += deltaY;

  const minimumWidth = Math.max(2, sourceWidth * 0.01);
  const minimumHeight = Math.max(2, sourceHeight * 0.01);

  left = clamp(left, 0, right - minimumWidth);
  right = clamp(right, left + minimumWidth, sourceWidth);
  top = clamp(top, 0, bottom - minimumHeight);
  bottom = clamp(bottom, top + minimumHeight, sourceHeight);

  const crop = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };

  return viewportFromCrop(sourceWidth, sourceHeight, crop)
    ? crop
    : null;
}

function resizeHandlePosition(
  handle: ResizeHandle,
  rect: { left: number; top: number; width: number; height: number }
) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;

  switch (handle) {
    case "n": return { left: centerX, top: rect.top, cursor: "ns-resize" };
    case "ne": return { left: right, top: rect.top, cursor: "nesw-resize" };
    case "e": return { left: right, top: centerY, cursor: "ew-resize" };
    case "se": return { left: right, top: bottom, cursor: "nwse-resize" };
    case "s": return { left: centerX, top: bottom, cursor: "ns-resize" };
    case "sw": return { left: rect.left, top: bottom, cursor: "nesw-resize" };
    case "w": return { left: rect.left, top: centerY, cursor: "ew-resize" };
    case "nw": return { left: rect.left, top: rect.top, cursor: "nwse-resize" };
  }
}

function handleLabel(handle: ResizeHandle) {
  const labels: Record<ResizeHandle, string> = {
    n: "borde superior",
    ne: "esquina superior derecha",
    e: "borde derecho",
    se: "esquina inferior derecha",
    s: "borde inferior",
    sw: "esquina inferior izquierda",
    w: "borde izquierdo",
    nw: "esquina superior izquierda",
  };
  return labels[handle];
}

export default function MediaViewportEditor({
  kind,
  src,
  sourceLabel,
  viewport,
  requiredAspect,
  selectableAspects,
  disabled = false,
  onViewportChange,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportDragFrameRef = useRef<number | null>(null);
  const pendingViewportRef = useRef<PreviewViewport | null>(null);
  const viewportDragRef = useRef<ViewportDrag | null>(null);
  const resizeDragRef = useRef<ResizeDrag | null>(null);

  const [sourceWidth, setSourceWidth] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [mediaBox, setMediaBox] = useState<MediaBox | null>(null);
  const [viewportDraft, setViewportDraft] = useState<PreviewViewport>(() =>
    normalizeEditorViewport(viewport, requiredAspect)
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [frameRevision, setFrameRevision] = useState(0);

  const sourceCrop = useMemo(
    () => resolvePreviewViewportCrop(sourceWidth, sourceHeight, viewportDraft),
    [sourceHeight, sourceWidth, viewportDraft]
  );
  const resultPreviewSize = useMemo(
    () => resolveResultPreviewSize(sourceCrop),
    [sourceCrop]
  );
  const viewportRect = useMemo(() => {
    if (!sourceCrop || !mediaBox || sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }
    return {
      left: mediaBox.left + (sourceCrop.x / sourceWidth) * mediaBox.width,
      top: mediaBox.top + (sourceCrop.y / sourceHeight) * mediaBox.height,
      width: (sourceCrop.width / sourceWidth) * mediaBox.width,
      height: (sourceCrop.height / sourceHeight) * mediaBox.height,
    };
  }, [mediaBox, sourceCrop, sourceHeight, sourceWidth]);

  const availableAspects = useMemo(() => {
    const allowed = selectableAspects ?? PREVIEW_VIEWPORT_ASPECT_OPTIONS.map((option) => option.id);
    return PREVIEW_VIEWPORT_ASPECT_OPTIONS.filter((option) => allowed.includes(option.id));
  }, [selectableAspects]);
  const aspectLocked = requiredAspect !== undefined;
  const freeResizeEnabled = !aspectLocked && viewportDraft.aspect === "free";

  useEffect(() => {
    const stage = stageRef.current;
    const media = kind === "image" ? imageRef.current : videoRef.current;
    if (!stage || !media || sourceWidth <= 0 || sourceHeight <= 0) return;

    const syncMediaBox = () => {
      const stageRect = stage.getBoundingClientRect();
      const mediaRect = media.getBoundingClientRect();
      if (
        stageRect.width <= 0 || stageRect.height <= 0 ||
        mediaRect.width <= 0 || mediaRect.height <= 0
      ) {
        return;
      }

      const sourceRatio = sourceWidth / sourceHeight;
      const mediaRatio = mediaRect.width / mediaRect.height;
      let width = mediaRect.width;
      let height = mediaRect.height;
      if (mediaRatio > sourceRatio) width = mediaRect.height * sourceRatio;
      else if (mediaRatio < sourceRatio) height = mediaRect.width / sourceRatio;

      const containingBlockLeft = stageRect.left + stage.clientLeft;
      const containingBlockTop = stageRect.top + stage.clientTop;
      setMediaBox({
        left: mediaRect.left - containingBlockLeft + (mediaRect.width - width) / 2,
        top: mediaRect.top - containingBlockTop + (mediaRect.height - height) / 2,
        width,
        height,
      });
    };

    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(syncMediaBox);
    observer?.observe(stage);
    observer?.observe(media);
    syncMediaBox();
    return () => observer?.disconnect();
  }, [kind, sourceHeight, sourceWidth]);

  useEffect(() => () => {
    if (viewportDragFrameRef.current !== null) {
      cancelAnimationFrame(viewportDragFrameRef.current);
    }
    pendingViewportRef.current = null;
    viewportDragRef.current = null;
    resizeDragRef.current = null;
  }, []);

  useEffect(() => {
    if (kind !== "video") return;
    const canvas = resultCanvasRef.current;
    if (!canvas || !sourceCrop || !resultPreviewSize) return;

    const frame = requestAnimationFrame(() => {
      canvas.width = resultPreviewSize.width;
      canvas.height = resultPreviewSize.height;
      const context = canvas.getContext("2d", { alpha: false });
      const video = videoRef.current;
      if (!context || !video || video.readyState < 2) return;
      context.drawImage(
        video,
        sourceCrop.x,
        sourceCrop.y,
        sourceCrop.width,
        sourceCrop.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [currentTime, frameRevision, kind, resultPreviewSize, sourceCrop]);

  function normalizeNext(next: PreviewViewport) {
    return normalizeEditorViewport(next, requiredAspect);
  }

  function commitViewport(next: PreviewViewport) {
    const normalized = normalizeNext(next);
    setViewportDraft(normalized);
    onViewportChange(normalized);
  }

  function scheduleViewportDraft(next: PreviewViewport) {
    pendingViewportRef.current = normalizeNext(next);
    if (viewportDragFrameRef.current !== null) return;
    viewportDragFrameRef.current = requestAnimationFrame(() => {
      viewportDragFrameRef.current = null;
      const pending = pendingViewportRef.current;
      pendingViewportRef.current = null;
      if (pending) setViewportDraft(pending);
    });
  }

  function viewportFromPointer(event: PointerEvent<HTMLButtonElement>) {
    const drag = viewportDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return null;
    return {
      ...viewportDraft,
      x: drag.travelX <= 0
        ? 0.5
        : roundViewport(clamp(
            drag.startX + (event.clientX - drag.startClientX) / drag.travelX,
            0,
            1
          )),
      y: drag.travelY <= 0
        ? 0.5
        : roundViewport(clamp(
            drag.startY + (event.clientY - drag.startClientY) / drag.travelY,
            0,
            1
          )),
    };
  }

  function startViewportDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!mediaBox || !viewportRect || disabled) return;
    event.stopPropagation();
    videoRef.current?.pause();
    viewportDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: viewportDraft.x,
      startY: viewportDraft.y,
      travelX: Math.max(0, mediaBox.width - viewportRect.width),
      travelY: Math.max(0, mediaBox.height - viewportRect.height),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveViewportDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = viewportFromPointer(event);
    if (next) scheduleViewportDraft(next);
  }

  function finishViewportDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = viewportFromPointer(event);
    if (viewportDragFrameRef.current !== null) {
      cancelAnimationFrame(viewportDragFrameRef.current);
      viewportDragFrameRef.current = null;
    }
    pendingViewportRef.current = null;
    viewportDragRef.current = null;
    if (next) commitViewport(next);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancelViewportDrag(event: PointerEvent<HTMLButtonElement>) {
    if (viewportDragFrameRef.current !== null) {
      cancelAnimationFrame(viewportDragFrameRef.current);
      viewportDragFrameRef.current = null;
    }
    pendingViewportRef.current = null;
    viewportDragRef.current = null;
    onViewportChange(viewportDraft);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleViewportKey(event: KeyboardEvent<HTMLButtonElement>) {
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!horizontal && !vertical) return;
    event.preventDefault();
    const step = event.shiftKey ? VIEWPORT_KEYBOARD_LARGE_STEP : VIEWPORT_KEYBOARD_STEP;
    const next = { ...viewportDraft };
    if (event.key === "ArrowLeft") next.x -= step;
    if (event.key === "ArrowRight") next.x += step;
    if (event.key === "ArrowUp") next.y -= step;
    if (event.key === "ArrowDown") next.y += step;
    next.x = roundViewport(clamp(next.x, 0, 1));
    next.y = roundViewport(clamp(next.y, 0, 1));
    commitViewport(next);
  }

  function resizeViewportFromPointer(event: PointerEvent<HTMLButtonElement>) {
    const drag = resizeDragRef.current;
    if (
      !drag || drag.pointerId !== event.pointerId ||
      !mediaBox || sourceWidth <= 0 || sourceHeight <= 0
    ) {
      return null;
    }
    const deltaX = (event.clientX - drag.startClientX) / mediaBox.width * sourceWidth;
    const deltaY = (event.clientY - drag.startClientY) / mediaBox.height * sourceHeight;
    const crop = resizeCrop(
      drag.startCrop,
      drag.handle,
      deltaX,
      deltaY,
      sourceWidth,
      sourceHeight
    );
    return crop ? viewportFromCrop(sourceWidth, sourceHeight, crop) : null;
  }

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    const handle = event.currentTarget.dataset.resizeHandle;
    if (!isResizeHandle(handle) || !freeResizeEnabled || !sourceCrop || disabled) return;
    event.stopPropagation();
    videoRef.current?.pause();
    resizeDragRef.current = {
      pointerId: event.pointerId,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCrop: { ...sourceCrop },
      startViewport: { ...viewportDraft },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = resizeViewportFromPointer(event);
    if (next) scheduleViewportDraft(next);
  }

  function finishResize(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = resizeViewportFromPointer(event);
    if (viewportDragFrameRef.current !== null) {
      cancelAnimationFrame(viewportDragFrameRef.current);
      viewportDragFrameRef.current = null;
    }
    pendingViewportRef.current = null;
    resizeDragRef.current = null;
    if (next) commitViewport(next);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancelResize(event: PointerEvent<HTMLButtonElement>) {
    const drag = resizeDragRef.current;
    if (viewportDragFrameRef.current !== null) {
      cancelAnimationFrame(viewportDragFrameRef.current);
      viewportDragFrameRef.current = null;
    }
    pendingViewportRef.current = null;
    resizeDragRef.current = null;
    if (drag) commitViewport(drag.startViewport);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleResizeKey(event: KeyboardEvent<HTMLButtonElement>) {
    const handle = event.currentTarget.dataset.resizeHandle;
    if (!isResizeHandle(handle) || !freeResizeEnabled || !sourceCrop) return;
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!horizontal && !vertical) return;
    event.preventDefault();
    const step = event.shiftKey ? FREE_RESIZE_KEYBOARD_LARGE_STEP : FREE_RESIZE_KEYBOARD_STEP;
    const deltaX = horizontal
      ? sourceWidth * step * (event.key === "ArrowLeft" ? -1 : 1)
      : 0;
    const deltaY = vertical
      ? sourceHeight * step * (event.key === "ArrowUp" ? -1 : 1)
      : 0;
    const crop = resizeCrop(sourceCrop, handle, deltaX, deltaY, sourceWidth, sourceHeight);
    const next = crop ? viewportFromCrop(sourceWidth, sourceHeight, crop) : null;
    if (next) commitViewport(next);
  }

  function quickViewport(x: number, y: number) {
    commitViewport({
      ...viewportDraft,
      x: roundViewport(clamp(x, 0, 1)),
      y: roundViewport(clamp(y, 0, 1)),
    });
  }

  function changeAspect(aspect: PreviewViewportAspectId) {
    if (aspectLocked || disabled) return;
    if (aspect === "free") {
      if (sourceCrop && sourceWidth > 0 && sourceHeight > 0) {
        const next = viewportFromCrop(sourceWidth, sourceHeight, sourceCrop);
        if (next) {
          commitViewport(next);
          return;
        }
      }
      commitViewport({
        ...viewportDraft,
        aspect: "free",
        customAspectRatio: viewportDraft.customAspectRatio ?? DEFAULT_FREE_ASPECT_RATIO,
      });
      return;
    }
    commitViewport({
      ...viewportDraft,
      aspect,
      customAspectRatio: undefined,
    });
  }

  function resetViewport() {
    const aspect = requiredAspect ?? viewportDraft.aspect;
    commitViewport({
      ...DEFAULT_PREVIEW_VIEWPORT,
      aspect,
      ...(aspect === "free"
        ? { customAspectRatio: viewportDraft.customAspectRatio ?? DEFAULT_FREE_ASPECT_RATIO }
        : {}),
    });
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function requestPreviewRedraw() {
    setFrameRevision((value) => value + 1);
  }

  function seekVideo(value: number) {
    const video = videoRef.current;
    if (!video || duration <= 0) return;
    const next = clamp(value, 0, duration);
    video.currentTime = next;
    setCurrentTime(next);
    requestPreviewRedraw();
  }

  function seekVideoBy(delta: number) {
    seekVideo(currentTime + delta);
  }

  const currentAspectSummary = aspectSummary(viewportDraft);
  const lockedAspectLabel = requiredAspect ? aspectLabel(requiredAspect) : null;

  return (
    <div className={styles.editor}>
      <div className={styles.previewWorkspace}>
        <div
          ref={stageRef}
          className={styles.previewStage}
          style={{ minHeight: "clamp(360px, 52vh, 560px)" }}
        >
          {kind === "image" ? (
            <Image
              ref={imageRef}
              src={src}
              alt=""
              fill
              sizes="(max-width: 900px) 94vw, 980px"
              draggable={false}
              style={{ objectFit: "contain" }}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
                  setMediaError("La imagen no informa dimensiones válidas para editar.");
                  return;
                }
                setSourceWidth(image.naturalWidth);
                setSourceHeight(image.naturalHeight);
                setMediaError(null);
              }}
              onError={() => setMediaError("No se pudo cargar esta imagen para seleccionar el encuadre.")}
            />
          ) : (
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
                if (video.videoWidth <= 0 || video.videoHeight <= 0) {
                  setMediaError("El video no informa dimensiones válidas para editar.");
                  return;
                }
                setSourceWidth(video.videoWidth);
                setSourceHeight(video.videoHeight);
                setDuration(Number.isFinite(video.duration) ? video.duration : 0);
                setCurrentTime(video.currentTime || 0);
                setMediaError(null);
              }}
              onLoadedData={requestPreviewRedraw}
              onSeeked={requestPreviewRedraw}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onError={() => setMediaError("No se pudo reproducir este video para seleccionar el encuadre.")}
            />
          )}

          {viewportRect && (
            <>
              <div
                className={styles.viewportFrame}
                style={{
                  left: viewportRect.left,
                  top: viewportRect.top,
                  width: viewportRect.width,
                  height: viewportRect.height,
                }}
                aria-hidden="true"
              >
                {showGuides && (
                  <>
                    <span className={`${enhancementStyles.viewportGuideVertical} ${enhancementStyles.viewportGuideOne}`} />
                    <span className={`${enhancementStyles.viewportGuideVertical} ${enhancementStyles.viewportGuideTwo}`} />
                    <span className={`${enhancementStyles.viewportGuideHorizontal} ${enhancementStyles.viewportGuideThree}`} />
                    <span className={`${enhancementStyles.viewportGuideHorizontal} ${enhancementStyles.viewportGuideFour}`} />
                  </>
                )}
                {!freeResizeEnabled && (
                  <>
                    <span className={`${styles.viewportCorner} ${styles.viewportCornerTopLeft}`} />
                    <span className={`${styles.viewportCorner} ${styles.viewportCornerTopRight}`} />
                    <span className={`${styles.viewportCorner} ${styles.viewportCornerBottomLeft}`} />
                    <span className={`${styles.viewportCorner} ${styles.viewportCornerBottomRight}`} />
                  </>
                )}
              </div>

              {freeResizeEnabled && RESIZE_HANDLES.map((handle) => {
                const position = resizeHandlePosition(handle, viewportRect);
                return (
                  <button
                    key={handle}
                    type="button"
                    className={styles.viewportResizeHandle}
                    data-resize-handle={handle}
                    disabled={disabled}
                    aria-label={`Redimensionar recorte desde ${handleLabel(handle)}`}
                    title="Arrastra para cambiar libremente el tamaño del recorte"
                    style={{
                      left: position.left,
                      top: position.top,
                      cursor: disabled ? "not-allowed" : position.cursor,
                      opacity: disabled ? 0.48 : 1,
                    }}
                    onPointerDown={startResize}
                    onPointerMove={moveResize}
                    onPointerUp={finishResize}
                    onPointerCancel={cancelResize}
                    onKeyDown={handleResizeKey}
                  >
                    <span aria-hidden="true" />
                  </button>
                );
              })}

              <button
                type="button"
                className={styles.viewportMoveHandle}
                style={{
                  left: viewportRect.left + viewportRect.width / 2,
                  top: viewportRect.top + viewportRect.height / 2,
                }}
                disabled={disabled}
                aria-label={`Mover el área visible de ${kind === "image" ? "la imagen" : "el video"}`}
                title="Arrastra para elegir qué zona será visible"
                onPointerDown={startViewportDrag}
                onPointerMove={moveViewportDrag}
                onPointerUp={finishViewportDrag}
                onPointerCancel={cancelViewportDrag}
                onKeyDown={handleViewportKey}
              >
                <Move size={19} aria-hidden="true" />
              </button>
            </>
          )}

          {kind === "video" && (
            <button
              type="button"
              className={`${styles.centerPlay} ${viewportRect ? styles.centerPlayViewport : ""}`}
              onClick={togglePlayback}
              aria-label={playing ? "Pausar video" : "Reproducir video"}
            >
              {playing ? <Pause size={22} aria-hidden="true" /> : <Play size={22} aria-hidden="true" />}
            </button>
          )}
        </div>

        <aside className={styles.viewportPanel} aria-label="Área visible del recurso">
          <div className={styles.viewportPanelHeading}>
            <div>
              <span>ENCUADRE · {currentAspectSummary}</span>
              <strong>Elige qué parte se verá</strong>
            </div>
            <small>
              {aspectLocked
                ? "El archivo físico permanece intacto. Este destino guarda únicamente posición, zoom y su relación obligatoria."
                : "El archivo físico permanece intacto. Puedes elegir una relación o usar Libre para redimensionar el marco con bordes y esquinas."}
            </small>
          </div>

          <div className={styles.viewportPositionGrid}>
            <label>
              <span>Posición X</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round(viewportDraft.x * 100)}
                disabled={disabled}
                onChange={(event) => commitViewport({
                  ...viewportDraft,
                  x: clamp(Number(event.target.value) / 100, 0, 1),
                })}
              />
            </label>
            <label>
              <span>Posición Y</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round(viewportDraft.y * 100)}
                disabled={disabled}
                onChange={(event) => commitViewport({
                  ...viewportDraft,
                  y: clamp(Number(event.target.value) / 100, 0, 1),
                })}
              />
            </label>
          </div>

          <label className={styles.viewportControl}>
            <span>
              Zoom
              <strong>{Math.round(viewportDraft.zoom * 100)}%</strong>
            </span>
            <input
              type="range"
              min={MIN_PREVIEW_VIEWPORT_ZOOM * 100}
              max={MAX_PREVIEW_VIEWPORT_ZOOM * 100}
              step="5"
              value={Math.round(viewportDraft.zoom * 100)}
              disabled={disabled}
              onChange={(event) => commitViewport({
                ...viewportDraft,
                zoom: Number(event.target.value) / 100,
              })}
            />
          </label>

          <label className={styles.viewportControl}>
            <span>{aspectLocked ? "Relación del encuadre · obligatoria" : "Relación del encuadre"}</span>
            <select
              value={viewportDraft.aspect}
              disabled={disabled || aspectLocked}
              aria-label={aspectLocked
                ? `Relación obligatoria ${requiredAspect}`
                : "Elegir relación del encuadre"}
              onChange={(event) => changeAspect(event.target.value as PreviewViewportAspectId)}
            >
              {aspectLocked && requiredAspect ? (
                <option value={requiredAspect}>{lockedAspectLabel}</option>
              ) : (
                availableAspects.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))
              )}
            </select>
          </label>

          {freeResizeEnabled && (
            <small style={{ color: "var(--text-muted, #94a3b8)", fontSize: 11, lineHeight: 1.45 }}>
              Modo libre activo: arrastra cualquiera de las cuatro esquinas o de los cuatro bordes. El marco nunca sale del archivo y respeta el zoom máximo del editor.
            </small>
          )}

          <div className={`${styles.viewportPresets} ${enhancementStyles.viewportPresetGrid}`} aria-label="Posiciones rápidas de encuadre">
            {POSITION_PRESETS.map((preset) => (
              <button
                key={preset.title}
                type="button"
                disabled={disabled}
                aria-label={preset.title}
                title={preset.title}
                onClick={() => quickViewport(preset.x, preset.y)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={enhancementStyles.viewportGuideToggle}
            data-active={showGuides}
            aria-pressed={showGuides}
            disabled={disabled}
            onClick={() => setShowGuides((value) => !value)}
          >
            Guía de tercios {showGuides ? "activa" : "oculta"}
          </button>

          <button type="button" className={styles.viewportReset} disabled={disabled} onClick={resetViewport}>
            <RotateCcw size={15} aria-hidden="true" />
            Restablecer encuadre
          </button>

          <div className={styles.viewportResult}>
            <span>Resultado final · {kind === "image" ? "imagen" : "fotograma actual"}</span>
            <div>
              {kind === "image" && resultPreviewSize && sourceCrop ? (
                <div
                  style={{
                    position: "relative",
                    flex: "none",
                    width: `min(100%, ${resultPreviewSize.width}px)`,
                    aspectRatio: `${sourceCrop.width} / ${sourceCrop.height}`,
                    overflow: "hidden",
                    borderRadius: 7,
                    background: "#000",
                  }}
                  data-preview-aspect={currentAspectSummary}
                  role="img"
                  aria-label="Vista previa exacta del área visible elegida"
                >
                  <GameMedia
                    src={src}
                    alt=""
                    sizes="320px"
                    viewport={{
                      x: viewportDraft.x,
                      y: viewportDraft.y,
                      zoom: viewportDraft.zoom,
                    }}
                  />
                </div>
              ) : (
                <canvas ref={resultCanvasRef} role="img" aria-label="Vista previa del área visible elegida">
                  Vista previa del encuadre seleccionado.
                </canvas>
              )}
            </div>
            <small>
              {kind === "image"
                ? "Esta previsualización usa exactamente el mismo renderer de imagen que la web pública. Marco, resultado y publicación comparten posición y zoom."
                : "El fotograma usa la misma ventana matemática que se guardará para este destino. Los presets cambian sólo la posición; el zoom permanece bajo tu control."}
            </small>
          </div>
        </aside>
      </div>

      <div className={styles.sourceRow}>
        <span>{sourceLabel}</span>
        <strong>
          {sourceWidth > 0 && sourceHeight > 0
            ? kind === "image"
              ? `${sourceWidth}×${sourceHeight} · ${currentAspectSummary}`
              : `${Math.round(currentTime * 10) / 10}s / ${Math.round(duration * 10) / 10}s · ${currentAspectSummary}`
            : "Cargando recurso…"}
        </strong>
      </div>

      {kind === "video" && (
        <div className={enhancementStyles.videoViewportTransport} aria-label="Navegación del video para revisar el encuadre">
          <button
            type="button"
            disabled={disabled || duration <= 0}
            onClick={() => seekVideoBy(-5)}
          >
            <RotateCcw size={14} aria-hidden="true" />
            5 s
          </button>
          <input
            type="range"
            min="0"
            max={Math.max(duration, 0)}
            step="0.05"
            value={Math.min(currentTime, duration || 0)}
            disabled={disabled || duration <= 0}
            aria-label="Posición del video"
            onChange={(event) => seekVideo(Number(event.currentTarget.value))}
          />
          <button
            type="button"
            disabled={disabled || duration <= 0}
            onClick={() => seekVideoBy(5)}
          >
            <RotateCw size={14} aria-hidden="true" />
            5 s
          </button>
        </div>
      )}

      {mediaError ? (
        <div className={styles.error} role="alert">{mediaError}</div>
      ) : (
        <p className={styles.help}>
          Modo de encuadre: sólo se guarda metadata visual. No se crea otra imagen, no se recodifica el WebM y no se modifica el archivo original.
        </p>
      )}
    </div>
  );
}
