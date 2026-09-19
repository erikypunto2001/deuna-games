"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  MultimediaLibraryState,
} from "@/components/admin/game-multimedia-library-types";

type GameMultimediaWorkspaceContextValue = {
  workspace: MultimediaLibraryState | null;
  loading: boolean;
  error: string | null;
  currentRevision: number;
  stale: boolean;
  libraryOpen: boolean;
  openLibrary: () => void;
  closeLibrary: () => void;
};

const GameMultimediaWorkspaceContext =
  createContext<GameMultimediaWorkspaceContextValue | null>(null);

export function GameMultimediaWorkspaceProvider({
  slug,
  revision,
  children,
}: {
  slug: string;
  revision: number;
  children: ReactNode;
}) {
  const [workspace, setWorkspace] =
    useState<MultimediaLibraryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const openLibrary = useCallback(() => setLibraryOpen(true), []);
  const closeLibrary = useCallback(() => setLibraryOpen(false), []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setWorkspace(null);
        const response = await fetch(
          `/api/admin/content/games/${encodeURIComponent(slug)}/media-workspace`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          throw new Error("No se pudo cargar el workspace multimedia.");
        }
        const payload = await response.json() as MultimediaLibraryState;
        if (!controller.signal.aborted) {
          setWorkspace(payload);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar el workspace multimedia."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [revision, slug]);

  const value = useMemo<GameMultimediaWorkspaceContextValue>(
    () => ({
      workspace,
      loading,
      error,
      currentRevision: workspace?.revision ?? revision,
      stale: workspace !== null && workspace.revision !== revision,
      libraryOpen,
      openLibrary,
      closeLibrary,
    }),
    [
      closeLibrary,
      error,
      libraryOpen,
      loading,
      openLibrary,
      revision,
      workspace,
    ]
  );

  return (
    <GameMultimediaWorkspaceContext.Provider value={value}>
      {children}
    </GameMultimediaWorkspaceContext.Provider>
  );
}

export function useGameMultimediaWorkspace() {
  const context = useContext(GameMultimediaWorkspaceContext);
  if (!context) {
    throw new Error(
      "useGameMultimediaWorkspace debe usarse dentro de GameMultimediaWorkspaceProvider."
    );
  }
  return context;
}
