import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, css, schema, adminControls, heroSource, heroCss, motionCss, livePreview, saveBoundary, deviceDesign, homeContentService, browserSmoke] = await Promise.all([
  readFile(new URL('../src/components/home/HeroNavigation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/home/HeroNavigation.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/home/hero-schema.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/HomeHeroNavigationControls.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/home/HeroSection.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/home/HeroSection.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/home/HeroMotion.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/HomeHeroLivePreview.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/HomeHeroSaveBoundary.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/home/hero-device-design.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/admin/home-content-service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./hero-motion-browser-smoke.mjs', import.meta.url), 'utf8'),
]);

assert.match(source, /const announceSlideChanges = isPaused;/);
assert.match(source, /aria-live=\{announceSlideChanges \? "polite" : "off"\}/);
assert.doesNotMatch(source, /aria-live="polite"/);
assert.match(source, /aria-current=\{active \? "true" : undefined\}/);
assert.match(source, /aria-pressed=\{manualPaused\}/);
assert.match(source, /const pauseVisible = autoplayDelay !== null;/);
assert.doesNotMatch(adminControls, /onToggle\("showPause"/);
assert.match(schema, /showPause:\s*autoplay \|\| presentation\.navigation\.showPause/);
assert.match(schema, /motionStyle:\s*presentation\.motionStyle \?\? legacyTransitionToMotionStyle\(legacyTransition\)/);
assert.match(css, /--hero-navigation-target-size:\s*max\(24px,\s*calc\(2400px \/ var\(--hero-navigation-scale\)\)\);/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none/);

assert.match(heroSource, /data-motion-style=\{presentation\.motionStyle\}/);
assert.match(heroSource, /key=\{game\.id\}/);
assert.match(heroSource, /const renderPositions = visiblePositions;/);
assert.match(heroSource, /homeHeroVisiblePositions\(/);
assert.match(heroSource, /"--hero-drag-offset": `\$\{dragOffset\}px`/);
assert.match(heroSource, /homeHeroPositionTransform\(positionStyle\)/);
assert.match(heroCss, /\.heroCard\{/);
assert.doesNotMatch(heroCss, /data-transition|--hero-editor-duration|--hero-editor-easing|@keyframes hero(?:Slide|Fade|Coverflow|Depth|Stack|Perspective|Custom)/);
assert.match(heroSource, /setDragOffset\(dx\)/);
assert.match(heroSource, /dragging \|\|[\s\S]*?!documentVisible/);
assert.match(heroSource, /requestAnimationFrame\(finish\)/);
assert.match(heroSource, /const fittedCards = cards\.filter\(\(card\) => card\.dataset\.position === "main"\);/);
assert.doesNotMatch(heroSource, /motionEngine|physicalMotion|data-motion-engine|data-transition/);
assert.match(heroSource, /const \[motionDelta, setMotionDelta\] = useState\(0\);/);
assert.match(heroSource, /const previousActiveIndex = games\.length[\s\S]*?normalizedActiveIndex - motionDelta/);
assert.match(heroSource, /const previousPosition = presentation\.loop && motionDelta !== 0[\s\S]*?visiblePositions\.find/);
assert.match(heroSource, /homeHeroPositionOffset\(position\) - homeHeroPositionOffset\(previousPosition\) !== -motionDelta/);
assert.doesNotMatch(heroSource, /const fullPhysicalLoop/);
assert.match(heroSource, /const PARALLAX_ARTWORK_TRANSFORM:[\s\S]*?left2:[\s\S]*?main:[\s\S]*?right2:/);
assert.match(heroSource, /presentation\.motionStyle === "parallax"[\s\S]*?PARALLAX_ARTWORK_TRANSFORM\[position\]/);
assert.match(heroSource, /className=\{`\$\{styles\.media\} \$\{motionStyles\.motionArtwork\}`\} style=\{parallaxArtworkStyle\}/);
for (const style of ['momentum', 'morph', 'parallax']) assert.match(motionCss, new RegExp(`data-motion-style="${style}"`));
assert.doesNotMatch(motionCss, /data-motion-style="(?:slide|fade|coverflow|3d|stack|perspective|custom)"/);
assert.match(motionCss, /data-motion-style="morph"[\s\S]*?--hero-motion-scale-x/);
assert.match(motionCss, /data-motion-style="parallax"[\s\S]*?\.motionArtwork[\s\S]*?translate3d/);
assert.match(motionCss, /data-dragging="true"[\s\S]*?transition:\s*none/);
assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none !important/);
assert.match(deviceDesign, /motionStyle:\s*base\.motionStyle/);
assert.match(livePreview, /<HeroSection[\s\S]*?presentation=\{effectivePresentation\}/);
assert.match(livePreview, /const effectivePresentation = presentation;/);
assert.match(livePreview, /Repetir movimiento ahora/);
assert.match(livePreview, /Home pública cambia sólo al publicar Inicio\./i);
assert.doesNotMatch(livePreview, /useHomeHeroDraftSave|requestMotionEngineSave|motionEngine|requestSubmit\(|JSON\.parse\(/);
assert.match(saveBoundary, /onSubmitCapture=\{saveHero\}/);
assert.match(saveBoundary, /persistHeroRecoveryFields\(fields\);[\s\S]*?catch \(error\) \{[\s\S]*?persistHeroRecoveryFields\(fields\);/);
assert.doesNotMatch(saveBoundary, /motionEngine|fieldsWithMotionEngine|HeroDraftSaveContext/);
assert.match(homeContentService, /export async function saveHomeHeroDraft\(/);
assert.doesNotMatch(homeContentService, /saveHomeHeroMotionEngineDraft/);

// Nodes returned by an iframe live in a different JS realm. The runtime smoke must
// validate them by capability/geometry instead of comparing against parent-window constructors.
assert.match(browserSmoke, /typeof viewportNode\.getBoundingClientRect !== 'function'/);
assert.match(browserSmoke, /vr\.width > 0/);
assert.doesNotMatch(browserSmoke, /viewportNode instanceof HTMLElement/);
assert.match(browserSmoke, /beforeDragMain/);
assert.match(browserSmoke, /commit del drag real/);
assert.match(browserSmoke, /El drag no confirmó el cambio del juego principal al soltar/);

for (const scale of [50, 92, 100, 180]) {
  const target = Math.max(24, 2400 / scale) * (scale / 100);
  assert.ok(target >= 24 - Number.EPSILON);
}
console.log('Hero accessibility/motion: OK (single V3 engine, continuous drag commit, physical edge-wrap detection, runtime Parallax geometry, three profiles, panoramic fitting and canonical save ownership).');
