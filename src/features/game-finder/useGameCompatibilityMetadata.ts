"use client";

import {
  useEffect,
  useState,
} from "react";

import type {
  GameCompatibilityMetadata,
} from "@/types/game";

type CompatibilityState = {
  slug: string;
  loaded: boolean;
  metadata: GameCompatibilityMetadata | null;
};

type CachedCompatibilityMetadata = {
  value: GameCompatibilityMetadata | null;
  loadedAt: number;
};

const PUBLIC_GAME_METADATA_CACHE_MS = 60_000;
const resolved = new Map<string, CachedCompatibilityMetadata>();
const pending = new Map<string, Promise<GameCompatibilityMetadata | null>>();

function parsePublishedCompatibilityMetadata(
  value: unknown
): GameCompatibilityMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const status = candidate.status;
  const source = candidate.source;
  const verifiedAt = candidate.verifiedAt;
  const allowedStatus = new Set(["declared", "reviewed", "tested"]);
  const allowedSources = new Set([
    "developer",
    "publisher",
    "internal",
    "community",
    "external",
  ]);

  if (
    status !== undefined &&
    (typeof status !== "string" || !allowedStatus.has(status))
  ) {
    return null;
  }
  if (
    source !== undefined &&
    (typeof source !== "string" || !allowedSources.has(source))
  ) {
    return null;
  }
  if (
    verifiedAt !== undefined &&
    (
      typeof verifiedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)
    )
  ) {
    return null;
  }

  return {
    ...(typeof status === "string"
      ? { status: status as GameCompatibilityMetadata["status"] }
      : {}),
    ...(typeof source === "string"
      ? { source: source as GameCompatibilityMetadata["source"] }
      : {}),
    ...(typeof verifiedAt === "string" ? { verifiedAt } : {}),
  };
}

function getFreshCachedMetadata(slug: string) {
  const cached = resolved.get(slug);
  if (
    !cached ||
    Date.now() - cached.loadedAt >= PUBLIC_GAME_METADATA_CACHE_MS
  ) {
    return undefined;
  }
  return cached.value;
}

function loadCompatibilityMetadata(
  slug: string
): Promise<GameCompatibilityMetadata | null> {
  const cached = getFreshCachedMetadata(slug);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const existing = pending.get(slug);
  if (existing) return existing;

  const request = fetch(
    `/api/games/${encodeURIComponent(slug)}/compatibility`,
    { cache: "no-store" }
  )
    .then(async (response) => {
      if (!response.ok) {
        if (response.status >= 500) {
          return resolved.get(slug)?.value ?? null;
        }
        return null;
      }
      const payload = await response.json() as { metadata?: unknown };
      return parsePublishedCompatibilityMetadata(payload.metadata);
    })
    .catch(() => resolved.get(slug)?.value ?? null)
    .then((metadata) => {
      resolved.set(slug, {
        value: metadata,
        loadedAt: Date.now(),
      });
      pending.delete(slug);
      return metadata;
    });

  pending.set(slug, request);
  return request;
}

export function useGameCompatibilityMetadata(slug: string) {
  const cached = resolved.get(slug);
  const freshCached = getFreshCachedMetadata(slug);
  const [state, setState] = useState<CompatibilityState>(() => ({
    slug,
    loaded: freshCached !== undefined,
    metadata: cached?.value ?? null,
  }));

  useEffect(() => {
    let active = true;
    let timer: number | null = null;

    async function refresh() {
      const metadata = await loadCompatibilityMetadata(slug);
      if (!active) return;

      setState({
        slug,
        loaded: true,
        metadata,
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
      metadata: state.metadata,
      loading: !state.loaded,
    };
  }

  const nextCached = getFreshCachedMetadata(slug);
  if (nextCached !== undefined) {
    return {
      metadata: nextCached,
      loading: false,
    };
  }

  return {
    metadata: null,
    loading: true,
  };
}
