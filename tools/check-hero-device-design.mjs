import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sourceHomeConfig, resolveHomeConfig } from '../src/data/home-config.ts';
import { applyHeroLayout, applyPreset } from '../src/lib/home/hero-presets.ts';
import { resolveHeroDeviceDesign, updateHeroDeviceDesign } from '../src/lib/home/hero-device-design.ts';
import { homeHeroPresentationEditorSchema, homeHeroPresentationInputSchema } from '../src/lib/home/hero-schema.ts';
import { homeHeroEditorFormSchema } from '../src/lib/admin/home-config-forms.ts';
import { editorialHomeConfigSchema } from '../src/lib/admin/content-validation-core.ts';
const original = structuredClone(sourceHomeConfig.heroPresentation);
const mobile = updateHeroDeviceDesign(original, 'mobile', p => applyPreset('Cinema', applyHeroLayout('single', p)));
const resolvedDesktop = resolveHeroDeviceDesign(mobile, 'desktop');
const resolvedTablet = resolveHeroDeviceDesign(mobile, 'tablet');
const resolvedMobile = resolveHeroDeviceDesign(mobile, 'mobile');
assert.equal(resolvedDesktop.composition, original.composition);
assert.equal(resolvedTablet.composition, original.composition);
assert.deepEqual(resolvedDesktop.positions, original.positions);
assert.deepEqual(resolvedTablet.positions, original.positions);
assert.deepEqual(resolvedDesktop.responsive.desktop, original.responsive.desktop);
assert.deepEqual(resolvedTablet.responsive.tablet, original.responsive.tablet);
assert.deepEqual(resolvedDesktop.responsive.mobile, resolvedMobile.responsive.mobile);
assert.deepEqual(resolvedTablet.responsive.mobile, resolvedMobile.responsive.mobile);
assert.deepEqual(
  resolvedDesktop.navigation.responsive.mobile,
  resolvedMobile.navigation.responsive.mobile
);
assert.equal(resolvedMobile.responsive.mobile.visibleCards, 1);
assert.equal(resolvedMobile.composition, 'cinema');
const stored = homeHeroPresentationInputSchema.parse(JSON.parse(JSON.stringify(homeHeroPresentationEditorSchema.parse(mobile))));
assert.deepEqual(resolveHomeConfig({...sourceHomeConfig, heroPresentation: stored}).heroPresentation, mobile);
const all = updateHeroDeviceDesign(mobile, 'all', p => { p.radius = 25; p.responsive.mobile.gap = 43; return p; }, 'mobile');
for (const device of ['desktop','tablet','mobile']) {
 assert.equal(resolveHeroDeviceDesign(all,device).radius,25);
 assert.equal(resolveHeroDeviceDesign(all,device).responsive[device].gap,43);
}
assert.equal(resolveHeroDeviceDesign(all,'mobile').composition,'cinema');
assert.deepEqual(original,sourceHomeConfig.heroPresentation);
assert.equal(homeHeroPresentationEditorSchema.safeParse({...mobile,deviceOverrides:{mobile:{...original,deviceOverrides:{mobile:original}}}}).success,false);
console.log('Hero device design: OK (isolated presets/layouts, effective cross-device slots, shared edits, persistence, V3 motion style, bounded validation).');

let full = original;
for (const device of ['desktop','tablet','mobile']) full = updateHeroDeviceDesign(full, device, p => applyPreset('Cinema', p));
assert.ok(homeHeroEditorFormSchema.safeParse({expectedRevision:'1',heroJson:JSON.stringify({mode:'manual',slugs:sourceHomeConfig.heroSlugs,presentation:full})}).success);
console.log('Hero form: OK (all three device designs fit and survive form validation).');
const persistedHome = editorialHomeConfigSchema.parse({ ...sourceHomeConfig, heroPresentation: full });
assert.deepEqual(persistedHome.heroPresentation, full);
assert.deepEqual(resolveHomeConfig(JSON.parse(JSON.stringify(persistedHome))).heroPresentation, full);
assert.equal(editorialHomeConfigSchema.safeParse({
  ...sourceHomeConfig,
  heroPresentation: { ...full, deviceOverrides: { mobile: { ...original, deviceOverrides: { mobile: original } } } },
}).success, false);
console.log('Hero editorial persistence: OK (device designs survive Home validation and reload; nested overrides rejected).');

// `motionStyle` is a revision-level runtime contract, not a device style. A
// copied historical/device override must never choose another movement profile
// independently from the presentation revision that owns the Hero.
const mixedStyle = structuredClone(original);
mixedStyle.motionStyle = 'parallax';
mixedStyle.deviceOverrides = {
  mobile: {
    ...structuredClone(original),
    motionStyle: 'morph',
  },
};
assert.equal(resolveHeroDeviceDesign(mixedStyle, 'desktop').motionStyle, 'parallax');
assert.equal(resolveHeroDeviceDesign(mixedStyle, 'tablet').motionStyle, 'parallax');
assert.equal(resolveHeroDeviceDesign(mixedStyle, 'mobile').motionStyle, 'parallax');
const mobileVisualEdit = updateHeroDeviceDesign(mixedStyle, 'mobile', design => {
  design.radius = 29;
  return design;
});
assert.equal(mobileVisualEdit.motionStyle, 'parallax');
assert.equal(resolveHeroDeviceDesign(mobileVisualEdit, 'mobile').motionStyle, 'parallax');
assert.equal(resolveHeroDeviceDesign(mobileVisualEdit, 'mobile').radius, 29);
const deviceScopedMotionEdit = updateHeroDeviceDesign(
  mixedStyle,
  'mobile',
  design => {
    design.motionStyle = 'morph';
    return design;
  }
);
assert.equal(deviceScopedMotionEdit.motionStyle, 'morph');
for (const device of ['desktop', 'tablet', 'mobile']) {
  assert.equal(resolveHeroDeviceDesign(deviceScopedMotionEdit, device).motionStyle, 'morph');
}
console.log('Hero motion style scope: OK (the single V3 movement profile remains global across device snapshots and device-scoped editor actions).');

// Reproduce a subtle shared-edit case: an override can already have the requested
// source-device value in its copied desktop slot while its own slot is divergent.
// A later "all devices" edit must still propagate the source change to that slot.
let divergent = updateHeroDeviceDesign(original, 'all', design => {
  design.responsive.desktop.gap = 79;
  design.navigation.responsive.desktop.y = 20;
  return design;
}, 'desktop');
divergent = updateHeroDeviceDesign(divergent, 'mobile', design => {
  design.responsive.mobile.gap = 31;
  design.navigation.responsive.mobile.y = 80;
  return design;
});
divergent = updateHeroDeviceDesign(divergent, 'desktop', design => {
  design.responsive.desktop.gap = 42;
  design.navigation.responsive.desktop.y = 40;
  return design;
});
divergent = updateHeroDeviceDesign(divergent, 'all', design => {
  design.responsive.desktop.gap = 79;
  design.navigation.responsive.desktop.y = 20;
  return design;
}, 'desktop');
for (const device of ['desktop', 'tablet', 'mobile']) {
  assert.equal(resolveHeroDeviceDesign(divergent, device).responsive[device].gap, 79);
  assert.equal(resolveHeroDeviceDesign(divergent, device).navigation.responsive[device].y, 20);
}
console.log('Hero shared edits: OK (divergent device snapshots receive the same requested change).');

// Historical/runtime compatibility still supports copying spacing between devices.
// The simplified editor no longer exposes a link switch, but the device resolver
// must keep cross-device slots current so old drafts and programmatic edits remain safe.
let linkedSpacing = original;
linkedSpacing = updateHeroDeviceDesign(linkedSpacing, 'desktop', design => {
  design.responsive.desktop.spaceBefore = 11;
  design.responsive.desktop.spaceAfter = 17;
  design.responsive.desktop.spacingReference = 'canvas';
  design.navigation.responsive.desktop.y = 24;
  return design;
});
linkedSpacing = updateHeroDeviceDesign(linkedSpacing, 'tablet', design => {
  design.responsive.tablet.spaceBefore = 33;
  design.responsive.tablet.spaceAfter = 47;
  design.responsive.tablet.spacingReference = 'visual';
  design.navigation.responsive.tablet.y = 66;
  return design;
});
linkedSpacing = updateHeroDeviceDesign(linkedSpacing, 'mobile', design => {
  design.responsive.mobile.spaceBefore = 55;
  design.responsive.mobile.spaceAfter = 69;
  design.responsive.mobile.spacingReference = 'canvas';
  design.navigation.responsive.mobile.y = 82;
  return design;
});
const effectiveDesktop = resolveHeroDeviceDesign(linkedSpacing, 'desktop');
const effectiveTablet = resolveHeroDeviceDesign(linkedSpacing, 'tablet');
const effectiveMobile = resolveHeroDeviceDesign(linkedSpacing, 'mobile');
assert.deepEqual(effectiveTablet.responsive.desktop, effectiveDesktop.responsive.desktop);
assert.deepEqual(effectiveTablet.responsive.mobile, effectiveMobile.responsive.mobile);
assert.deepEqual(
  effectiveTablet.navigation.responsive.desktop,
  effectiveDesktop.navigation.responsive.desktop
);
assert.deepEqual(
  effectiveTablet.navigation.responsive.mobile,
  effectiveMobile.navigation.responsive.mobile
);
const selectedTabletSpacing = structuredClone(effectiveTablet.responsive.tablet);
linkedSpacing = updateHeroDeviceDesign(linkedSpacing, 'all', design => {
  const source = design.responsive.tablet;
  for (const device of ['desktop', 'tablet', 'mobile']) {
    design.responsive[device].spaceBefore = source.spaceBefore;
    design.responsive[device].spaceAfter = source.spaceAfter;
    design.responsive[device].spacingReference = source.spacingReference;
  }
  return design;
}, 'tablet');
for (const device of ['desktop', 'tablet', 'mobile']) {
  const effective = resolveHeroDeviceDesign(linkedSpacing, device).responsive[device];
  assert.equal(effective.spaceBefore, selectedTabletSpacing.spaceBefore);
  assert.equal(effective.spaceAfter, selectedTabletSpacing.spaceAfter);
  assert.equal(effective.spacingReference, selectedTabletSpacing.spacingReference);
}
console.log('Hero spacing compatibility: OK (effective cross-device baselines stay current for historical and programmatic edits).');

const heroEditorSource = await readFile(
  new URL('../src/components/admin/HomeHeroEditor.tsx', import.meta.url),
  'utf8'
);

assert.doesNotMatch(
  heroEditorSource,
  /HomeHeroSpacingControls|HomeHeroNavigationControls|simplifyHeroFrameRatio|AspectControl|setAspectLocked|updateAspectControls/,
  'The simple Hero editor must not depend on removed advanced inspector helpers.'
);
assert.match(
  heroEditorSource,
  /const setResponsive = \([\s\S]*?"cardWidth"[\s\S]*?"cardHeight"[\s\S]*?"gap"[\s\S]*?"spaceBefore"[\s\S]*?"spaceAfter"/,
  'The simple Hero editor must keep only the essential per-device geometry controls.'
);
assert.match(
  heroEditorSource,
  /if \(key === "spaceBefore" \|\| key === "spaceAfter"\) \{[\s\S]*?settings\.spacingReference = "visual";/,
  'Simple Hero spacing must always use the stable visual reference.'
);
assert.match(
  heroEditorSource,
  /settings\.cardWidth = original\.cardWidth;[\s\S]*?settings\.cardHeight = original\.cardHeight;[\s\S]*?settings\.gap = original\.gap;[\s\S]*?settings\.spaceBefore = original\.spaceBefore;[\s\S]*?settings\.spaceAfter = original\.spaceAfter;[\s\S]*?settings\.spacingReference = "visual";/,
  'Restoring the simple layout must restore all essential geometry and use visual spacing.'
);
assert.doesNotMatch(
  heroEditorSource,
  /Mantener proporción al cambiar tamaño|Encuadre de la tarjeta|Perspectiva|Referencia del espaciado|Mismo espaciado en todos los dispositivos/,
  'Removed advanced sizing and spacing controls must not return.'
);
console.log('Hero simple device editor: OK (essential geometry only, visual spacing and no duplicate advanced sizing system).');
