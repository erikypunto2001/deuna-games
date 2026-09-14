"use client";

import { useState, useSyncExternalStore } from "react";

type SnapshotStore = {
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => string | null;
};

const serverSnapshot = () => null;
const clientReady = () => true;
const serverReady = () => false;

function subscribeReady(callback: () => void) {
  let active = true;

  queueMicrotask(() => {
    if (active) callback();
  });

  return () => {
    active = false;
  };
}

function createInitialSessionStorageStore(key: string): SnapshotStore {
  let captured = false;
  let snapshot: string | null = null;

  return {
    subscribe: () => () => {},
    getSnapshot: () => {
      if (captured) return snapshot;
      captured = true;

      try {
        snapshot = sessionStorage.getItem(key);
      } catch {
        snapshot = null;
      }

      return snapshot;
    },
  };
}

/**
 * Captures a browser-session recovery payload once for the lifetime of the
 * mounted editor. Writes made by that same editor stay available for a future
 * reload, but cannot turn into a recovery gate while the user is still editing.
 *
 * The readiness store emits once after hydration so effects can persist new
 * edits without racing an existing recovery payload from sessionStorage.
 */
export function useInitialSessionStorageSnapshot(key: string) {
  const [store] = useState(() => createInitialSessionStorageStore(key));
  const ready = useSyncExternalStore(
    subscribeReady,
    clientReady,
    serverReady
  );
  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    serverSnapshot
  );

  return { ready, value };
}
