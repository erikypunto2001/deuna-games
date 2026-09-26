"use client";

import {
  useSyncExternalStore,
} from "react";

type Listener = () => void;

type MediaQueryEntry = {
  media: MediaQueryList;
  listeners: Set<Listener>;
  listening: boolean;
  notify: () => void;
};

type BooleanStore = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => boolean;
  getServerSnapshot: () => boolean;
};

const mediaEntries = new Map<string, MediaQueryEntry>();
const mediaStores = new Map<string, BooleanStore>();

function getMediaEntry(query: string) {
  if (typeof window === "undefined") return null;

  const existing = mediaEntries.get(query);
  if (existing) return existing;

  const media = window.matchMedia(query);
  const listeners = new Set<Listener>();
  const entry: MediaQueryEntry = {
    media,
    listeners,
    listening: false,
    notify: () => {
      for (const listener of [...listeners]) {
        listener();
      }
    },
  };

  mediaEntries.set(query, entry);
  return entry;
}

function getMediaStore(query: string): BooleanStore {
  const existing = mediaStores.get(query);
  if (existing) return existing;

  const store: BooleanStore = {
    subscribe(listener) {
      const entry = getMediaEntry(query);
      if (!entry) return () => {};

      entry.listeners.add(listener);
      if (!entry.listening) {
        entry.media.addEventListener("change", entry.notify);
        entry.listening = true;
      }

      return () => {
        entry.listeners.delete(listener);
        if (entry.listeners.size === 0 && entry.listening) {
          entry.media.removeEventListener("change", entry.notify);
          entry.listening = false;
        }
      };
    },
    getSnapshot() {
      return getMediaEntry(query)?.media.matches ?? false;
    },
    getServerSnapshot() {
      return false;
    },
  };

  mediaStores.set(query, store);
  return store;
}

const visibilityListeners = new Set<Listener>();
let visibilityListening = false;

function notifyVisibility() {
  for (const listener of [...visibilityListeners]) {
    listener();
  }
}

function subscribeDocumentVisibility(listener: Listener) {
  if (typeof document === "undefined") return () => {};

  visibilityListeners.add(listener);
  if (!visibilityListening) {
    document.addEventListener("visibilitychange", notifyVisibility);
    visibilityListening = true;
  }

  return () => {
    visibilityListeners.delete(listener);
    if (visibilityListeners.size === 0 && visibilityListening) {
      document.removeEventListener("visibilitychange", notifyVisibility);
      visibilityListening = false;
    }
  };
}

function getDocumentVisibleSnapshot() {
  return typeof document === "undefined" || !document.hidden;
}

function getDocumentVisibleServerSnapshot() {
  return true;
}

export function useMediaQuery(query: string) {
  const store = getMediaStore(query);

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );
}

export function useDocumentVisible() {
  return useSyncExternalStore(
    subscribeDocumentVisibility,
    getDocumentVisibleSnapshot,
    getDocumentVisibleServerSnapshot
  );
}
