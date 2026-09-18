import type { ResolvedGameVideo } from "@/lib/media/game-video-media";

import type {
  GameBackgroundVideo,
  GameCardVideo,
  GameCoverArtworkSource,
  GameDestinationMediaMode,
  GameDetailVideo,
  GameGalleryItem,
  GameHeroVideo,
  GameImageMedia,
  GameMediaAccessibility,
} from "@/types/game";

export type MultimediaResourceHygieneStatus =
  | "active"
  | "reserved"
  | "published-only"
  | "historical"
  | "unused";

export type MultimediaResourceHygiene = {
  src: string;
  kind: "image" | "video";
  origin: "editorial" | "bundled";
  status: MultimediaResourceHygieneStatus;
  usage: string[];
  blocksPublication: boolean;
};

type MultimediaResourceBase = {
  hygiene?: MultimediaResourceHygiene | null;
};

export type MultimediaResourceImage = MultimediaResourceBase & {
  kind: "image";
  origin: "editorial" | "bundled";
  src: string;
  digest: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
};

export type MultimediaResourceVideo = MultimediaResourceBase & {
  kind: "video";
  origin: "editorial";
  src: string;
  digest: string;
  bytes: number;
};

export type MultimediaLibraryResource =
  | MultimediaResourceImage
  | MultimediaResourceVideo;

export type MultimediaRequirements = {
  cover: {
    assigned: boolean;
    cropReady: boolean;
    mode: "image";
    aspect: "4:5";
  };
  hero: {
    assigned: boolean;
    cropReady: boolean;
    mode: GameDestinationMediaMode;
    aspect: "3:1";
  };
  card: {
    assigned: boolean;
    cropReady: boolean;
    mode: GameDestinationMediaMode;
    aspect: "3:2";
  };
  detail: {
    assigned: boolean;
    cropReady: boolean;
    mode: GameDestinationMediaMode;
    aspect: "adaptive";
  };
  background: {
    assigned: boolean;
    cropReady: boolean;
    active: boolean;
    mode: GameDestinationMediaMode | null;
    aspect: "adaptive";
  };
  gallery: {
    assigned: boolean;
    cropReady: boolean;
    minimum: number;
    count: number;
    imageCount: number;
    videoCount: number;
  };
  ready: boolean;
};

export type MultimediaHygieneSummary = {
  ready: boolean;
  total: number;
  active: number;
  reserved: number;
  publishedOnly: number;
  historical: number;
  unused: number;
  blockingCount: number;
  blocking: MultimediaResourceHygiene[];
  resources: MultimediaResourceHygiene[];
};

export type MultimediaLibraryState = {
  revision: number;
  resources: MultimediaLibraryResource[];
  gallery?: GameGalleryItem[];
  accessibility?: GameMediaAccessibility | null;
  requirements?: MultimediaRequirements;
  hygiene?: MultimediaHygieneSummary;
  assignments: {
    coverArtworkSource: GameCoverArtworkSource;
    coverImage: string | null;
    heroImage: string | null;
    cardImage: string | null;
    detailImage: string | null;
    backgroundImage: string | null;
    screenshots: string[];
    imageMedia: GameImageMedia | null;
    heroMode: GameDestinationMediaMode;
    cardMode: GameDestinationMediaMode;
    detailMode: GameDestinationMediaMode;
    backgroundMode: GameDestinationMediaMode | null;
    heroVideo: GameHeroVideo | null;
    cardVideo: GameCardVideo | null;
    resolvedCardVideo: ResolvedGameVideo | null;
    detailVideo: GameDetailVideo | null;
    backgroundVideo: GameBackgroundVideo | null;
  };
};

export function formatMultimediaBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function multimediaShortName(src: string) {
  const filename = src.split("/").filter(Boolean).at(-1) ?? src;
  if (filename.length <= 24) return filename;
  return `${filename.slice(0, 11)}…${filename.slice(-10)}`;
}
