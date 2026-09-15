import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [hero, motionCss] = await Promise.all([
  readFile("src/components/home/HeroSection.tsx", "utf8"),
  readFile("src/components/home/HeroMotion.module.css", "utf8"),
]);

assert.match(
  hero,
  /heroMotionRenderPositions\(visiblePositions, direction\)/,
  "Hero debe renderizar posiciones físicas de continuidad además de las visibles."
);
assert.match(
  hero,
  /renderPositions\.flatMap\([\s\S]*?\)\.sort\(\(left, right\) => left\.index - right\.index\)/,
  "Las tarjetas Hero deben conservar un orden DOM canónico por juego para que React no reinserte nodos al cambiar de slot."
);
assert.match(
  hero,
  /const \[motionReady, setMotionReady\] = useState\(false\)/,
  "Hero debe empezar con el motor de movimiento desarmado durante la resolución responsive inicial."
);
assert.match(
  hero,
  /requestAnimationFrame\(\(\) => \{[\s\S]*?requestAnimationFrame\(\(\) => setMotionReady\(true\)\)/,
  "Hero debe armar el motor sólo después de dos frames del layout responsive inicial."
);
assert.match(
  hero,
  /data-motion-ready=\{motionReady \|\| undefined\}/,
  "Hero debe exponer explícitamente cuándo el motor V3 quedó listo."
);
assert.match(
  hero,
  /data-motion-buffer=\{!isVisible \|\| undefined\}/,
  "Las tarjetas físicas fuera del viewport lógico deben identificarse como buffers de movimiento."
);
assert.match(
  hero,
  /data-hero-visible=\{isVisible \|\| undefined\}/,
  "Hero debe distinguir explícitamente tarjetas visibles de buffers físicos."
);
assert.match(
  hero,
  /querySelectorAll<HTMLElement>\("\[data-hero-visible='true'\]"\)/,
  "El fitting sólo debe medir tarjetas realmente visibles."
);
assert.doesNotMatch(
  hero,
  /setProperty\(["']--hero-motion-duration["'],\s*["']0ms["']\)/,
  "El fitting nunca debe apagar una transición Hero en curso."
);
assert.match(
  hero,
  /previousPositionByGameId\.get\(String\(game\.id\)\)/,
  "Edge-wrap debe derivarse de la posición física anterior de cada tarjeta sin leer refs durante render."
);
assert.match(
  hero,
  /normalizedActiveIndex - motionDelta/,
  "La posición física anterior debe partir del índice activo anterior real."
);
assert.match(
  motionCss,
  /\.motionRoot:not\(\[data-motion-ready="true"\]\) \.motionCard,[\s\S]*?\.motionRoot:not\(\[data-motion-ready="true"\]\) \.motionArtwork \{[\s\S]*?transition:\s*none/,
  "El bootstrap responsive debe suprimir transiciones sólo mientras data-motion-ready no esté armado."
);
assert.doesNotMatch(
  motionCss,
  /heroMotionArm|--hero-motion-live-duration|--hero-artwork-live-duration/,
  "El readiness no debe depender de animar custom properties CSS."
);
assert.match(
  motionCss,
  /transform var\(--hero-motion-duration\)[\s\S]*?opacity var\(--hero-motion-duration\)/,
  "Una vez armado, el motor debe usar directamente la duración real del perfil V3."
);
assert.match(
  motionCss,
  /\.motionRoot \.motionCard\[data-edge-wrap="true"\]:not\(\[data-motion-buffer="true"\]\)[\s\S]*?transition:\s*none[\s\S]*?animation:\s*heroEdgeWrap/,
  "Edge-wrap instantáneo debe quedar limitado a tarjetas visibles; un buffer conserva siempre la transición V3 base."
);
assert.doesNotMatch(
  motionCss,
  /\.motionRoot \.motionCard\[data-motion-buffer="true"\]\s*\{/,
  "Los buffers no deben cambiar de régimen transition-* al cruzar el límite visible."
);

console.log(
  "Hero motion continuity structure: OK (readiness explícito, DOM canónico, transición V3 única para buffers, fitting visible-only y edge-wrap visible-only)."
);
