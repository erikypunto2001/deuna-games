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
  /--hero-motion-live-duration:\s*0ms;[\s\S]*?animation:\s*heroMotionArm\s+1ms\s+steps\(1, end\)\s+80ms\s+forwards/,
  "El motor V3 debe arrancar desarmado durante el bootstrap responsive para no crear transiciones pendientes antes de la primera pintura."
);
assert.match(
  motionCss,
  /@keyframes heroMotionArm[\s\S]*?--hero-motion-live-duration:\s*var\(--hero-motion-duration\)[\s\S]*?--hero-artwork-live-duration:\s*var\(--hero-artwork-duration\)/,
  "El armado inicial debe recuperar las duraciones reales del perfil V3 sin fijarlas a un modo concreto."
);
assert.match(
  motionCss,
  /transform var\(--hero-motion-live-duration\)[\s\S]*?opacity var\(--hero-motion-live-duration\)/,
  "Las tarjetas deben usar exclusivamente la duración V3 armada después del bootstrap."
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
  "Hero motion continuity structure: OK (bootstrap armado, DOM canónico, transición V3 única para buffers, fitting visible-only y edge-wrap visible-only)."
);
