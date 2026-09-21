"use client";

import {
  useState,
  useSyncExternalStore,
} from "react";

import HomeHeroLivePreview from "@/components/admin/HomeHeroLivePreview";
import type {
  HomeHeroDevice,
  HomeHeroPresentation,
} from "@/data/home-config";
import {
  homeHeroDeviceForWidth,
} from "@/lib/home/hero-devices";
import type { Game } from "@/types/game";

import styles from "./GameHeroDestinationPreview.module.css";

const DEVICE_OPTIONS: Array<{
  value: HomeHeroDevice;
  label: string;
}> = [
  { value: "desktop", label: "Escritorio" },
  { value: "tablet", label: "Tableta" },
  { value: "mobile", label: "Móvil" },
];

function subscribeViewport(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function browserDeviceSnapshot(): HomeHeroDevice {
  const width =
    document.documentElement.clientWidth ||
    window.innerWidth;
  return homeHeroDeviceForWidth(width);
}

function serverDeviceSnapshot(): HomeHeroDevice {
  return "desktop";
}

export default function GameHeroDestinationPreview({
  games,
  presentation,
}: {
  games: Game[];
  presentation: HomeHeroPresentation;
}) {
  const browserDevice = useSyncExternalStore(
    subscribeViewport,
    browserDeviceSnapshot,
    serverDeviceSnapshot
  );
  const [fixedDevice, setFixedDevice] =
    useState<HomeHeroDevice | null>(null);
  const device = fixedDevice ?? browserDevice;
  const activeLabel =
    DEVICE_OPTIONS.find((option) => option.value === device)
      ?.label ?? "Escritorio";

  return (
    <div
      className={styles.root}
      data-game-hero-responsive-preview="true"
    >
      <div
        className={styles.deviceSwitch}
        role="group"
        aria-label="Viewport del Hero público"
      >
        {DEVICE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            data-hero-preview-device-option={option.value}
            aria-pressed={device === option.value}
            onClick={() => setFixedDevice(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div
        className={styles.preview}
        data-hero-preview-device={device}
      >
        <div className={styles.previewMeta}>
          <strong>{activeLabel}</strong>
          <span>
            Renderer público real · avance del carrusel detenido
          </span>
        </div>
        <HomeHeroLivePreview
          games={games}
          presentation={presentation}
          device={device}
          playing={false}
          showToolbar={false}
        />
      </div>
    </div>
  );
}
