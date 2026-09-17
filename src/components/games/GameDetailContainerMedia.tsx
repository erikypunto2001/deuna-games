"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import FramedVideo from "@/components/ui/FramedVideo";
import GameMedia from "@/components/ui/GameMedia";
import { normalizeGameImageViewport } from "@/lib/media/image-viewport";
import { normalizeGameVideoViewport } from "@/lib/media/game-video-media";
import type {
  GameDestinationMediaMode,
  GameDetailVideo,
  GameImageViewport,
} from "@/types/game";

import styles from "./GameDetailContainerMedia.module.css";

const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";

type Props = {
  mode: GameDestinationMediaMode;
  imageSrc?: string;
  imageViewport?: GameImageViewport;
  video?: GameDetailVideo;
};

export default function GameDetailContainerMedia({
  mode,
  imageSrc,
  imageViewport,
  video,
}: Props) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [failedVideo, setFailedVideo] = useState<string | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia(REDUCED_MOTION_MEDIA);
    const syncMedia = () => setReducedMotion(reduced.matches);
    const syncVisibility = () => setDocumentVisible(!document.hidden);

    syncMedia();
    syncVisibility();
    reduced.addEventListener("change", syncMedia);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      reduced.removeEventListener("change", syncMedia);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  const normalizedImageViewport = useMemo(
    () => normalizeGameImageViewport(imageViewport),
    [imageViewport]
  );
  const normalizedVideoViewport = useMemo(
    () => normalizeGameVideoViewport(video?.viewport),
    [video?.viewport]
  );

  const videoConfirmed = Boolean(
    video?.clip &&
      video.viewport.confirmed === true &&
      video.viewport.aspect === "source"
  );
  const videoEnabled = Boolean(
    mode === "video" &&
      videoConfirmed &&
      !reducedMotion &&
      documentVisible &&
      failedVideo !== video?.clip
  );

  return (
    <div className={styles.root} aria-hidden="true">
      {imageSrc && (
        <div className={styles.imageLayer}>
          <GameMedia
            src={imageSrc}
            alt=""
            sizes="(max-width: 760px) 100vw, 1400px"
            viewport={normalizedImageViewport}
          />
        </div>
      )}

      {videoEnabled && video?.clip && (
        <FramedVideo
          key={video.clip}
          src={video.clip}
          viewport={normalizedVideoViewport}
          className={styles.videoLayer}
          autoPlay
          loop
          controls={false}
          preload="metadata"
          tabIndex={-1}
          onError={() => setFailedVideo(video.clip)}
          frameStyle={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
            background: "transparent",
          }}
        />
      )}
    </div>
  );
}
