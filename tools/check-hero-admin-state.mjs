import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [editor, livePreview, adminPage, rankingReference] = await Promise.all([
  readFile(
    new URL("../src/components/admin/HomeHeroEditor.tsx", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../src/components/admin/HomeHeroLivePreview.tsx", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../src/app/admin/(protected)/portada/page.tsx", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../src/lib/home/server-ranking-reference.ts", import.meta.url),
    "utf8"
  ),
]);

assert.match(
  adminPage,
  /const rankingReferenceTime = getHomeRankingReferenceTime\(\);/,
  "The Hero Admin server boundary must capture one ranking reference time outside React render purity."
);
assert.doesNotMatch(
  adminPage,
  /Date\.now\(\)/,
  "The React Server Component itself must stay free of wall-clock reads."
);
assert.match(
  adminPage,
  /rankingReferenceTime=\{rankingReferenceTime\}/,
  "The server-captured ranking reference must be serialized into HomeHeroEditor."
);
assert.match(
  rankingReference,
  /import "server-only";/,
  "The ranking clock boundary must remain server-only."
);
assert.match(
  rankingReference,
  /return homeRankingDay\(Date\.now\(\)\);/,
  "The server reference must match the UTC-day granularity used by Home ranking."
);
assert.match(
  editor,
  /rankingReferenceTime:\s*number;/,
  "HomeHeroEditor must model the server ranking reference as an explicit prop."
);
assert.match(
  editor,
  /const rankingNow = rankingReferenceTime;/,
  "Hero ranking must reuse the serialized server reference on the first client render."
);
assert.doesNotMatch(
  editor,
  /useState\(\(\) => Date\.now\(\)\)/,
  "Hero Admin ranking must not recompute wall-clock time during client hydration."
);

// The editorial surface is intentionally simple. Runtime compatibility keeps
// understanding historical advanced values, but the current editor must not
// re-expose engine-level controls that duplicate layouts, presets or movement.
for (const removedControl of [
  "Comparar con guardado",
  "Transformación 3D",
  "Rotación X",
  "Rotación Y",
  "Rotación Z",
  "Desplazamiento X",
  "Desplazamiento Y",
  "Profundidad",
  "Encuadre de la tarjeta",
  "Mantener proporción al cambiar tamaño",
  "Perspectiva",
  "Referencia del espaciado",
  "Mismo espaciado en todos los dispositivos",
  "Rueda del ratón",
  "Navegación táctil",
  "Pausar al pasar el puntero",
  "Repetir al llegar al final",
]) {
  assert.doesNotMatch(
    editor,
    new RegExp(removedControl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `The simplified Hero editor must not expose ${removedControl}.`
  );
}

assert.doesNotMatch(
  editor,
  /HomeHeroNavigationControls|HomeHeroSpacingControls|simplifyHeroFrameRatio/,
  "The simplified Hero editor must not depend on the old advanced inspector helpers."
);
assert.doesNotMatch(
  editor,
  /\["Classic",\s*"Cinema",\s*"Minimal",\s*"Spotlight",\s*"Cards",\s*"Custom"\]/,
  "Custom is a state marker, not a visual preset the user should be asked to apply."
);

for (const essentialControl of [
  "Modo de selección del Hero",
  "Elige la composición",
  "Estilo visual",
  "Tamaño y espacio",
  "Separación entre tarjetas",
  "Estilo de controles",
  "Mostrar indicadores",
  "Mostrar progreso",
  "Elige cómo cambia de juego",
  "Avance automático",
  "Tiempo por juego",
  "Probar funcionamiento",
  "Guardar borrador",
  "Revisar y publicar Inicio",
]) {
  assert.match(
    editor,
    new RegExp(essentialControl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `The simplified Hero editor must keep ${essentialControl}.`
  );
}

assert.match(
  editor,
  /settings\.spacingReference = "visual";/,
  "Exterior spacing edited by the simple UI must always use the stable visual reference."
);
assert.match(
  editor,
  /Arrastre, táctil, teclado y repetición forman parte del[\s\S]*?comportamiento estable del carrusel/,
  "The editor must explain that interaction mechanics are product behavior, not visual micro-controls."
);

assert.doesNotMatch(
  livePreview,
  /Ancho de pantalla|Alto de pantalla|Usar ventana actual|setManualViewportDimension|manualSizes|customized/,
  "The Hero preview must not expose a second manual viewport-size editor beside the actual Hero dimensions."
);
assert.match(
  livePreview,
  /HOME_HERO_VIEWPORT_DEFAULTS\[device\]/,
  "When the selected device does not match the browser, preview must use the canonical viewport for that device."
);
assert.match(
  livePreview,
  /clampHomeHeroViewport\(device, browserViewport\)/,
  "When browser and selected device match, preview must follow the real browser viewport safely."
);

assert.doesNotMatch(
  livePreview,
  /const wasPlaying = useRef\(false\);/,
  "Hero preview must not gate all future demonstrations behind one session-wide boolean."
);
assert.match(
  livePreview,
  /const lastPlaybackKey = useRef<string \| null>\(null\);/,
  "Hero preview must track the last demonstrated playback context explicitly."
);
assert.match(
  livePreview,
  /const playbackKey = `\$\{device\}:\$\{presentation\.motionStyle\}:\$\{games[\s\S]*?\.map\(\(game\) => game\.id\)[\s\S]*?\.join\(","\)\}`;/,
  "Hero preview playback context must change with device, movement profile and visible games."
);
assert.match(
  livePreview,
  /lastPlaybackKey\.current === playbackKey/,
  "Hero preview must replay when the active playback context changes while test mode stays open."
);
assert.match(
  livePreview,
  /lastPlaybackKey\.current = null;/,
  "Leaving test mode must rearm the next Hero demonstration."
);

console.log(
  "Hero Admin state: OK (simple editorial surface, automatic preview viewport, stable ranking hydration and context-aware preview replay)."
);
