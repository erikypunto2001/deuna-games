"use client";

import {
  useEffect,
  useState,
} from "react";

import FramedVideo from "@/components/ui/FramedVideo";
import GameMedia from "@/components/ui/GameMedia";
import { DEFAULT_PREVIEW_VIEWPORT } from "@/lib/media/preview-video-policy";
import type {
  GameImageViewport,
  GameVideoViewport,
} from "@/types/game";

import styles from "./HoverPreviewMedia.module.css";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type HoverPreviewMediaProps = {
  imageSrc?: string;
  imageAlt: string;
  imageViewport?: GameImageViewport;
  sizes: string;
  fallbackClassName?: string;
  previewClip?: string;
  previewViewport?: GameVideoViewport;
  active: boolean;
  unscaledVideo?: boolean;
};

type PreviewVideoProps = {
  src: string;
  viewport: GameVideoViewport;
  unscaled: boolean;
};

function PreviewVideo({
  src,
  viewport,
  unscaled,
}: PreviewVideoProps) {
  const [playbackAllowed, setPlaybackAllowed] = useState(false);
  const [playing, setPlaying] = useState(false);

  function ensurePlayback(video: HTMLVideoElement) {
    requestAnimationFrame(() => {
      if (!video.isConnected || !video.paused) return;

      void video.play().catch(() => {
        setPlaying(false);
      });
    });
  }

  useEffect(() => {
    const motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const syncPlaybackPolicy = () => {
      const allowed = !document.hidden && !motionQuery.matches;
      setPlaybackAllowed(allowed);
      if (!allowed) setPlaying(false);
    };

    syncPlaybackPolicy();
    document.addEventListener(
      "visibilitychange",
      syncPlaybackPolicy
    );
    motionQuery.addEventListener(
      "change",
      syncPlaybackPolicy
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        syncPlaybackPolicy
      );
      motionQuery.removeEventListener(
        "change",
        syncPlaybackPolicy
      );
    };
  }, []);

  if (!playbackAllowed) return null;

  return (
    <FramedVideo
      className={`${styles.video} ${unscaled ? styles.videoUnscaled : ""} ${playing ? styles.videoReady : ""}`}
      src={src}
      viewport={viewport}
      muted
      loop
      autoPlay
      controls={false}
      preload="none"
      tabIndex={-1}
      onCanPlay={unscaled ? (event) => ensurePlayback(event.currentTarget) : undefined}
      onPlaying={() => setPlaying(true)}
      onWaiting={() => setPlaying(false)}
      onStalled={() => setPlaying(false)}
      onError={() => setPlaying(false)}
    />
  );
}

export default function HoverPreviewMedia({
  imageSrc,
  imageAlt,
  imageViewport,
  sizes,
  fallbackClassName,
  previewClip,
  previewViewport = DEFAULT_PREVIEW_VIEWPORT,
  active,
  unscaledVideo = false,
}: HoverPreviewMediaProps) {
  return (
    <>
      <GameMedia
        src={imageSrc}
        alt={imageAlt}
        viewport={imageViewport}
        sizes={sizes}
        fallbackClassName={fallbackClassName}
      />

      {active && previewClip && (
        <PreviewVideo
          key={`${previewClip}:${previewViewport.x}:${previewViewport.y}:${previewViewport.zoom}:${previewViewport.aspect}`}
          src={previewClip}
          viewport={previewViewport}
          unscaled={unscaledVideo}
        />
      )}
    </>
  );
}
