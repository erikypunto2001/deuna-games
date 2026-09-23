import "server-only";

import {
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  evaluateGameMediaHygiene,
} from "@/lib/admin/game-media-hygiene";
import {
  listGameImageReferences,
  listGameVideoReferences,
} from "@/lib/admin/game-media-integrity";
import {
  getPublishedGameImageReferences,
} from "@/lib/admin/publication-service";
import {
  getPublishedGameVideoReferences,
} from "@/lib/admin/published-game-video-references";
import {
  listAssignedBundledImageResources,
  listEditorialMediaLibrary,
  mergeEditorialMediaResources,
  reconcileEditorialMediaDeletions,
} from "@/lib/media/editorial-media-library";
import {
  resolveGameCardBaseImage,
  resolveGameCoverArtworkSource,
  resolveGameCoverImage,
} from "@/lib/media/game-card-presentation";
import {
  resolveGameGalleryItems,
} from "@/lib/media/game-gallery-media";
import {
  evaluateGameMediaRequirements,
  resolveGameBackgroundMediaMode,
} from "@/lib/media/game-media-requirements";
import {
  resolveGameCardVideo,
  resolveGameDestinationMediaMode,
} from "@/lib/media/game-video-media";

export async function getGameMediaWorkspaceSnapshot(slug: string) {
  const item = await getEditorialItem("game", slug);
  if (!item) return null;

  const game = item.payload;
  const imageReferences = listGameImageReferences(game);
  const videoReferences = listGameVideoReferences(game);
  const draftReferences = [...imageReferences, ...videoReferences];
  const [publishedImages, publishedVideos] = await Promise.all([
    getPublishedGameImageReferences(slug),
    getPublishedGameVideoReferences(slug),
  ]);
  const publishedReferences = Array.from(
    new Set([...publishedImages, ...publishedVideos])
  );
  // Sólo el borrador y la publicación actuales protegen masters editoriales.
  // Las versiones históricas de juegos no existen ni retienen archivos.
  await reconcileEditorialMediaDeletions(
    slug,
    draftReferences,
    publishedReferences
  );

  const [editorial, bundled] = await Promise.all([
    listEditorialMediaLibrary(slug),
    listAssignedBundledImageResources(imageReferences),
  ]);
  const resources = mergeEditorialMediaResources(editorial, bundled);
  const hygiene = evaluateGameMediaHygiene(
    game,
    resources,
    publishedReferences
  );
  const hygieneBySource = new Map(
    hygiene.resources.map((resource) => [resource.src, resource] as const)
  );

  return {
    revision: item.revision,
    resources: resources.map((resource) => ({
      ...resource,
      hygiene: hygieneBySource.get(resource.src) ?? null,
    })),
    hygiene,
    requirements: evaluateGameMediaRequirements(game),
    gallery: resolveGameGalleryItems(game),
    accessibility: game.mediaAccessibility ?? null,
    assignments: {
      coverArtworkSource: resolveGameCoverArtworkSource(game),
      coverImage: resolveGameCoverImage(game) ?? null,
      heroImage: game.heroImage ?? null,
      cardImage: resolveGameCardBaseImage(game) ?? null,
      detailImage: game.detailImage ?? null,
      backgroundImage: game.backgroundImage ?? null,
      screenshots: game.screenshots ?? [],
      imageMedia: game.imageMedia ?? null,
      heroMode: resolveGameDestinationMediaMode(game, "hero"),
      cardMode: resolveGameDestinationMediaMode(game, "card"),
      detailMode: resolveGameDestinationMediaMode(game, "detail"),
      backgroundMode: resolveGameBackgroundMediaMode(game),
      heroVideo: game.videoMedia?.hero ?? null,
      cardVideo: game.videoMedia?.card ?? null,
      resolvedCardVideo: resolveGameCardVideo(game) ?? null,
      detailVideo: game.videoMedia?.detail ?? null,
      backgroundVideo: game.videoMedia?.background ?? null,
    },
  };
}
