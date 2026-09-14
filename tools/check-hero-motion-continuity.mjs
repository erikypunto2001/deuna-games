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
  /\.motionRoot \.motionCard\[data-motion-buffer="true"\][\s\S]*?transform var\(--hero-motion-duration\)[\s\S]*?opacity var\(--hero-motion-duration\)[\s\S]*?animation:\s*none/,
  "Una tarjeta que sale hacia un buffer debe conservar transición V3 completa aunque coincida con edge-wrap."
);

console.log(
  "Hero motion continuity structure: OK (buffers físicos, salida interpolada, fitting visible-only y motor no interrumpible)."
);
