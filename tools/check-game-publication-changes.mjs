import assert from "node:assert/strict";

import {
  evaluateGamePublicationChanges,
} from "../src/lib/admin/game-publication-changes.ts";

function game(overrides = {}) {
  return {
    id: "publication-cover-source-check",
    slug: "publication-cover-source-check",
    title: "Juego de prueba",
    description: "Contrato mínimo para cambios de publicación.",
    category: "Acción",
    imageAlt: "Arte de prueba",
    coverImage: "/images/games/elden-ring/card.webp",
    cardImage: "/images/games/elden-ring/card.webp",
    ...overrides,
  };
}

const publishedCard = game({
  coverArtworkSource: "card",
});
const draftCustom = game({
  coverArtworkSource: "custom",
});

assert.deepEqual(
  evaluateGamePublicationChanges(publishedCard, publishedCard),
  [],
  "Un snapshot sin cambios no debe generar diferencias de publicación."
);

const sourceChange = evaluateGamePublicationChanges(
  draftCustom,
  publishedCard
);
assert.deepEqual(
  sourceChange.map(({ id, section }) => ({ id, section })),
  [{ id: "media", section: "multimedia" }],
  "Cambiar sólo la fuente de Portada debe aparecer como cambio Multimedia."
);

const legacyEquivalent = game({
  coverArtworkSource: undefined,
});
assert.deepEqual(
  evaluateGamePublicationChanges(publishedCard, legacyEquivalent),
  [],
  "Un snapshot legacy sin coverArtworkSource no debe marcar cambio cuando resuelve semánticamente a Card."
);

const legacyCustom = game({
  coverArtworkSource: undefined,
  coverImage: "/images/games/elden-ring/cover.webp",
  cardImage: "/images/games/elden-ring/card.webp",
});
assert.deepEqual(
  evaluateGamePublicationChanges(draftCustom, legacyCustom),
  [],
  "Un snapshot legacy con Portada distinta de Card debe resolver semánticamente a custom."
);

console.log(
  "Cambios de publicación multimedia: OK (fuente de Portada explícita + compatibilidad legacy)."
);
