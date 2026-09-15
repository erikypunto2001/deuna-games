import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  editor,
  livePreview,
  adminPage,
  rankingReference,
  heroLayout,
  heroSource,
  arrowOverrides,
] = await Promise.all([
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
  readFile(
    new URL("../src/lib/home/hero-layout.ts", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../src/components/home/HeroSection.tsx", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../src/components/home/HeroArrowOverrides.module.css", import.meta.url),
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

// The editorial surface stays task-oriented. Engine internals remain hidden,
// while visual controls explicitly requested by the editor (arrows, pause and
// placement of the navigation cluster) are part of the supported design contract.
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
  "The Hero editor must not depend on the old advanced inspector helpers."
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
  "Extender hasta las flechas",
  "Estilo de controles",
  "Mostrar indicadores",
  "Mostrar progreso",
  "Mostrar pausa",
  "Icono de flecha",
  "Contenedor de flecha",
  "Altura de las flechas",
  "Distancia al borde",
  "Tamaño de las flechas",
  "Posición horizontal",
  "Posición vertical",
  "Escala de controles",
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
    `The Hero editor must keep ${essentialControl}.`
  );
}

assert.match(
  editor,
  /settings\.spacingReference = "visual";/,
  "Exterior spacing edited by the simple UI must always use the stable visual reference."
);
assert.match(
  editor,
  /responsive\.cardWidthMode === "fill"[\s\S]*?setCardWidthMode\(value \? "fill" : "fixed"\)/,
  "The width-to-arrows control must persist through the canonical responsive Hero state."
);
assert.match(
  heroLayout,
  /export function homeHeroCardWidthCSS\([\s\S]*?100cqw[\s\S]*?arrows\.scale[\s\S]*?arrows\.inset/,
  "Fill width must be resolved from the real Hero container and current arrow geometry."
);
assert.match(
  heroSource,
  /homeHeroCardWidthCSS\([\s\S]*?responsive,[\s\S]*?arrows,[\s\S]*?device,[\s\S]*?totalGames > 1/,
  "The public Hero renderer and Admin preview must consume the shared width resolver."
);
assert.match(
  heroSource,
  /import arrowStyles from "\.\/HeroArrowOverrides\.module\.css";/,
  "The public Hero renderer must load the CSS module that consumes persisted arrow placement and shape variables."
);
assert.match(
  heroSource,
  /className=\{`\$\{styles\.heroSection\}[\s\S]*?\$\{arrowStyles\.arrowBridge\}`\}/,
  "The Hero root must keep the arrow override module connected to the rendered tree."
);
assert.match(
  arrowOverrides,
  /\.arrowBridge\s*>\s*button\[data-arrow-shape\]\[data-hero-spacing-boundary="control"\]/,
  "The arrow stylesheet must bind directly to the rendered Hero arrow buttons instead of relying on an unscoped descendant selector."
);
assert.match(
  arrowOverrides,
  /\.arrowBridge\s*>\s*button\[data-arrow-shape\]\[data-hero-spacing-boundary="control"\]\[aria-label="Juego anterior"\][\s\S]*?left:\s*var\(--hero-desktop-arrow-inset/,
  "The previous Hero control must consume the persisted desktop inset on the rendered button itself."
);
assert.match(
  arrowOverrides,
  /\.arrowBridge\s*>\s*button\[data-arrow-shape\]\[data-hero-spacing-boundary="control"\]\[aria-label="Juego siguiente"\][\s\S]*?right:\s*var\(--hero-desktop-arrow-inset/,
  "The next Hero control must consume the persisted desktop inset on the rendered button itself."
);
for (const arrowVariable of [
  "--hero-desktop-arrow-inset",
  "--hero-tablet-arrow-inset",
  "--hero-mobile-arrow-inset",
  "--hero-desktop-arrow-y",
  "--hero-desktop-arrow-scale",
]) {
  assert.match(
    arrowOverrides,
    new RegExp(arrowVariable),
    `The arrow runtime stylesheet must consume ${arrowVariable}.`
  );
}
for (const fillRuntimeInvariant of [
  /const HERO_FILL_SEARCH_STEPS = 12;/,
  /responsive\.cardWidthMode === "fill"[\s\S]*?const footprintCards = oneSided \? cards : \[mainCard\];/,
  /root\.style\.setProperty\("--hero-card-width", `\$\{width\}px`\);/,
  /root\.style\.setProperty\([\s\S]*?"--hero-anchor"/,
]) {
  assert.match(
    heroSource,
    fillRuntimeInvariant,
    "Fill mode must resolve the real visual footprint and recenter it between arrows instead of relying only on a nominal card width."
  );
}
assert.match(
  editor,
  /onNavigationPositionChange=\{\(x, y\) => \{[\s\S]*?setNavigationPosition\(x, y\)/,
  "The real preview drag handle must persist navigation-cluster placement through the editor state."
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
assert.match(
  livePreview,
  /navigationEditor=\{[\s\S]*?!playing && onNavigationPositionChange/,
  "The shared public Hero renderer must own navigation dragging in edit mode."
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
  "Hero Admin state: OK (task-oriented editorial surface, visual-footprint fill, direct live arrow binding, automatic preview viewport, stable ranking hydration and context-aware preview replay)."
);
