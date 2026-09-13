import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveHomeConfig, sourceHomeConfig } from '../src/data/home-config.ts';
import { applyHeroLayout, applyPreset, carouselLayouts } from '../src/lib/home/hero-presets.ts';
import { homeHeroVisiblePositions, homeHeroAnchor, homeHeroSlotCSS, fitHomeHeroBounds } from '../src/lib/home/hero-layout.ts';
import { HOME_HERO_MAX_SLIDES } from '../src/lib/home/hero-contract.ts';
import { homeHeroEditorFormSchema } from '../src/lib/admin/home-config-forms.ts';
import { resolveHomeCollectionGames } from '../src/lib/home/ranking.ts';
import { editorialHomeConfigSchema } from '../src/lib/admin/content-validation-core.ts';
import { games } from '../src/data/games.ts';

const baseline = resolveHomeConfig(sourceHomeConfig).heroPresentation;
const original = structuredClone(baseline);
const parse = (presentation) => homeHeroEditorFormSchema.safeParse({ expectedRevision: '1', heroJson: JSON.stringify({ mode: 'manual', slugs: [], copy: sourceHomeConfig.copy.hero, presentation }) });
for (const { id } of carouselLayouts) {
  const presentation = applyHeroLayout(id, baseline);
  assert.ok(parse(presentation).success, `${id} must persist through the admin schema`);
  const saved = editorialHomeConfigSchema.safeParse({ ...sourceHomeConfig, heroPresentation: presentation });
  assert.ok(saved.success, `${id} must survive the draft/publication validation: ${saved.error?.message}`);
  assert.deepEqual(resolveHomeConfig(saved.data).heroPresentation, presentation);
  for (const device of ['desktop', 'tablet', 'mobile']) {
    const settings = presentation.responsive[device];
    for (const count of [0, 1, 2, 3, 4, 5]) {
      const slots = homeHeroVisiblePositions(settings, presentation.direction, count);
      assert.ok(slots.includes('main'));
      assert.ok(slots.length <= Math.max(count, 1));
      if (id === 'left' || id === 'duo') assert.ok(!slots.some(slot => slot.startsWith('left')));
      if (id === 'right') assert.ok(!slots.some(slot => slot.startsWith('right')));
      if (id === 'single') assert.deepEqual(slots, ['main']);
    }
    const hidden = { ...settings, hiddenPositions: ['left1', 'left2', 'right1', 'right2'] };
    assert.deepEqual(homeHeroVisiblePositions(hidden, presentation.direction, 5), ['main']);
  }
}
assert.deepEqual(baseline, original, 'Applying layouts must not mutate saved configuration');
const left = applyHeroLayout('left', baseline);
assert.equal(left.direction, 'forward');
assert.equal(
  homeHeroAnchor(left.responsive.desktop),
  'calc(50% - (var(--hero-card-width) * 0.36 + var(--hero-gap) * 1))',
  'Left layouts must center the complete main/right composition instead of pinning the main card to the page edge'
);
assert.deepEqual(homeHeroVisiblePositions({ ...left.responsive.desktop, hiddenPositions: ['right1'] }, 'forward', 2), ['main'], 'Hidden positions must not produce duplicate games in short carousels');
const duo = applyHeroLayout('duo', baseline);
assert.equal(
  homeHeroAnchor(duo.responsive.desktop),
  'calc(50% - (var(--hero-card-width) * 0.21 + var(--hero-gap) * 0.5))',
  'Duo layouts must center the two-card visual group'
);
const right = applyHeroLayout('right', baseline);
assert.equal(right.direction, 'reverse');
assert.equal(
  homeHeroAnchor(right.responsive.desktop),
  'calc(50% + (var(--hero-card-width) * 0.36 + var(--hero-gap) * 1))',
  'Right layouts must mirror the centered one-sided composition'
);
assert.deepEqual(applyPreset('Classic', applyPreset('Spotlight', baseline)), applyPreset('Classic', baseline), 'Presets must reset the visual properties they own');

const old = structuredClone(baseline);
for (const settings of Object.values(old.responsive)) {
  delete settings.alignment;
  delete settings.hiddenPositions;
  delete settings.spaceBefore;
  delete settings.spaceAfter;
  delete settings.spacingReference;
}
delete old.navigation;
const parsedOld = parse(old);
assert.ok(parsedOld.success, 'Existing saved drafts without responsive spacing, spacing reference or navigation settings must remain valid');
assert.equal(parsedOld.data.heroJson.presentation.responsive.desktop.spaceBefore, 28);
assert.equal(parsedOld.data.heroJson.presentation.responsive.desktop.spaceAfter, 58);
assert.equal(parsedOld.data.heroJson.presentation.responsive.desktop.spacingReference, 'visual');
assert.equal(parsedOld.data.heroJson.presentation.responsive.tablet.spaceBefore, 20);
assert.equal(parsedOld.data.heroJson.presentation.responsive.tablet.spaceAfter, 58);
assert.equal(parsedOld.data.heroJson.presentation.responsive.tablet.spacingReference, 'visual');
assert.equal(parsedOld.data.heroJson.presentation.responsive.mobile.spaceBefore, 14);
assert.equal(parsedOld.data.heroJson.presentation.responsive.mobile.spaceAfter, 38);
assert.equal(parsedOld.data.heroJson.presentation.responsive.mobile.spacingReference, 'visual');
assert.equal(parsedOld.data.heroJson.presentation.navigation.style, 'segmented-pro');
assert.deepEqual(parsedOld.data.heroJson.presentation.navigation.responsive.desktop, { x: 50, y: 91, scale: 100 });
assert.deepEqual(parsedOld.data.heroJson.presentation.navigation.responsive.tablet, { x: 50, y: 91, scale: 100 });
assert.deepEqual(parsedOld.data.heroJson.presentation.navigation.responsive.mobile, { x: 50, y: 92, scale: 92 });
const resolvedOld = resolveHomeConfig({ ...sourceHomeConfig, heroPresentation: old }).heroPresentation;
assert.equal(resolvedOld.responsive.desktop.spaceBefore, 28);
assert.equal(resolvedOld.responsive.desktop.spaceAfter, 58);
assert.equal(resolvedOld.responsive.desktop.spacingReference, 'visual');
assert.equal(resolvedOld.navigation.style, 'segmented-pro');
assert.deepEqual(resolvedOld.navigation.responsive.desktop, { x: 50, y: 91, scale: 100 });
assert.deepEqual(homeHeroVisiblePositions(old.responsive.desktop, 'forward', 5), ['left2', 'left1', 'main', 'right1', 'right2']);

for (const style of ['segmented-pro', 'integrated', 'pills', 'dots', 'timeline', 'minimal', 'glass', 'rail']) {
  const presentation = structuredClone(baseline);
  presentation.navigation.style = style;
  const parsed = parse(presentation);
  assert.ok(parsed.success, `Navigation style ${style} must persist through the admin schema`);
  const saved = editorialHomeConfigSchema.safeParse({ ...sourceHomeConfig, heroPresentation: presentation });
  assert.ok(saved.success, `Navigation style ${style} must survive publication validation`);
}
const maximumNavigation = structuredClone(baseline);
maximumNavigation.navigation.responsive.desktop.x = 100;
maximumNavigation.navigation.responsive.desktop.y = 100;
maximumNavigation.navigation.responsive.desktop.scale = 180;
assert.ok(parse(maximumNavigation).success, 'Free navigation positioning must persist across the documented range');
const invalidNavigationX = structuredClone(maximumNavigation);
invalidNavigationX.navigation.responsive.desktop.x = 101;
assert.equal(parse(invalidNavigationX).success, false, 'Navigation X must stay inside the Hero percentage range');
const invalidNavigationScale = structuredClone(maximumNavigation);
invalidNavigationScale.navigation.responsive.desktop.scale = 181;
assert.equal(parse(invalidNavigationScale).success, false, 'Navigation scale must not exceed 180 percent');

const legacyManualAutoplay = resolveHomeConfig({
  ...sourceHomeConfig,
  heroPresentation: { ...baseline, autoplay: true, autoplayMs: 0 },
}).heroPresentation;
assert.equal(legacyManualAutoplay.autoplayMs, 0);
assert.equal(legacyManualAutoplay.autoplay, false, 'Legacy autoplayMs=0 must remain manual instead of inheriting an enabled autoplay switch');
assert.equal(parse({ ...left, responsive: { ...left.responsive, desktop: { ...left.responsive.desktop, hiddenPositions: ['main'] } } }).success, false);
assert.equal(parse({ ...left, responsive: { ...left.responsive, desktop: { ...left.responsive.desktop, visibleCards: 0 } } }).success, false);
const expandedFrame = structuredClone(baseline);
expandedFrame.responsive.desktop.cardWidth = 1800;
expandedFrame.responsive.desktop.cardHeight = 1200;
assert.ok(parse(expandedFrame).success, 'The editor must persist the expanded 1800×1200 frame range used by wide, tall and custom-ratio frames');
const oversizedFrame = structuredClone(expandedFrame);
oversizedFrame.responsive.desktop.cardWidth = 1801;
assert.equal(parse(oversizedFrame).success, false, 'The editor must reject dimensions beyond the documented frame range');
const maximumSpacing = structuredClone(baseline);
maximumSpacing.responsive.desktop.spaceBefore = 160;
maximumSpacing.responsive.desktop.spaceAfter = 200;
assert.ok(parse(maximumSpacing).success, 'The editor must persist the documented exterior spacing range');
const zeroSpacing = structuredClone(baseline);
zeroSpacing.responsive.desktop.spaceBefore = 0;
zeroSpacing.responsive.desktop.spaceAfter = 0;
assert.ok(parse(zeroSpacing).success, 'The editor must allow a Hero with no exterior spacing');
const canvasSpacing = structuredClone(baseline);
canvasSpacing.responsive.desktop.spacingReference = 'canvas';
assert.ok(parse(canvasSpacing).success, 'The editor must persist canvas-based spacing when explicitly requested');
assert.ok(editorialHomeConfigSchema.safeParse({ ...sourceHomeConfig, heroPresentation: canvasSpacing }).success, 'Canvas-based spacing must survive publication validation');
const invalidSpacingReference = structuredClone(baseline);
invalidSpacingReference.responsive.desktop.spacingReference = 'viewport';
assert.equal(parse(invalidSpacingReference).success, false, 'Unknown spacing references must be rejected');
const invalidBeforeSpacing = structuredClone(maximumSpacing);
invalidBeforeSpacing.responsive.desktop.spaceBefore = 161;
assert.equal(parse(invalidBeforeSpacing).success, false, 'Top Hero spacing must not exceed 160px');
const invalidAfterSpacing = structuredClone(maximumSpacing);
invalidAfterSpacing.responsive.desktop.spaceAfter = 201;
assert.equal(parse(invalidAfterSpacing).success, false, 'Bottom Hero spacing must not exceed 200px');
const pinned = games.slice(0, 5).map(game => game.slug);
assert.equal(resolveHomeCollectionGames(games, 'hero', 'hybrid', pinned, 5).length, 5, 'A full mixed selection must not grow beyond the limit');
assert.deepEqual(resolveHomeCollectionGames(games, 'hero', 'manual', pinned, 5).map(game => game.slug), pinned);
const tooManySlugs = games.slice(0, HOME_HERO_MAX_SLIDES + 1).map(game => game.slug);
assert.equal(homeHeroEditorFormSchema.safeParse({
  expectedRevision: '1',
  heroJson: JSON.stringify({ mode: 'manual', slugs: tooManySlugs, copy: sourceHomeConfig.copy.hero, presentation: baseline }),
}).success, false, 'The unified Hero editor must reject more games than the public Hero can display');
console.log('Hero layouts: OK (persistence, centered one-sided layouts, legacy drafts, resolution-stable visual spacing, optional canvas spacing, unified navigation styles/placement, hidden slots, presets, autoplay compatibility, expanded frame range, five-slide contract and mixed selection).');

// Large/translated/rotated compositions must remain centered and fully inside
// the exact configured stage. There is no hidden 48px vertical reserve anymore.
for (const alignment of ['left', 'center', 'right']) {
  for (const [width, height] of [[300, 400], [680, 500], [1440, 700]]) {
    for (const bounds of [
      { left: -800, top: -100, right: 1900, bottom: 800 },
      { left: 100, top: 50, right: 600, bottom: 400 },
      { left: -2000, top: -1000, right: 4000, bottom: 3000 },
    ]) {
      const fit = fitHomeHeroBounds(bounds, width, height, alignment);
      assert.ok(fit.scale > 0 && fit.scale <= 1);
      assert.ok(bounds.left * fit.scale + fit.x >= -1e-6);
      assert.ok(bounds.right * fit.scale + fit.x <= width + 1e-6);
      assert.ok(bounds.top * fit.scale + fit.y >= -1e-6);
      assert.ok(bounds.bottom * fit.scale + fit.y <= height + 1e-6);
      assert.equal(fit.x, (1 - fit.scale) * width / 2, 'Horizontal fitting must scale around the Hero center instead of translating a rotated composition sideways');
    }
  }
}
assert.equal(homeHeroSlotCSS('main'), '0px');
assert.ok(homeHeroSlotCSS('right2').includes('var(--hero-card-width)'));
console.log('Hero fitting: OK (exact stage height, center-stable rotations, perspective overflow and all alignments).');

assert.deepEqual(fitHomeHeroBounds({ left: 100, top: 60, right: 600, bottom: 400 }, 1440, 700), { scale: 1, x: 0, y: 0 }, 'Fitting must not cancel manual translations when the cards already fit');
assert.deepEqual(fitHomeHeroBounds({ left: 0, top: 0, right: 300, bottom: 400 }, 300, 400), { scale: 1, x: 0, y: 0 }, 'A card that exactly fills the configured stage must require no hidden vertical clearance');

const heroSectionSource = readFileSync(new URL('../src/components/home/HeroSection.tsx', import.meta.url), 'utf8');
const heroSectionCss = readFileSync(new URL('../src/components/home/HeroSection.module.css', import.meta.url), 'utf8');
assert.ok(
  heroSectionSource.includes('const responsive = presentation.responsive[designDevice];'),
  'Hero fitting must use the same resolved device as rendering instead of recomputing breakpoints independently'
);
assert.ok(
  heroSectionSource.includes('root.style.setProperty("--hero-motion-duration", "0ms")') &&
    heroSectionSource.includes('void fit.offsetWidth;'),
  'Hero fitting must measure target geometry with card motion temporarily settled'
);
assert.ok(
  heroSectionSource.includes('}, [presentation, games.length, designDevice]);'),
  'Hero fitting must only rerun for structural layout/device changes'
);
assert.ok(
  !heroSectionSource.includes('}, [presentation, games.length, normalizedActiveIndex]);'),
  'Changing the active Hero image must never trigger a new geometry fit'
);
assert.ok(
  heroSectionSource.includes('return viewport ? { ...viewport, aspect: undefined } : undefined;'),
  'Hero artwork must discard editorial image aspect ratios so images cannot resize the fixed Hero frame'
);
assert.ok(
  /\.carouselViewport\{[^}]*height:var\(--hero-card-height\)/.test(heroSectionCss) &&
    /\.heroCard\{[^}]*height:var\(--hero-card-height\)/.test(heroSectionCss),
  'The public/editor shared renderer must keep both viewport and cards on the configured fixed Hero height'
);
console.log('Hero height stability: OK (image-independent frame, device-consistent fitting and no slide-triggered geometry remeasurement).');
