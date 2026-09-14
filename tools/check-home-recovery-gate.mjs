import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [
  curationEditor,
  presentationEditor,
  recoverySnapshotHook,
  heroEditor,
  heroBoundary,
  homeLimits,
  homeConfigForms,
  frontendContentForms,
  curationRoute,
  presentationRoute,
  combinedContentRoute,
  requestSecurity,
] = await Promise.all([
  source("src/components/admin/HomeCurationEditor.tsx"),
  source("src/components/admin/HomePresentationEditor.tsx"),
  source("src/components/admin/useInitialSessionStorageSnapshot.ts"),
  source("src/components/admin/HomeHeroEditor.tsx"),
  source("src/components/admin/HomeHeroSaveBoundary.tsx"),
  source("src/lib/home/editorial-limits.ts"),
  source("src/lib/admin/home-config-forms.ts"),
  source("src/lib/admin/frontend-content-forms.ts"),
  source("src/app/api/admin/content/home/route.ts"),
  source("src/app/api/admin/content/home/presentation/route.ts"),
  source("src/app/api/admin/content/home/content/route.ts"),
  source("src/lib/admin/request-security.ts"),
]);

for (const [label, editor, minimumInertRegions, key] of [
  ["Curaduría", curationEditor, 4, "CURATION_DRAFT_KEY"],
  ["Presentación", presentationEditor, 3, "PRESENTATION_DRAFT_KEY"],
]) {
  assert(
    editor.includes("const recoveryRequiresDecision = Boolean(recovery)") &&
      !editor.includes("const recoveryIsStale =") &&
      (editor.match(/inert=\{recoveryRequiresDecision\}/g) ?? []).length >=
        minimumInertRegions,
    `${label} debe bloquear sus controles editables mientras exista cualquier copia local pendiente de Recuperar/Descartar.`,
  );

  assert(
    editor.includes("Recupérala o descártala antes de continuar editando") &&
      editor.includes("Descarta la copia para desbloquear la edición de la revisión actual"),
    `${label} debe explicar la decisión requerida tanto para copias de la revisión actual como para copias obsoletas.`,
  );

  assert(
    editor.includes("disabled={!recoveryMatchesRevision}") &&
      editor.includes("if (!recoveryMatchesRevision) return"),
    `${label} nunca debe permitir recuperar una copia obsoleta sobre una revisión posterior.`,
  );

  assert(
    editor.includes("useInitialSessionStorageSnapshot") &&
      editor.includes(`useInitialSessionStorageSnapshot(${key})`) &&
      !editor.includes("useSyncExternalStore(") &&
      !editor.includes("readRecoveryRaw"),
    `${label} debe capturar el recovery una sola vez al montar; no puede releer en vivo la misma clave de sessionStorage que escribe durante la edición activa.`,
  );
}

assert(
  recoverySnapshotHook.includes("function createInitialSessionStorageStore(key: string)") &&
    recoverySnapshotHook.includes("if (captured) return snapshot") &&
    recoverySnapshotHook.includes("snapshot = sessionStorage.getItem(key)") &&
    recoverySnapshotHook.includes("useState(() => createInitialSessionStorageStore(key))") &&
    recoverySnapshotHook.includes("useSyncExternalStore(") &&
    recoverySnapshotHook.includes("store.getSnapshot"),
  "El helper de recovery de Resto debe congelar el snapshot inicial por montaje, conservando hidratación SSR segura y sin observar las escrituras de la misma sesión.",
);

assert(
  heroEditor.includes("const recoveryRequiresDecision = Boolean(recovery)") &&
    heroEditor.includes("const recoveryMatchesRevision = Boolean(") &&
    (heroEditor.match(/inert=\{recoveryRequiresDecision \|\| undefined\}/g) ?? []).length >= 3 &&
    heroEditor.includes("if (recoveryRequiresDecision) return;") &&
    heroEditor.includes("Recupéralos o descártalos antes de continuar editando"),
  "Hero debe exigir una decisión explícita sobre cualquier copia recuperable antes de habilitar topbar, tabs o workspace, con una defensa adicional en commit().",
);

assert(
  heroEditor.includes("recoveryMatchesRevision && <>") &&
    heroEditor.includes("Resuelve la copia desde el aviso de seguridad antes de continuar"),
  "Hero sólo debe exponer Recuperar/Descartar dentro del editor cuando la copia corresponde a la revisión actual; las copias obsoletas quedan a cargo del boundary fail-closed.",
);

assert(
  heroBoundary.includes("function readBlockedHeroRecovery(") &&
    heroBoundary.includes("typeof parsed.revision === \"number\"") &&
    heroBoundary.includes("recoveryRevision === currentRevision") &&
    heroBoundary.includes("return { revision: null }") &&
    heroBoundary.includes("useSyncExternalStore(") &&
    heroBoundary.includes("readBlockedHeroRecoverySnapshot(revision)") &&
    !heroBoundary.includes("setBlockedRecovery("),
  "Hero debe derivar con snapshot SSR estable cualquier copia cuya revisión no coincida o cuyo origen no pueda verificarse, sin setState dentro de efectos.",
);

assert(
  heroBoundary.includes("inert={busy || blockedRecovery !== null || undefined}") &&
    heroBoundary.includes("if (saving.current || blockedRecovery) return") &&
    heroBoundary.includes("Descartar copia obsoleta") &&
    heroBoundary.includes("setRecoveryEpoch((current) => current + 1)") &&
    heroBoundary.includes("key={recoveryEpoch}"),
  "Hero debe quedar inerte ante una copia obsoleta y el descarte debe limpiar storage y remontear el editor desde el borrador de servidor.",
);

assert(
  heroBoundary.includes("mantenlos en esta pestaña") &&
    heroBoundary.includes("antes de recargar") &&
    !heroBoundary.includes("recarga y revísalos antes de volver a guardar"),
  "El mensaje de conflicto de Hero no debe sugerir recargar una copia que luego quedaría obsoleta.",
);

assert(
  homeLimits.includes("HOME_CURATION_MAX_JSON_CHARS = 20_000") &&
    homeLimits.includes("HOME_PRESENTATION_MAX_JSON_CHARS = 24_000") &&
    homeLimits.includes("URL_ENCODED_MAX_BYTES_PER_JSON_CHAR = 9") &&
    homeLimits.includes("HOME_CURATION_MAX_FORM_BYTES") &&
    homeLimits.includes("HOME_PRESENTATION_MAX_FORM_BYTES") &&
    homeLimits.includes("HOME_CONTENT_MAX_FORM_BYTES"),
  "Los límites de payload de Resto de Inicio deben vivir en un contrato Home compartido y contemplar el peor caso de percent-encoding del formulario.",
);

assert(
  homeConfigForms.includes("HOME_CURATION_MAX_JSON_CHARS") &&
    homeConfigForms.includes(".max(HOME_CURATION_MAX_JSON_CHARS)") &&
    !homeConfigForms.includes(".max(20_000)") &&
    frontendContentForms.includes("HOME_PRESENTATION_MAX_JSON_CHARS") &&
    frontendContentForms.includes("HOME_PRESENTATION_MAX_JSON_CHARS\n  ).pipe") &&
    !frontendContentForms.includes("jsonField(24_000)"),
  "Zod debe reutilizar los máximos Home compartidos en vez de mantener literales paralelos.",
);

assert(
  curationRoute.includes("HOME_CURATION_MAX_FORM_BYTES") &&
    curationRoute.includes("maxFormBytes: HOME_CURATION_MAX_FORM_BYTES") &&
    presentationRoute.includes("HOME_PRESENTATION_MAX_FORM_BYTES") &&
    presentationRoute.includes("maxFormBytes: HOME_PRESENTATION_MAX_FORM_BYTES") &&
    combinedContentRoute.includes("HOME_CONTENT_MAX_FORM_BYTES") &&
    combinedContentRoute.includes("maxFormBytes: HOME_CONTENT_MAX_FORM_BYTES"),
  "Las tres rutas de Resto de Inicio deben aceptar todo payload válido según sus schemas antes de Zod, sin depender del límite Admin genérico de 8 KiB.",
);

assert(
  requestSecurity.includes("const MAX_ADMIN_FORM_BYTES = 8 * 1024") &&
    !requestSecurity.includes("HOME_CONTENT_MAX_FORM_BYTES"),
  "El hardening de Home no debe ensanchar el límite global de formularios del Admin.",
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Home recovery/save gate: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    "Home recovery/save gate: OK (Curaduría y Presentación capturan recovery inicial sin auto-bloquear la edición activa; Hero falla cerrado ante copias obsoletas y las rutas de Resto alinean límites HTTP con sus contratos Zod sin ampliar el Admin global).",
  );
}
