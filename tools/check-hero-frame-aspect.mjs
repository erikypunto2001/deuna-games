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
  /label="Ancho"[\s\S]*?label="Alto"/,
  'El tamaño del Hero debe seguir siendo editable directamente mediante ancho y alto.'
);

console.log('Hero frame aspect: OK (el editor usa tamaño directo; no mantiene un segundo sistema de aspecto).');
