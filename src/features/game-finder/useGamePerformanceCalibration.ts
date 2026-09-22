"use client";

import {
  useEffect,
  useState,
} from "react";

import type {
  GamePerformanceCalibration,
  GamePerformanceMetadata,
} from "@/types/game";

type PublishedPerformance = {
  calibration: GamePerformanceCalibration | null;
  metadata: GamePerformanceMetadata | null;
};

type CalibrationState = PublishedPerformance & {
  slug: string;
  loaded: boolean;
};

type CachedPublishedPerformance = {
  value: PublishedPerformance;
  loadedAt: number;
};

const PUBLIC_GAME_METADATA_CACHE_MS = 60_000;
const resolved = new Map<string, CachedPublishedPerformance>();
const pending = new Map<string, Promise<PublishedPerformance>>();

function parsePublishedCalibration(
  value: unknown
): GamePerformanceCalibration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const referenceFps = candidate.referenceFps;
  const ramGb = candidate.ramGb;
  const fpsCap = candidate.fpsCap;

  if (
    typeof referenceFps !== "number" ||
    !Number.isFinite(referenceFps) ||
    referenceFps <= 0 ||
    referenceFps > 1_000 ||
    typeof ramGb !== "number" ||
    !Number.isFinite(ramGb) ||
    ramGb <= 0 ||
    ramGb > 512
  ) {
    return null;
  }

  if (
    fpsCap !== undefined &&
    (
      typeof fpsCap !== "number" ||
      !Number.isFinite(fpsCap) ||
      fpsCap <= 0 ||
      fpsCap > 1_000 ||
      fpsCap < referenceFps
    )
  ) {
    return null;
  }

  return {
    referenceFps,
    ramGb,
    ...(typeof fpsCap === "number" ? { fpsCap } : {}),
  };
}

function parsePublishedMetadata(
  value: unknown
): GamePerformanceMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const source = candidate.source;
  const sourceLabel = candidate.sourceLabel;
  const measuredAt = candidate.measuredAt;
  const confidence = candidate.confidence;
  const allowedSources = new Set([
    "internal",
    "developer",
    "publisher",
    "community",
    "external",
  ]);
  const allowedConfidence = new Set(["low", "medium", "high"]);

  if (
    source !== undefined &&
    (typeof source !== "string" || !allowedSources.has(source))
  ) {
    return null;
  }
  if (
    sourceLabel !== undefined &&
    (
      typeof sourceLabel !== "string" ||
      sourceLabel.trim().length === 0 ||
      sourceLabel.length > 160
    )
  ) {
    return null;
  }
  if (
    measuredAt !== undefined &&
    (
      typeof measuredAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(measuredAt)
    )
  ) {
    return null;
  }
  if (
    confidence !== undefined &&
    (
      typeof confidence !== "string" ||
      !allowedConfidence.has(confidence)
    )
  ) {
    return null;
  }

  return {
    ...(typeof source === "string"
      ? { source: source as GamePerformanceMetadata["source"] }
      : {}),
    ...(typeof sourceLabel === "string" ? { sourceLabel } : {}),
    ...(typeof measuredAt === "string" ? { measuredAt } : {}),
    ...(typeof confidence === "string"
      ? { confidence: confidence as GamePerformanceMetadata["confidence"] }
      : {}),
  };
}

function emptyPublishedPerformance(): PublishedPerformance {
  return {
    calibration: null,
    metadata: null,
  };
}

function getFreshCachedPerformance(slug: string) {
  const cached = resolved.get(slug);
  if (
    !cached ||
    Date.now() - cached.loadedAt >= PUBLIC_GAME_METADATA_CACHE_MS
  ) {
    return null;
  }
  return cached.value;
}

function loadCalibration(
  slug: string
): Promise<PublishedPerformance> {
  const cached = getFreshCachedPerformance(slug);
  if (cached) {
    return Promise.resolve(cached);
  }

  const existing = pending.get(slug);
  if (existing) return existing;

  const request = fetch(
    `/api/games/${encodeURIComponent(slug)}/performance`,
    { cache: "no-store" }
  )
    .then(async (response) => {
      if (!response.ok) return emptyPublishedPerformance();

      const payload = await response.json() as {
        calibration?: unknown;
        metadata?: unknown;
      };

      const calibration = parsePublishedCalibration(payload.calibration);
      return {
        calibration,
        metadata: calibration
          ? parsePublishedMetadata(payload.metadata)
          : null,
      };
    })
    .catch(() => emptyPublishedPerformance())
    .then((performance) => {
      resolved.set(slug, {
        value: performance,
        loadedAt: Date.now(),
      });
      pending.delete(slug);
      return performance;
    });

  pending.set(slug, request);
  return request;
}

export function useGamePerformanceCalibration(
  slug: string
) {
  const cached = resolved.get(slug);
  const freshCached = getFreshCachedPerformance(slug);
  const [state, setState] = useState<CalibrationState>(() => ({
    slug,
    loaded: freshCached !== null,
    calibration: cached?.value.calibration ?? null,
    metadata: cached?.value.metadata ?? null,
  }));

  useEffect(() => {
    let active = true;
    let timer: number | null = null;

    async function refresh() {
      const performance = await loadCalibration(slug);
      if (!active) return;

      setState({
        slug,
        loaded: true,
        calibration: performance.calibration,
        metadata: performance.metadata,
      });

      timer = window.setTimeout(
        refresh,
        PUBLIC_GAME_METADATA_CACHE_MS
      );
    }

    void refresh();

    return () => {
      active = false;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [slug]);

  if (state.slug === slug) {
    return {
      calibration: state.calibration,
      metadata: state.metadata,
      loading: !state.loaded,
    };
  }

  const nextCached = getFreshCachedPerformance(slug);
  if (nextCached) {
    return {
      calibration: nextCached.calibration,
      metadata: nextCached.metadata,
      loading: false,
    };
  }

  return {
    calibration: null,
    metadata: null,
    loading: true,
  };
}
