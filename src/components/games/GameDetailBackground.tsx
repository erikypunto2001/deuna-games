"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import GameMedia from "@/components/ui/GameMedia";
import { normalizeGameImageViewport } from "@/lib/media/image-viewport";
import {
  resolveGameBackgroundMediaMode,
} from "@/lib/media/game-media-requirements";
import { normalizeGameVideoViewport } from "@/lib/media/game-video-media";
import type { Game } from "@/types/game";

import styles from "./GameDetailBackground.module.css";

const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";

type Props = {
  game: Game | null | undefined;
  children: ReactNode;
};

function mediaStyle(x: number, y: number, zoom: number) {
  const position = `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`;
  return {
    "--game-background-position": position,
    "--game-background-zoom": zoom,
  } as CSSProperties;
}

export default function GameDetailBackground({ game, children }: Props) {
  const mode = game ? resolveGameBackgroundMediaMode(game) : null;
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

  const video = game?.videoMedia?.background;
  const videoEnabled = Boolean(
    mode === "video" &&
      video?.clip &&
      video.viewport.confirmed === true &&
      video.viewport.aspect === "source" &&
      motionAllowed &&
      documentVisible &&
      failedVideo !== video.clip
  );
  const imageEnabled = Boolean(
    game?.backgroundImage &&
      game.imageMedia?.background?.confirmed === true
  );
  const hasVisibleOverride = imageEnabled || videoEnabled;

  const imageViewport = useMemo(
    () => normalizeGameImageViewport(game?.imageMedia?.background),
    [game?.imageMedia?.background]
  );
  const videoViewport = useMemo(
    () => normalizeGameVideoViewport(video?.viewport),
    [video?.viewport]
  );
  const videoInlineStyle = mediaStyle(
    videoViewport.x,
    videoViewport.y,
    videoViewport.zoom
  );

  if (!game || !mode) return <>{children}</>;

  return (
    <div className={styles.root}>
      {hasVisibleOverride && (
        <div className={styles.backdrop} aria-hidden="true">
          {imageEnabled && game.backgroundImage && (
            <div className={styles.imageLayer}>
              <GameMedia
                src={game.backgroundImage}
                alt=""
                sizes="100vw"
                viewport={imageViewport}
              />
            </div>
          )}

          {videoEnabled && video?.clip && (
            <span className={styles.videoLayer} style={videoInlineStyle}>
              <video
                key={video.clip}
                src={video.clip}
                className={styles.video}
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
                disablePictureInPicture
                disableRemotePlayback
                tabIndex={-1}
                onError={() => setFailedVideo(video.clip)}
              />
            </span>
          )}

          <span className={styles.colorWash} />
          <span className={styles.readabilityShade} />
        </div>
      )}

      <div className={styles.content}>{children}</div>
    </div>
  );
}
