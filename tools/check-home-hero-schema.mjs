import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  resolveHomeConfig,
  sourceHomeConfig,
} from "../src/data/home-config.ts";
import {
  homeHeroPresentationEditorSchema,
  homeHeroPresentationInputSchema,
} from "../src/lib/home/hero-schema.ts";

const failures = [];
const root = process.cwd();

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function clone(value) {
  return structuredClone(value);
}

const current = clone(sourceHomeConfig.heroPresentation);
assert(
  current.motionStyle === "momentum",
  "La presentación fuente debe usar Momentum como movimiento V3 canónico."
);
assert(
  !Object.hasOwn(current, "motionEngine") &&
    !Object.hasOwn(current, "transition") &&
    !Object.hasOwn(current, "durationMs") &&
    !Object.hasOwn(current, "easing"),
  "El contrato resuelto actual no debe reintroducir controles del motor V2."
);
assert(
  current.navigation.arrowIcon === "chevron" &&
    current.navigation.arrowShape === "circle" &&
    current.navigation.arrowResponsive.desktop.y === 50 &&
    current.navigation.arrowResponsive.mobile.y === 46,
  "La configuración fuente debe conservar el aspecto y posición históricos de las flechas como defaults explícitos."
);
assert(
  ["desktop", "tablet", "mobile"].every(
    (device) => current.responsive[device].cardWidthMode === "fixed"
  ),
  "Los defaults actuales deben preservar el ancho fijo para no alterar revisiones existentes."
);
assert(
  homeHeroPresentationEditorSchema.safeParse(current).success,
  "La presentación fuente del Hero debe cumplir el contrato completo del editor."
);
assert(
  homeHeroPresentationInputSchema.safeParse(current).success,
  "La presentación fuente del Hero debe ser válida como revisión persistida."
);

const legacyMinimal = {
  composition: current.composition,
  previewCount: current.previewCount,
  motion: "slide",
  autoplayMs: current.autoplayMs,
};
assert(
  homeHeroPresentationInputSchema.safeParse(legacyMinimal).success,
  "El contrato persistido debe seguir aceptando revisiones históricas anteriores al motor V3."
);

const legacySlide = clone(current);
delete legacySlide.motionStyle;
legacySlide.motionEngine = "legacy";
legacySlide.transition = "slide";
legacySlide.durationMs = 500;
legacySlide.easing = "ease";
const normalizedLegacySlide = homeHeroPresentationEditorSchema.safeParse(legacySlide);
assert(
  normalizedLegacySlide.success &&
    normalizedLegacySlide.data.motionStyle === "momentum" &&
    !Object.hasOwn(normalizedLegacySlide.data, "motionEngine") &&
    !Object.hasOwn(normalizedLegacySlide.data, "transition") &&
    !Object.hasOwn(normalizedLegacySlide.data, "durationMs") &&
    !Object.hasOwn(normalizedLegacySlide.data, "easing"),
  "Un borrador V2 debe normalizarse a Momentum y expulsar los campos del motor anterior."
);
const resolvedLegacySlide = resolveHomeConfig({
  ...sourceHomeConfig,
  heroPresentation: legacySlide,
}).heroPresentation;
assert(
  resolvedLegacySlide.motionStyle === "momentum" &&
    !Object.hasOwn(resolvedLegacySlide, "motionEngine") &&
    !Object.hasOwn(resolvedLegacySlide, "transition"),
  "Un snapshot V2 publicado debe entrar al runtime por el único contrato V3."
);

for (const [transition, expected] of [
  ["coverflow", "morph"],
  ["3d", "morph"],
  ["perspective", "morph"],
  ["fade", "parallax"],
  ["stack", "parallax"],
  ["custom", "parallax"],
]) {
  const historical = clone(current);
  delete historical.motionStyle;
  historical.transition = transition;
  const normalized = homeHeroPresentationEditorSchema.safeParse(historical);
  assert(
    normalized.success && normalized.data.motionStyle === expected,
    `La transición histórica ${transition} debe migrar a ${expected}.`
  );
}

for (const motionStyle of ["momentum", "morph", "parallax"]) {
  const candidate = clone(current);
  candidate.motionStyle = motionStyle;
  assert(
    homeHeroPresentationEditorSchema.safeParse(candidate).success &&
      homeHeroPresentationInputSchema.safeParse(candidate).success,
    `El movimiento V3 ${motionStyle} debe ser válido en editor y persistencia.`
  );
}
const invalidMotionStyle = clone(current);
invalidMotionStyle.motionStyle = "automatic";
assert(
  !homeHeroPresentationEditorSchema.safeParse(invalidMotionStyle).success &&
    !homeHeroPresentationInputSchema.safeParse(invalidMotionStyle).success,
  "Movimientos desconocidos deben rechazarse en editor y snapshots persistidos."
);

const oldEditorDraft = clone(current);
delete oldEditorDraft.navigation;
for (const device of ["desktop", "tablet", "mobile"]) {
  delete oldEditorDraft.responsive[device].cardWidthMode;
  delete oldEditorDraft.responsive[device].spaceBefore;
  delete oldEditorDraft.responsive[device].spaceAfter;
  delete oldEditorDraft.responsive[device].spacingReference;
}
const migratedDraft = homeHeroPresentationEditorSchema.safeParse(oldEditorDraft);
assert(
  migratedDraft.success &&
    migratedDraft.data.navigation.style === "segmented-pro" &&
    migratedDraft.data.navigation.arrowIcon === "chevron" &&
    migratedDraft.data.navigation.arrowShape === "circle" &&
    migratedDraft.data.navigation.arrowResponsive.mobile.y === 46 &&
    migratedDraft.data.responsive.desktop.cardWidthMode === "fixed" &&
    migratedDraft.data.responsive.mobile.cardWidthMode === "fixed" &&
    migratedDraft.data.responsive.desktop.spaceBefore === 28 &&
    migratedDraft.data.responsive.mobile.spaceAfter === 38,
  "El contrato del editor debe migrar borradores locales anteriores sin inventar geometría distinta de los defaults actuales."
);

const preArrowNavigation = clone(current);
delete preArrowNavigation.navigation.arrowIcon;
delete preArrowNavigation.navigation.arrowShape;
delete preArrowNavigation.navigation.arrowResponsive;
const persistedPreArrowNavigation =
  homeHeroPresentationInputSchema.safeParse(preArrowNavigation);
const normalizedPreArrowNavigation =
  homeHeroPresentationEditorSchema.safeParse(preArrowNavigation);
const resolvedPreArrowNavigation = resolveHomeConfig({
  ...sourceHomeConfig,
  heroPresentation: preArrowNavigation,
}).heroPresentation;
assert(
  persistedPreArrowNavigation.success,
  "Snapshots publicados anteriores a los controles de flecha deben seguir siendo legibles."
);
assert(
  normalizedPreArrowNavigation.success &&
    normalizedPreArrowNavigation.data.navigation.arrowIcon === "chevron" &&
    normalizedPreArrowNavigation.data.navigation.arrowShape === "circle" &&
    normalizedPreArrowNavigation.data.navigation.arrowResponsive.desktop.inset === -4,
  "Borradores anteriores a los controles de flecha deben recibir defaults visualmente compatibles."
);
assert(
  resolvedPreArrowNavigation.navigation.arrowIcon === "chevron" &&
    resolvedPreArrowNavigation.navigation.arrowResponsive.mobile.y === 46,
  "El reader público debe resolver snapshots históricos con el aspecto actual de flechas."
);

const hiddenPauseAutoplay = clone(current);
hiddenPauseAutoplay.autoplay = true;
hiddenPauseAutoplay.navigation.showPause = false;
const persistedHiddenPause =
  homeHeroPresentationInputSchema.safeParse(hiddenPauseAutoplay);
const normalizedHiddenPause =
  homeHeroPresentationEditorSchema.safeParse(hiddenPauseAutoplay);
assert(
  persistedHiddenPause.success &&
    persistedHiddenPause.data.navigation?.showPause === false,
  "El contrato persistido debe conservar la decisión editorial de ocultar pausa durante autoplay."
);
assert(
  normalizedHiddenPause.success &&
    normalizedHiddenPause.data.autoplay === true &&
    normalizedHiddenPause.data.navigation.showPause === false,
  "El editor no debe volver a activar el botón de pausa cuando el usuario decidió ocultarlo."
);

const manualPlayback = clone(current);
manualPlayback.autoplay = false;
manualPlayback.navigation.showPause = false;
const normalizedManualPlayback =
  homeHeroPresentationEditorSchema.safeParse(manualPlayback);
assert(
  normalizedManualPlayback.success &&
    normalizedManualPlayback.data.autoplay === false &&
    normalizedManualPlayback.data.navigation.showPause === false,
  "La normalización no debe inventar un control de pausa cuando el carrusel es manual."
);

const zeroInterval = clone(current);
zeroInterval.autoplay = true;
zeroInterval.autoplayMs = 0;
zeroInterval.navigation.showPause = false;
const normalizedZeroInterval =
  homeHeroPresentationEditorSchema.safeParse(zeroInterval);
assert(
  normalizedZeroInterval.success &&
    normalizedZeroInterval.data.autoplay === false,
  "Un intervalo histórico de cero debe seguir resolviendo reproducción manual en el contrato del editor."
);

const overrideHiddenPause = clone(current);
overrideHiddenPause.deviceOverrides = {
  mobile: clone(current),
};
overrideHiddenPause.deviceOverrides.mobile.autoplay = true;
overrideHiddenPause.deviceOverrides.mobile.navigation.showPause = false;
const persistedOverride =
  homeHeroPresentationInputSchema.safeParse(overrideHiddenPause);
const normalizedOverride =
  homeHeroPresentationEditorSchema.safeParse(overrideHiddenPause);
assert(
  persistedOverride.success &&
    persistedOverride.data.deviceOverrides?.mobile?.navigation.showPause === false,
  "Los overrides deben conservar la preferencia de visibilidad del botón de pausa."
);
assert(
  normalizedOverride.success &&
    normalizedOverride.data.deviceOverrides?.mobile?.navigation.showPause === false,
  "Cada override de dispositivo debe respetar la preferencia de pausa sin normalizarla a true."
);

const invalidScale = clone(current);
invalidScale.positions.main.scale = 1.61;
assert(
  !homeHeroPresentationEditorSchema.safeParse(invalidScale).success &&
    !homeHeroPresentationInputSchema.safeParse(invalidScale).success,
  "Editor y contrato persistido deben rechazar escalas fuera del límite compartido."
);

const invalidFrame = clone(current);
invalidFrame.responsive.desktop.cardWidth = 1801;
assert(
  !homeHeroPresentationEditorSchema.safeParse(invalidFrame).success &&
    !homeHeroPresentationInputSchema.safeParse(invalidFrame).success,
  "Editor y contrato persistido deben rechazar anchos de tarjeta fuera del límite compartido."
);

const fillWidth = clone(current);
fillWidth.responsive.desktop.cardWidthMode = "fill";
assert(
  homeHeroPresentationEditorSchema.safeParse(fillWidth).success &&
    homeHeroPresentationInputSchema.safeParse(fillWidth).success,
  "El modo de ancho hasta las flechas debe ser válido en editor y persistencia."
);

const invalidWidthMode = clone(current);
invalidWidthMode.responsive.desktop.cardWidthMode = "viewport";
assert(
  !homeHeroPresentationEditorSchema.safeParse(invalidWidthMode).success &&
    !homeHeroPresentationInputSchema.safeParse(invalidWidthMode).success,
  "Modos de ancho desconocidos deben rechazarse en ambos límites."
);

const invalidArrowScale = clone(current);
invalidArrowScale.navigation.arrowResponsive.mobile.scale = 161;
assert(
  !homeHeroPresentationEditorSchema.safeParse(invalidArrowScale).success &&
    !homeHeroPresentationInputSchema.safeParse(invalidArrowScale).success,
  "Editor y persistencia deben rechazar escalas de flecha fuera del contrato compartido."
);

const invalidArrowIcon = clone(current);
invalidArrowIcon.navigation.arrowIcon = "rocket";
assert(
  !homeHeroPresentationEditorSchema.safeParse(invalidArrowIcon).success &&
    !homeHeroPresentationInputSchema.safeParse(invalidArrowIcon).success,
  "Editor y persistencia deben rechazar iconos de flecha desconocidos."
);

const unknownPosition = clone(current);
unknownPosition.positions.ghost = clone(current.positions.main);
assert(
  !homeHeroPresentationInputSchema.safeParse(unknownPosition).success,
  "Las revisiones persistidas no deben aceptar posiciones arbitrarias fuera del contrato del Hero."
);

const formSource = await readFile(
  path.join(root, "src/lib/admin/home-config-forms.ts"),
  "utf8"
);
assert(
  formSource.includes("homeHeroPresentationEditorSchema") &&
    formSource.includes('from "@/lib/home/hero-schema"') &&
    !formSource.includes("const positionStyleSchema") &&
    !formSource.includes("const heroPresentationSchema") &&
    !formSource.includes("const navigationStyles"),
  "Los formularios del Hero deben consumir el contrato compartido y no reintroducir una segunda copia de sus límites."
);

if (failures.length > 0) {
  console.error("\nHero schema: BLOQUEADO\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Hero schema: OK (motor V3 único, ancho fijo o hasta flechas con compatibilidad histórica, navegación editable, autoplay configurable y límites compartidos)."
  );
}