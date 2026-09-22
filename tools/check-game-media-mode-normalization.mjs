import assert from "node:assert/strict";

import { games } from "@/data/games";
import { parseEditorialPayload } from "@/lib/admin/content-validation";
import { resolveGameCardPreview } from "@/lib/media/game-card-preview";

const source = games[0];
assert.ok(source, "Debe existir al menos un juego fuente para probar normalización multimedia.");

const clip =
  `/media/editorial/${source.slug}/${"a".repeat(64)}.webm`;

function viewport(aspect) {
  return {
    x: 0.5,
    y: 0.5,
    zoom: 1,
    aspect,
    confirmed: true,
  };
}

const explicitLegacy = parseEditorialPayload("game", {
  ...structuredClone(source),
  backgroundImage: source.coverImage,
  mediaModes: {
    hero: "hover-video",
    card: "hover-video",
    detail: "hover-video",
    background: "hover-video",
  },
  videoMedia: {
    card: {
      source: "independent",
      clip,
      viewport: viewport("3:2"),
      playback: "hover",
    },
  },
});

assert.equal(
  explicitLegacy.mediaModes?.hero,
  "hover-video",
  "Hero debe conservar Imagen + hover porque sigue siendo un modo válido."
);
assert.equal(
  explicitLegacy.mediaModes?.card,
  "video",
  "Card legacy con hover y WebM publicado debe migrar al modo Video moderno."
);
assert.equal(
  explicitLegacy.mediaModes?.detail,
  "image",
  "Contenedor legacy con hover debe normalizarse a Imagen en la frontera editorial."
);
assert.equal(
  explicitLegacy.mediaModes?.background,
  "image",
  "Fondo legacy con hover debe normalizarse a Imagen en la frontera editorial."
);

const inferredLegacyPayload = {
  ...structuredClone(source),
  backgroundImage: source.coverImage,
  videoMedia: {
    hero: {
      clip,
      viewport: viewport("3:1"),
      playback: "hover",
    },
    card: {
      source: "independent",
      clip,
      viewport: viewport("3:2"),
      playback: "hover",
    },
    detail: {
      clip,
      viewport: viewport("source"),
      playback: "hover",
    },
    background: {
      clip,
      viewport: viewport("source"),
      playback: "hover",
    },
  },
};
delete inferredLegacyPayload.mediaModes;

const inferredLegacy = parseEditorialPayload(
  "game",
  inferredLegacyPayload
);

assert.equal(
  inferredLegacy.mediaModes?.hero,
  "hover-video",
  "Hero debe seguir infiriendo hover desde playback legacy."
);
assert.equal(
  inferredLegacy.mediaModes?.card,
  "video",
  "Card con playback hover legacy debe conservar el WebM mediante el modo Video moderno."
);
assert.equal(
  inferredLegacy.mediaModes?.detail,
  "image",
  "Contenedor no debe reactivar hover desde playback legacy."
);
assert.equal(
  inferredLegacy.mediaModes?.background,
  "image",
  "Fondo no debe reactivar hover desde playback legacy."
);
assert.equal(
  inferredLegacy.videoMedia?.card?.playback,
  "hover",
  "La normalización del modo no debe destruir metadata histórica del recurso."
);

assert.equal(
  resolveGameCardPreview(explicitLegacy)?.src,
  clip,
  "La Card con hover explícito legacy debe seguir resolviendo su WebM público."
);
assert.equal(
  resolveGameCardPreview(inferredLegacy)?.src,
  clip,
  "La Card con playback hover legacy debe seguir resolviendo su WebM público."
);

const previewClipOnlyPayload = {
  ...structuredClone(source),
  previewClip: clip,
};
delete previewClipOnlyPayload.mediaModes;
delete previewClipOnlyPayload.videoMedia;

const previewClipOnly = parseEditorialPayload(
  "game",
  previewClipOnlyPayload
);
assert.equal(
  previewClipOnly.mediaModes?.card,
  "video",
  "Un snapshot previewClip-only debe migrar a Card Video."
);
assert.equal(
  resolveGameCardPreview(previewClipOnly)?.src,
  clip,
  "El snapshot previewClip-only debe seguir resolviendo su WebM público."
);

const explicitImageWithLegacyPreview = parseEditorialPayload("game", {
  ...structuredClone(source),
  previewClip: clip,
  mediaModes: {
    card: "image",
  },
});
assert.equal(
  explicitImageWithLegacyPreview.mediaModes?.card,
  "image",
  "Una intención explícita de Imagen debe seguir prevaleciendo sobre previewClip residual."
);
assert.equal(
  resolveGameCardPreview(explicitImageWithLegacyPreview),
  null,
  "previewClip residual no debe reactivar video cuando Card está explícitamente en Imagen."
);

const validVideo = parseEditorialPayload("game", {
  ...structuredClone(source),
  mediaModes: {
    card: "video",
  },
  videoMedia: {
    card: {
      source: "independent",
      clip,
      viewport: viewport("3:2"),
      playback: "always",
    },
  },
});

assert.equal(
  validVideo.mediaModes?.card,
  "video",
  "Un modo Video válido de Card debe conservarse."
);

const legacyExternalPreview = parseEditorialPayload("game", {
  ...structuredClone(source),
  previewMode: "youtube",
  youtubePreview: {
    videoId: "abcdefghijk",
    startSeconds: 2,
    endSeconds: 18,
  },
  directPreview: {
    platform: "vimeo",
    url: "https://example.invalid/video",
    startSeconds: 1,
    endSeconds: 12,
  },
});

assert.equal(
  "previewMode" in legacyExternalPreview,
  false,
  "previewMode histórico debe consumirse en compatibilidad y no sobrevivir al contrato Game."
);
assert.equal(
  "youtubePreview" in legacyExternalPreview,
  false,
  "youtubePreview histórico debe consumirse en compatibilidad y no sobrevivir al contrato Game."
);
assert.equal(
  "directPreview" in legacyExternalPreview,
  false,
  "directPreview histórico debe consumirse en compatibilidad y no sobrevivir al contrato Game."
);

console.log(
  "Normalización multimedia: OK (Hero conserva hover; Card legacy hover/previewClip migra a Video; Imagen explícita prevalece; Contenedor/Fondo degradan hover legacy a Imagen)."
);
