import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const editor = await readFile(
  new URL('../src/components/admin/HomeHeroEditor.tsx', import.meta.url),
  'utf8'
);

assert.doesNotMatch(
  editor,
  /simplifyHeroFrameRatio|AspectPreset|AspectControl|aspectPresets|setAspectPreset|setAspectLocked|updateCustomAspect/,
  'El editor simple no debe reconstruir un subsistema de relación de aspecto independiente del tamaño real del Hero.'
);
assert.doesNotMatch(
  editor,
  /Encuadre de la tarjeta|Mantener proporción al cambiar tamaño|Proporción horizontal|Proporción vertical/,
  'La relación de aspecto no debe volver a exponerse como microcontrol editorial.'
);
assert.match(
  editor,
  /label="Extender hasta las flechas"[\s\S]*?label="Ancho manual"[\s\S]*?label="Alto"/,
  'El tamaño del Hero debe seguir siendo editable mediante ancho manual o ancho hasta las flechas, conservando el alto como control independiente.'
);
assert.match(
  editor,
  /responsive\.cardWidthMode === "fixed"[\s\S]*?<Range[\s\S]*?label="Ancho manual"/,
  'El ancho manual debe permanecer disponible cuando el modo adaptable está desactivado.'
);

console.log('Hero frame aspect: OK (ancho fijo o hasta flechas + alto independiente, sin segundo sistema de aspecto).');
