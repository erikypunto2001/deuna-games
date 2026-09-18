import assert from "node:assert/strict";

import { games } from "@/data/games";
import { parseEditorialPayload } from "@/lib/admin/content-validation";

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
});

assert.equal(
  explicitLegacy.mediaModes?.hero,
  "hover-video",
  "Hero debe conservar Imagen + hover porque sigue siendo un modo válido."
);
assert.equal(
  explicitLegacy.mediaModes?.card,
  "image",
  "Card legacy con hover debe normalizarse a Imagen en la frontera editorial."
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
  "image",
  "Card no debe reactivar hover aunque un video legacy conserve playback=hover."
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

console.log(
  "Normalización multimedia: OK (Hero conserva hover; Card/Contenedor/Fondo degradan hover legacy a Imagen)."
);
