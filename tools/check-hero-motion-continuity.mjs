import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hero = await readFile("src/components/home/HeroSection.tsx", "utf8");

assert.match(
  hero,
  /heroMotionRenderPositions\(visiblePositions, direction, motionDelta\)/,
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
  /renderedPositionsRef\.current\.get\(String\(game\.id\)\)/,
  "Edge-wrap debe basarse en la posición física anterior real de cada tarjeta."
);

console.log(
  "Hero motion continuity structure: OK (buffers físicos, fitting visible-only y motor no interrumpible)."
);
