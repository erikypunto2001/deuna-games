import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  editor,
  livePreview,
  adminPage,
  rankingReference,
  heroLayout,
  heroSource,
  heroStyles,
  heroArtworkStyles,
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
    new URL("../src/components/home/HeroSection.module.css", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../src/components/home/HeroArtwork.module.css", import.meta.url),
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

// Arrow presentation belongs to HeroSection itself. Keeping position/scale/shape
// in a second CSS module lets Admin persist one value while another responsive
// layer wins in the real preview. Guard the single canonical styling contract.
for (const canonicalArrowVariable of [
  /--hero-arrow-inset:\s*var\(--hero-desktop-arrow-inset/,
  /--hero-arrow-y:\s*var\(--hero-desktop-arrow-y/,
  /--hero-arrow-scale:\s*var\(--hero-desktop-arrow-scale/,
  /--hero-arrow-hover-scale:\s*var\(--hero-desktop-arrow-hover-scale/,
  /--hero-arrow-inset:var\(--hero-tablet-arrow-inset/,
  /--hero-arrow-inset:var\(--hero-mobile-arrow-inset/,
]) {
  assert.match(
    heroStyles,
    canonicalArrowVariable,
    "HeroSection.module.css must resolve arrow presentation from the persisted per-device variables."
  );
}
assert.match(
  heroStyles,
  /\.arrow\{[\s\S]*?top:var\(--hero-arrow-y\)[\s\S]*?transform:translateY\(-50%\) scale\(var\(--hero-arrow-scale\)\)/,
  "The canonical Hero arrow rule must own vertical placement and editorial scale."
);
assert.match(
  heroStyles,
  /\.arrowLeft\{left:var\(--hero-arrow-inset\)\}/,
  "The previous Hero arrow must consume the canonical inset."
);
assert.match(
  heroStyles,
  /\.arrowRight\{right:var\(--hero-arrow-inset\)\}/,
  "The next Hero arrow must consume the canonical inset."
);
assert.doesNotMatch(
  heroArtworkStyles,
  /aria-label="Juego anterior"\]\)\s*\{[^}]*\bleft\s*:/,
  "Hero artwork styling must not pin the previous arrow outside the canonical HeroSection contract."
);
assert.doesNotMatch(
  heroArtworkStyles,
  /aria-label="Juego siguiente"\]\)\s*\{[^}]*\bright\s*:/,
  "Hero artwork styling must not pin the next arrow outside the canonical HeroSection contract."
);
assert.doesNotMatch(
  heroSource,
  /arrowStyles|previousArrowStyle|nextArrowStyle|style=\{previousArrowStyle\}|style=\{nextArrowStyle\}/,
  "HeroSection must keep arrow position and scale in the canonical per-device CSS-variable contract, not duplicate them inline."
);
for (const shape of ["circle", "rounded", "square", "none"]) {
  assert.match(
    heroStyles,
    new RegExp(`\\.arrow\\[data-arrow-shape="${shape}"\\]`),
    `The canonical Hero stylesheet must render the ${shape} arrow container.`
  );
}

for (const fillRuntimeInvariant of [
  /const HERO_FILL_SEARCH_STEPS = 12;/,
  /responsive\.cardWidthMode === "fill"[\s\S]*?const footprintCards = oneSided \? cards : \[mainCard\];/,
  /root\.style\.setProperty\("--hero-card-width", `\$\{width\}px`\);/,
  /root\.style\.setProperty\([\s\S]*?"--hero-anchor"/,
  /const adjustedBounds = horizontalBounds\(footprintCards\);/,
  /const residualCenterOffset =[\s\S]*?adjustedBounds\.left[\s\S]*?adjustedBounds\.right/,
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
  "Hero Admin state: OK (task-oriented editorial surface, visual-footprint fill, canonical live arrow styling, automatic preview viewport, stable ranking hydration and context-aware preview replay)."
);
