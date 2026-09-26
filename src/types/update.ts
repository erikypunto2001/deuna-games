import type { Game } from "@/types/game";

export type UpdateType =
  | "update"
  | "content"
  | "fix"
  | "improvement";

export type GameUpdate = {
  id: string;
  gameSlug: string;
  releaseId?: string;
  version: string;
  publishedAt: string;
  type: UpdateType;
  summary: string;
  featured?: boolean;
};

export type ResolvedGameUpdate =
  GameUpdate & {
    game: Game;
    downloadable: boolean;
  };
