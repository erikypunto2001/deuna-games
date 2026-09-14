"use client";

import { useState, useSyncExternalStore } from "react";

type SnapshotStore = {
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => string | null;
};

const serverSnapshot = () => null;
const clientReady = () => true;
const serverReady = () => false;
const subscribeReady = () => () => {};

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
