"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import GameMedia from "@/components/ui/GameMedia";
import {
  normalizeGameMediaMode,
} from "@/lib/media/game-media-mode-policy";
import {
  resolveGameBackgroundMediaMode,
} from "@/lib/media/game-media-requirements";
import {
  normalizeGameImageViewport,
} from "@/lib/media/image-viewport";
import {
  normalizeGameVideoViewport,
} from "@/lib/media/game-video-media";
import type {
  Game,
  GameDestinationMediaMode,
  GameImageViewport,
  GameVideoViewport,
} from "@/types/game";

import styles from "./GameDetailBackgroundMedia.module.css";

const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";

export type GameDetailBackgroundMediaPosition =
  | "fixed"
  | "contained";

export type GameDetailBackgroundMediaLayerProps = {
  mode: GameDestinationMediaMode | null;
  imageSrc?: string | null;
  imageViewport?: GameImageViewport | null;
  videoSrc?: string | null;
  videoViewport?: GameVideoViewport | null;
  requireConfirmed?: boolean;
  position?: GameDetailBackgroundMediaPosition;
  sizes?: string;
};

function mediaStyle(viewport: GameVideoViewport) {
  const position =
    `${(viewport.x * 100).toFixed(2)}% ${(viewport.y * 100).toFixed(2)}%`;

  return {
    "--game-background-position": position,
    "--game-background-zoom": viewport.zoom,
  } as CSSProperties;
}

export function GameDetailBackgroundMediaLayer({
  mode,
  imageSrc,
  imageViewport,
  videoSrc,
  videoViewport,
  requireConfirmed = true,
  position = "contained",
  sizes = "100vw",
}: GameDetailBackgroundMediaLayerProps) {
  const effectiveMode = mode
    ? normalizeGameMediaMode("background", mode)
    : null;
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [failedVideo, setFailedVideo] = useState<string | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia(REDUCED_MOTION_MEDIA);
    const syncMotion = () => setMotionAllowed(!reduced.matches);
    const syncVisibility = () => setDocumentVisible(!document.hidden);

    syncMotion();
    syncVisibility();
    reduced.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      reduced.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  const normalizedImageViewport = useMemo(
    () => normalizeGameImageViewport(imageViewport),
    [imageViewport]
  );
  const normalizedVideoViewport = useMemo(
    () => normalizeGameVideoViewport(videoViewport ?? undefined),
    [videoViewport]
  );

  const imageEnabled = Boolean(
    imageSrc &&
      (!requireConfirmed || imageViewport?.confirmed === true)
  );
  const videoEnabled = Boolean(
    effectiveMode === "video" &&
      videoSrc &&
      (!requireConfirmed ||
        (
          videoViewport?.confirmed === true &&
          videoViewport.aspect === "source"
        )) &&
      motionAllowed &&
      documentVisible &&
      failedVideo !== videoSrc
  );

  if (!effectiveMode || (!imageEnabled && !videoEnabled)) {
    return null;
  }

  return (
    <div
      className={`${styles.root} ${
        position === "fixed" ? styles.fixed : styles.contained
      }`}
      data-game-background-media="true"
      data-game-background-mode={effectiveMode}
      data-game-background-positioning={position}
      aria-hidden="true"
    >
      {imageEnabled && imageSrc && (
        <div className={styles.imageLayer}>
          <GameMedia
            src={imageSrc}
            alt=""
            sizes={sizes}
            viewport={normalizedImageViewport}
          />
        </div>
      )}

      {videoEnabled && videoSrc && (
        <span
          className={styles.videoLayer}
          style={mediaStyle(normalizedVideoViewport)}
        >
          <video
            key={videoSrc}
            src={videoSrc}
            className={styles.video}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            disablePictureInPicture
            disableRemotePlayback
            tabIndex={-1}
            onError={() => setFailedVideo(videoSrc)}
          />
        </span>
      )}

      <span className={styles.colorWash} />
      <span className={styles.readabilityShade} />
    </div>
  );
}

export default function GameDetailBackgroundMedia({
  game,
  position = "contained",
  sizes = "100vw",
}: {
  game: Game;
  position?: GameDetailBackgroundMediaPosition;
  sizes?: string;
}) {
  return (
    <GameDetailBackgroundMediaLayer
      mode={resolveGameBackgroundMediaMode(game)}
      imageSrc={game.backgroundImage}
      imageViewport={game.imageMedia?.background}
      videoSrc={game.videoMedia?.background?.clip}
      videoViewport={game.videoMedia?.background?.viewport}
      position={position}
      sizes={sizes}
    />
  );
}
