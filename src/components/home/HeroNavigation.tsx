"use client";

import { Move, Pause, Play } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useRef,
  useState,
} from "react";

import touchStyles from "@/components/ui/TouchTarget.module.css";
import type {
  HomeHeroDevice,
  HomeHeroNavigationConfig,
} from "@/data/home-config";
import type { Game } from "@/types/game";

import styles from "./HeroNavigation.module.css";
import pauseFallbackStyles from "./HeroPauseFallback.module.css";

export type HeroNavigationEditor = {
  device: HomeHeroDevice;
  onPositionChange: (x: number, y: number) => void;
};

type DragState = {
  pointerId: number;
  x: number;
  y: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  border: 0,
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
};

export default function HeroNavigation({
  games,
  activeIndex,
  config,
  autoplayDelay,
  isPaused,
  manualPaused,
  atAutoplayEnd,
  onSelect,
  onTogglePause,
  editor,
}: {
  games: Game[];
  activeIndex: number;
  config: HomeHeroNavigationConfig;
  autoplayDelay: number | null;
  isPaused: boolean;
  manualPaused: boolean;
  atAutoplayEnd: boolean;
  onSelect: (index: number) => void;
  onTogglePause: () => void;
  editor?: HeroNavigationEditor;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const placement = editor ? config.responsive[editor.device] : null;
  const integratedProgress =
    config.showIndicators &&
    (config.style === "integrated" || config.style === "timeline");
  const pauseViaProgress = !config.showPause && autoplayDelay !== null;
  const progressVisible =
    autoplayDelay !== null && (config.showProgress || pauseViaProgress);
  const pauseVisible = config.showPause && autoplayDelay !== null;
  const activeGame = games[activeIndex];
  const announceSlideChanges = isPaused;
  const pauseLabel = manualPaused
    ? "Reanudar carrusel automático"
    : "Pausar carrusel automático";

  const navigationStyle = drag
    ? ({ left: `${drag.x}%`, top: `${drag.y}%` } as CSSProperties)
    : undefined;

  const positionFromPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const section = rootRef.current?.closest("section");
    if (!section) return null;
    const rect = section.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp(
        Math.round(((event.clientX - rect.left) / rect.width) * 100),
        0,
        100
      ),
      y: clamp(
        Math.round(((event.clientY - rect.top) / rect.height) * 100),
        0,
        100
      ),
    };
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!editor || !placement || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, x: placement.x, y: placement.y });
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!editor || !drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const next = positionFromPointer(event);
    if (next) setDrag({ pointerId: event.pointerId, ...next });
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!editor || !drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const finalPosition = positionFromPointer(event) ?? drag;
    editor.onPositionChange(finalPosition.x, finalPosition.y);
    setDrag(null);
  };

  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!editor || !placement) return;
    const amount = event.shiftKey ? 5 : 1;
    let { x, y } = placement;
    if (event.key === "ArrowLeft") x -= amount;
    else if (event.key === "ArrowRight") x += amount;
    else if (event.key === "ArrowUp") y -= amount;
    else if (event.key === "ArrowDown") y += amount;
    else return;
    event.preventDefault();
    event.stopPropagation();
    editor.onPositionChange(clamp(x, 0, 100), clamp(y, 0, 100));
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.navigation} ${touchStyles.heroNavigation}`}
      data-hero-spacing-boundary="navigation"
      data-style={config.style}
      data-editor={editor ? "true" : undefined}
      data-paused={isPaused || atAutoplayEnd ? "true" : undefined}
      data-pause-control={
        autoplayDelay === null
          ? undefined
          : config.showPause
            ? "button"
            : "progress"
      }
      style={navigationStyle}
    >
      <span
        style={visuallyHiddenStyle}
        aria-live={announceSlideChanges ? "polite" : "off"}
        aria-atomic="true"
      >
        {activeGame
          ? `${activeIndex + 1} de ${games.length}: ${activeGame.title}`
          : ""}
      </span>

      {editor && (
        <button
          type="button"
          className={styles.dragHandle}
          aria-label="Mover controles del carrusel. Arrastra o usa las flechas del teclado."
          title="Arrastra para mover · Shift + flechas mueve 5%"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={(event) => {
            event.stopPropagation();
            setDrag(null);
          }}
          onKeyDown={moveWithKeyboard}
        >
          <Move size={14} aria-hidden="true" />
        </button>
      )}

      {config.showIndicators && (
        <div className={styles.indicators} aria-label="Elegir juego del carrusel">
          {games.map((game, index) => {
            const active = index === activeIndex;
            const indicatorPauses =
              active && integratedProgress && pauseViaProgress;
            return (
              <button
                key={game.id}
                type="button"
                className={`${styles.indicator} ${active ? styles.indicatorActive : ""}`}
                aria-label={indicatorPauses ? pauseLabel : `Mostrar ${game.title}`}
                aria-current={active ? "true" : undefined}
                aria-pressed={indicatorPauses ? manualPaused : undefined}
                onClick={() =>
                  indicatorPauses ? onTogglePause() : onSelect(index)
                }
              >
                {active && integratedProgress && progressVisible && (
                  <span
                    key={`${game.id}-${activeIndex}-${autoplayDelay}`}
                    className={styles.integratedProgress}
                    style={{
                      animationDuration: `${autoplayDelay}ms`,
                      animationPlayState:
                        isPaused || atAutoplayEnd ? "paused" : "running",
                    }}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {pauseVisible && (
        <button
          type="button"
          className={styles.pauseButton}
          aria-label={pauseLabel}
          aria-pressed={manualPaused}
          onClick={onTogglePause}
        >
          {manualPaused ? (
            <Play size={12} fill="currentColor" aria-hidden="true" />
          ) : (
            <Pause size={12} fill="currentColor" aria-hidden="true" />
          )}
        </button>
      )}

      {progressVisible && !integratedProgress &&
        (pauseViaProgress ? (
          <button
            type="button"
            className={pauseFallbackStyles.progressButton}
            aria-label={pauseLabel}
            aria-pressed={manualPaused}
            onClick={onTogglePause}
          >
            <div className={styles.progress} aria-hidden="true">
              <span
                key={`${activeIndex}-${autoplayDelay}`}
                className={styles.progressBar}
                style={{
                  animationDuration: `${autoplayDelay}ms`,
                  animationPlayState:
                    isPaused || atAutoplayEnd ? "paused" : "running",
                }}
              />
            </div>
          </button>
        ) : (
          <div className={styles.progress} aria-hidden="true">
            <span
              key={`${activeIndex}-${autoplayDelay}`}
              className={styles.progressBar}
              style={{
                animationDuration: `${autoplayDelay}ms`,
                animationPlayState:
                  isPaused || atAutoplayEnd ? "paused" : "running",
              }}
            />
          </div>
        ))}
    </div>
  );
}
