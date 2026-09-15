"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import IsolatedPublicPreviewFrame from "@/components/admin/IsolatedPublicPreviewFrame";
import HeroSection from "@/components/home/HeroSection";
import PublicPageBackground, {
  type PublicPageBackgroundProps,
} from "@/components/site/PublicPageBackground";
import type {
  HomeHeroDevice,
  HomeHeroPresentation,
} from "@/data/home-config";
import {
  clampHomeHeroViewport,
  homeHeroDeviceForWidth,
  HOME_HERO_VIEWPORT_DEFAULTS,
  type HomeHeroViewport,
} from "@/lib/home/hero-devices";
import { resolveHeroDeviceDesign } from "@/lib/home/hero-device-design";
import type { Game } from "@/types/game";

import styles from "./HomeHeroEditor.module.css";

function browserViewportSnapshot() {
  if (typeof window === "undefined") return "";
  const width = document.documentElement.clientWidth || window.innerWidth;
  const height = document.documentElement.clientHeight || window.innerHeight;
  return `${width}:${height}`;
}

function serverViewportSnapshot() {
  return "";
}

function subscribeBrowserViewport(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function parseViewportSnapshot(
  snapshot: string
): HomeHeroViewport | null {
  if (!snapshot) return null;
  const [rawWidth, rawHeight] = snapshot.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  return Number.isFinite(width) && Number.isFinite(height)
    ? { width, height }
    : null;
}

/** Same renderer and viewport contract as the public Home. */
export default function HomeHeroLivePreview({
  games,
  presentation,
  device,
  playing,
  background,
  showSpacingGuide = false,
  onNavigationPositionChange,
}: {
  games: Game[];
  presentation: HomeHeroPresentation;
  device: HomeHeroDevice;
  playing: boolean;
  onSelectPosition?: () => void;
  onNavigationPositionChange?: (x: number, y: number) => void;
  background?: Omit<
    PublicPageBackgroundProps,
    "children" | "previewPathname"
  >;
  showSpacingGuide?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const lastPlaybackKey = useRef<string | null>(null);
  const [previewEnd, setPreviewEnd] =
    useState<HTMLDivElement | null>(null);
  const [contentEnd, setContentEnd] = useState<number | null>(null);
  const [availableWidth, setAvailableWidth] = useState(
    HOME_HERO_VIEWPORT_DEFAULTS.desktop.width
  );

  const browserSnapshot = useSyncExternalStore(
    subscribeBrowserViewport,
    browserViewportSnapshot,
    serverViewportSnapshot
  );
  const browserViewport = parseViewportSnapshot(browserSnapshot);
  const browserDevice = browserViewport
    ? homeHeroDeviceForWidth(browserViewport.width)
    : null;
  const followsBrowserViewport = Boolean(
    browserViewport && browserDevice === device
  );
  const selectedViewport =
    followsBrowserViewport && browserViewport
      ? clampHomeHeroViewport(device, browserViewport)
      : HOME_HERO_VIEWPORT_DEFAULTS[device];
  const { width, height } = selectedViewport;
  const scale = Math.min(1, availableWidth / width);
  const effectivePresentation = presentation;
  const devicePresentation = resolveHeroDeviceDesign(
    effectivePresentation,
    device
  );
  const previewGeometryKey = JSON.stringify({
    device,
    composition: devicePresentation.composition,
    direction: devicePresentation.direction,
    responsive: devicePresentation.responsive[device],
    positions: devicePresentation.positions,
  });
  const playbackKey = `${device}:${presentation.motionStyle}:${games
    .map((game) => game.id)
    .join(",")}`;

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(entry.contentRect.width)
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const marker = previewEnd;
    const view = marker?.ownerDocument.defaultView;
    if (!marker || !view) return;

    let frame = 0;
    const measure = () => {
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => {
        const next = Math.max(
          1,
          Math.ceil(
            marker.getBoundingClientRect().top + view.scrollY
          )
        );
        setContentEnd((current) =>
          current === next ? current : next
        );
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(marker.parentElement ?? marker);
    view.addEventListener("resize", measure);

    return () => {
      view.cancelAnimationFrame(frame);
      observer.disconnect();
      view.removeEventListener("resize", measure);
    };
  }, [
    games.length,
    height,
    effectivePresentation,
    previewEnd,
    showSpacingGuide,
    width,
  ]);

  const replayTransition = useCallback(() => {
    const previewRoot = previewEnd?.parentElement;
    if (!previewRoot) return false;
    const next = previewRoot.querySelector<HTMLButtonElement>(
      'button[aria-label="Juego siguiente"]:not(:disabled)'
    );
    const previous = previewRoot.querySelector<HTMLButtonElement>(
      'button[aria-label="Juego anterior"]:not(:disabled)'
    );
    const target = next ?? previous;
    if (!target) return false;
    target.click();
    return true;
  }, [previewEnd]);

  useEffect(() => {
    if (!playing) {
      lastPlaybackKey.current = null;
      return;
    }
    if (
      !previewEnd ||
      lastPlaybackKey.current === playbackKey
    ) {
      return;
    }

    lastPlaybackKey.current = playbackKey;
    const view = previewEnd.ownerDocument.defaultView;
    if (!view) return;

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = view.requestAnimationFrame(() => {
      secondFrame = view.requestAnimationFrame(() =>
        replayTransition()
      );
    });

    return () => {
      view.cancelAnimationFrame(firstFrame);
      view.cancelAnimationFrame(secondFrame);
    };
  }, [playing, playbackKey, previewEnd, replayTransition]);

  const responsive = devicePresentation.responsive[device];
  const visiblePreviewHeight =
    contentEnd !== null ? Math.min(height, contentEnd) : height;

  const hero = (
    <main className="main-content">
      {games.length ? (
        <>
          <HeroSection
            key={previewGeometryKey}
            games={games}
            presentation={effectivePresentation}
            autoplaySuspended={!playing}
            navigationEditor={
              !playing && onNavigationPositionChange
                ? {
                    device,
                    onPositionChange: onNavigationPositionChange,
                  }
                : undefined
            }
          />
          {showSpacingGuide && (
            <div
              aria-hidden="true"
              style={{
                borderTop:
                  "1px dashed color-mix(in srgb, var(--brand) 68%, rgba(255,255,255,.35))",
                color:
                  "color-mix(in srgb, var(--brand) 78%, #fff)",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: ".04em",
                padding: "10px 0 8px",
              }}
            >
              COMIENZO DE LA SIGUIENTE SECCIÓN · separación inferior{" "}
              {responsive.spaceAfter}px
            </div>
          )}
        </>
      ) : (
        <p role="status">
          No hay juegos públicos para mostrar con esta selección.
        </p>
      )}
      <div
        ref={setPreviewEnd}
        aria-hidden="true"
        style={{ height: 0, pointerEvents: "none" }}
      />
    </main>
  );

  const previewContent = background ? (
    <PublicPageBackground {...background} previewPathname="/">
      {hero}
    </PublicPageBackground>
  ) : (
    hero
  );
  const motionLabel =
    presentation.motionStyle === "momentum"
      ? "Momentum"
      : presentation.motionStyle === "morph"
        ? "Morph"
        : "Parallax Sweep";
  const deviceLabel =
    device === "mobile"
      ? "Móvil"
      : device === "tablet"
        ? "Tableta"
        : "Escritorio";

  return (
    <div ref={container} className={styles.livePreview}>
      <div className={styles.previewToolbar}>
        <p className={styles.help}>
          {playing
            ? "Prueba interactiva"
            : "Vista real · avance automático detenido para editar"}
          {" · "}
          {deviceLabel} {Math.round(width)} × {Math.round(height)} px
          {followsBrowserViewport
            ? " · sincronizado con tu ventana"
            : " · viewport recomendado"}
        </p>
        <div>
          <span role="status">
            Movimiento global {motionLabel}: se aplica a escritorio,
            tableta y móvil. Guardar conserva el borrador; los cambios
            editoriales que hagas aquí llegan a la Home pública sólo al
            publicar Inicio.
          </span>
          {playing && games.length > 1 && (
            <button
              type="button"
              className={styles.breakpoint}
              onClick={replayTransition}
            >
              Repetir movimiento ahora
            </button>
          )}
        </div>
      </div>
      <div
        style={{
          height: visiblePreviewHeight * scale,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <IsolatedPublicPreviewFrame
          width={width}
          height={height}
          scale={scale}
          title={`Hero real en ${
            device === "mobile"
              ? "móvil"
              : device === "tablet"
                ? "tableta"
                : "escritorio"
          }`}
        >
          {previewContent}
        </IsolatedPublicPreviewFrame>
      </div>
    </div>
  );
}