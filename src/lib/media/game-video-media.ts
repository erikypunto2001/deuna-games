import {
  DEFAULT_PREVIEW_VIEWPORT,
  parsePreviewViewport,
  type PreviewViewport,
} from "./preview-video-policy";
import {
  normalizeGameMediaMode,
} from "./game-media-mode-policy";

import type {
  Game,
  GameCardVideo,
  GameDestinationMediaMode,
  GameHeroVideoPlayback,
  GameVideoMedia,
  GameVideoViewport,
} from "@/types/game";

/** Destinos que siguen admitiendo video editorial activo. */
export type GameVideoTarget = "hero" | "card" | "detail";
export type GameMediaDestinationTarget = "cover" | GameVideoTarget;
export type GameCardVideoSource = "hero" | "independent";

export type ResolvedGameVideo = {
  src: string;
  viewport: GameVideoViewport;
  source: GameCardVideoSource | "hero" | "detail" | "legacy";
};

export const DEFAULT_GAME_MEDIA_MODES = {
  hero: "hover-video",
  card: "image",
  detail: "image",
} as const satisfies Record<GameVideoTarget, GameDestinationMediaMode>;

function defaultViewport(): GameVideoViewport {
  return { ...DEFAULT_PREVIEW_VIEWPORT };
}

function hasVideoMedia(media: GameVideoMedia | undefined) {
  return Boolean(
    media?.hero ||
      media?.card ||
      media?.detail ||
      media?.background
  );
}

export function normalizeGameVideoViewport(
  viewport: GameVideoViewport | PreviewViewport | undefined
): GameVideoViewport {
  if (!viewport || viewport.aspect === "free") return defaultViewport();

  const parsed = parsePreviewViewport(
    String(viewport.x),
    String(viewport.y),
    String(viewport.zoom),
    viewport.aspect
  );
  if (!parsed || parsed.aspect === "free") return defaultViewport();

  return {
    x: parsed.x,
    y: parsed.y,
    zoom: parsed.zoom,
    aspect: parsed.aspect,
    ...(Boolean((viewport as GameVideoViewport).confirmed)
      ? { confirmed: true as const }
      : {}),
  };
}

export function resolveGameDestinationImage(
  game: Game,
  target: GameMediaDestinationTarget
) {
  if (target === "cover") return game.coverImage;
  if (target === "hero") return game.heroImage;
  if (target === "card") return game.cardImage ?? game.coverImage;
  return game.detailImage ?? game.heroImage ?? game.coverImage;
}

export function resolveGameDestinationMediaMode(
  game: Game,
  target: GameMediaDestinationTarget
): GameDestinationMediaMode {
  // Portada es un contrato image-only y no participa de mediaModes/videoMedia.
  if (target === "cover") return "image";

  const explicit = game.mediaModes?.[target];
  if (explicit) return normalizeGameMediaMode(target, explicit);

  const video = target === "hero"
    ? game.videoMedia?.hero
    : target === "card"
      ? game.videoMedia?.card
      : game.videoMedia?.detail;
  if (video) {
    return normalizeGameMediaMode(
      target,
      video.playback === "hover" ? "hover-video" : "video"
    );
  }

  if (resolveGameDestinationImage(game, target)) return "image";
  return DEFAULT_GAME_MEDIA_MODES[target];
}

export function resolveGameHeroVideoPlayback(
  game: Game
): GameHeroVideoPlayback {
  return resolveGameDestinationMediaMode(game, "hero") === "hover-video"
    ? "hover"
    : "always";
}

export function resolveGameHeroVideo(
  game: Game
): ResolvedGameVideo | undefined {
  const hero = game.videoMedia?.hero;
  if (!hero?.clip) return undefined;

  return {
    src: hero.clip,
    viewport: normalizeGameVideoViewport(hero.viewport),
    source: "hero",
  };
}

export function resolveGameDetailVideo(
  game: Game
): ResolvedGameVideo | undefined {
  const detail = game.videoMedia?.detail;
  if (!detail?.clip) return undefined;

  return {
    src: detail.clip,
    viewport: normalizeGameVideoViewport(detail.viewport),
    source: "detail",
  };
}

export function resolveGameCardVideo(
  game: Game
): ResolvedGameVideo | undefined {
  const card = game.videoMedia?.card;

  if (card?.source === "hero") {
    const hero = game.videoMedia?.hero;
    if (hero?.clip) {
      return {
        src: hero.clip,
        viewport: normalizeGameVideoViewport(card.viewport),
        source: "hero",
      };
    }
  }

  if (card?.source === "independent" && card.clip) {
    return {
      src: card.clip,
      viewport: normalizeGameVideoViewport(card.viewport),
      source: "independent",
    };
  }

  const legacy = game.previewClip?.trim();
  if (!legacy) return undefined;

  return {
    src: legacy,
    viewport: defaultViewport(),
    source: "legacy",
  };
}

export function withSavedGameVideoClip(
  game: Game,
  target: GameVideoTarget,
  clip: string,
  viewport: PreviewViewport
): Pick<Game, "videoMedia" | "previewClip" | "mediaModes"> {
  const normalizedViewport = normalizeGameVideoViewport(viewport);
  const current = game.videoMedia;

  if (target === "hero") {
    let card = current?.card;

    if (!card) {
      card = game.previewClip
        ? {
            source: "independent",
            clip: game.previewClip,
            viewport: defaultViewport(),
          }
        : undefined;
    }

    return {
      videoMedia: {
        ...current,
        hero: {
          clip,
          viewport: normalizedViewport,
          playback: "always",
        },
        card,
      },
      mediaModes: {
        ...game.mediaModes,
        hero: "video",
      },
      previewClip: game.previewClip,
    };
  }

  if (target === "detail") {
    return {
      videoMedia: {
        ...current,
        detail: {
          clip,
          viewport: normalizedViewport,
          playback: "always",
        },
      },
      mediaModes: {
        ...game.mediaModes,
        detail: "video",
      },
      previewClip: game.previewClip,
    };
  }

  const card: GameCardVideo = {
    source: "independent",
    clip,
    viewport: normalizedViewport,
    playback: "always",
  };

  return {
    videoMedia: {
      ...current,
      card,
    },
    mediaModes: {
      ...game.mediaModes,
      card: "video",
    },
    previewClip: clip,
  };
}

export function withGameVideoLayout(
  game: Game,
  target: GameVideoTarget,
  source: GameCardVideoSource,
  viewport: PreviewViewport
): GameVideoMedia | null {
  const normalizedViewport: GameVideoViewport = {
    ...normalizeGameVideoViewport(viewport),
    confirmed: true,
  };
  const current = game.videoMedia;

  if (target === "hero") {
    if (!current?.hero) return null;
    return {
      ...current,
      hero: {
        ...current.hero,
        viewport: normalizedViewport,
      },
    };
  }

  if (target === "detail") {
    if (!current?.detail) return null;
    return {
      ...current,
      detail: {
        ...current.detail,
        viewport: normalizedViewport,
      },
    };
  }

  if (source === "hero") {
    if (!current?.hero) return null;
    return {
      ...current,
      card: {
        source: "hero",
        viewport: normalizedViewport,
        playback: current.card?.playback,
      },
    };
  }

  const independentClip =
    current?.card?.source === "independent"
      ? current.card.clip
      : game.previewClip;
  if (!independentClip) return null;

  return {
    ...current,
    card: {
      source: "independent",
      clip: independentClip,
      viewport: normalizedViewport,
      playback: current?.card?.playback,
    },
  };
}

export function withoutGameVideoTarget(
  game: Game,
  target: GameVideoTarget
): Pick<Game, "videoMedia" | "previewClip"> {
  const current = game.videoMedia;

  if (target === "detail") {
    const videoMedia = current
      ? { ...current, detail: undefined }
      : undefined;
    return {
      videoMedia: hasVideoMedia(videoMedia) ? videoMedia : undefined,
      previewClip: game.previewClip,
    };
  }

  if (target === "card") {
    const videoMedia = current
      ? {
          ...current,
          card: undefined,
        }
      : undefined;
    return {
      videoMedia: hasVideoMedia(videoMedia) ? videoMedia : undefined,
      previewClip: undefined,
    };
  }

  if (!current?.hero) {
    return {
      videoMedia: current,
      previewClip: game.previewClip,
    };
  }

  let card = current.card;
  if (card?.source === "hero") {
    const fallback = game.previewClip;
    card = fallback
      ? {
          source: "independent",
          clip: fallback,
          viewport: card.viewport,
          playback: card.playback,
        }
      : undefined;
  }

  const videoMedia = {
    ...current,
    hero: undefined,
    card,
  };

  return {
    videoMedia: hasVideoMedia(videoMedia) ? videoMedia : undefined,
    previewClip: game.previewClip,
  };
}
