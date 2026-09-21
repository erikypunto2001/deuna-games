"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import GameMedia from "@/components/ui/GameMedia";
import { normalizeGameImageViewport } from "@/lib/media/image-viewport";
import { resolveGameBackgroundMediaMode } from "@/lib/media/game-media-requirements";
import { normalizeGameVideoViewport } from "@/lib/media/game-video-media";
import type { Game, GameImageViewport, GameVideoViewport } from "@/types/game";

import styles from "./GameDetailBackgroundMedia.module.css";

const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";

type OverrideProps = {
  mode: "image" | "video";
  imageSrc?: string | null;
  imageViewport?: GameImageViewport | null;
  videoSrc?: string | null;
  videoViewport?: GameVideoViewport | null;
};

type Props =
  | {
      game: Game;
      override?: never;
      sizes?: string;
      className?: string;
      mobilePreview?: boolean;
    }
  | {
      game?: never;
      override: OverrideProps;
      sizes?: string;
      className?: string;
      mobilePreview?: boolean;
    };

function mediaStyle(x: number, y: number, zoom: number) {
  const position = `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`;
  return {
    "--game-background-position": position,
    "--game-background-zoom": zoom,
  } as CSSProperties;
}

export default function GameDetailBackgroundMedia({
  game,
  override,
  sizes = "100vw",
  className,
  mobilePreview = false,
}: Props) {
  const mode = override?.mode ?? (game ? resolveGameBackgroundMediaMode(game) : null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [failedVideo, setFailedVideo] = useState<string | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia(REDUCED_MOTION_MEDIA);
    const sync = () => setMotionAllowed(!reduced.matches);
    const syncVisibility = () => setDocumentVisible(!document.hidden);

    sync();
    syncVisibility();
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  const imageSrc = override?.imageSrc ?? game?.backgroundImage ?? null;
  const imageViewportSource = override?.imageViewport ?? game?.imageMedia?.background;
  const videoSrc = override?.videoSrc ?? game?.videoMedia?.background?.clip ?? null;
  const videoViewportSource = override?.videoViewport ?? game?.videoMedia?.background?.viewport;

  const imageViewport = useMemo(
    () => normalizeGameImageViewport(imageViewportSource ?? undefined),
    [imageViewportSource]
  );
  const videoViewport = useMemo(
    () => normalizeGameVideoViewport(videoViewportSource ?? undefined),
    [videoViewportSource]
  );

  const imageConfirmed = override
    ? Boolean(imageSrc)
    : Boolean(imageSrc && game?.imageMedia?.background?.confirmed === true);
  const videoConfirmed = override
    ? Boolean(videoSrc)
    : Boolean(
        videoSrc &&
          game?.videoMedia?.background?.viewport.confirmed === true &&
          game?.videoMedia?.background?.viewport.aspect === "source"
      );

  const videoEnabled = Boolean(
    mode === "video" &&
      videoConfirmed &&
      motionAllowed &&
      documentVisible &&
      failedVideo !== videoSrc
  );
  const imageEnabled = Boolean(imageConfirmed);
  const hasVisibleMedia = imageEnabled || videoEnabled;

  if (!mode || !hasVisibleMedia) return null;

  return (
    <div
      className={`${styles.backdrop} ${mobilePreview ? styles.mobilePreview : ""} ${className ?? ""}`}
      aria-hidden="true"
      data-game-detail-background-media="true"
    >
      {imageEnabled && imageSrc && (
        <div className={styles.imageLayer}>
          <GameMedia
            src={imageSrc}
            alt=""
            sizes={sizes}
            viewport={imageViewport}
          />
        </div>
      )}

      {videoEnabled && videoSrc && (
        <span className={styles.videoLayer} style={mediaStyle(
          videoViewport.x,
          videoViewport.y,
          videoViewport.zoom
        )}>
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
