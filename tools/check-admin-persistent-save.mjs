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
  themeContract,
  gameActions,
  newGame,
  taxonomy,
  homeContent,
  homeCuration,
  homePresentation,
  heroSaveBoundary,
  homePage,
  configuration,
  appearance,
  backgrounds,
  publicPresentation,
  about,
  historicalUpdate,
  publicationPanel,
  gamePublication,
  integratedUpdate,
  mediaUpload,
] = await Promise.all([
  source("src/app/admin/admin-theme-contract.css"),
  source("src/components/admin/GameEditorFormActions.tsx"),
  source("src/components/admin/NewGameForm.tsx"),
  source("src/components/admin/GameTaxonomyEditor.tsx"),
  source("src/components/admin/HomeContentEditor.tsx"),
  source("src/components/admin/HomeCurationEditor.tsx"),
  source("src/components/admin/HomePresentationEditor.tsx"),
  source("src/components/admin/HomeHeroSaveBoundary.tsx"),
  source("src/app/admin/(protected)/portada/page.tsx"),
  source("src/app/admin/(protected)/configuracion/page.tsx"),
  source("src/components/admin/SiteAppearanceWorkspace.tsx"),
  source("src/components/admin/SiteBackgroundManager.tsx"),
  source("src/app/admin/(protected)/paginas/presentacion/page.tsx"),
  source("src/app/admin/(protected)/paginas/quienes-somos/page.tsx"),
  source("src/app/admin/(protected)/actualizaciones/[id]/page.tsx"),
  source("src/components/admin/PublicationPanel.tsx"),
  source("src/components/admin/GamePublicationWorkspace.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/actualizacion/page.tsx"),
  source("src/components/admin/GameMediaUploadForm.tsx"),
]);

assert(
  themeContract.includes('form:has(> input[name="expectedRevision"])') &&
    themeContract.includes('form[action="/api/admin/content/games"]') &&
    themeContract.includes("position: fixed !important") &&
    themeContract.includes("left: 248px") &&
    themeContract.includes("left: 220px") &&
    themeContract.includes("left: 0") &&
    themeContract.includes("env(safe-area-inset-bottom)") &&
    themeContract.includes("grid-template-columns: repeat(2, minmax(0, 1fr))") &&
    themeContract.includes("@media (max-width: 340px)"),
  "El panel debe conservar una barra de guardado fija y safe-area: compacta en dos columnas en móvil estándar y apilada sólo en viewports extremadamente angostos."
);

for (const excludedAction of [
  "/publish",
  "/hide",
  "/media-upload",
  "/preview-upload",
  "/preview-import",
  "/background-upload",
  "/icon-upload",
]) {
  assert(
    themeContract.includes(`[action*="${excludedAction}"]`),
    `La barra persistente debe excluir el subflujo ${excludedAction}.`
  );
}

assert(
  themeContract.includes('[action="/api/admin/content/home"]') &&
    themeContract.includes('[action="/api/admin/content/home/presentation"]') &&
    homeCuration.includes('action="/api/admin/content/home"') &&
    homePresentation.includes('action="/api/admin/content/home/presentation"') &&
    homeContent.includes('const combinedAction = "/api/admin/content/home/content"') &&
    homeContent.includes("onSubmitCapture={interceptChildSubmit}") &&
    homeContent.includes("curationJson") &&
    homeContent.includes("presentationJson") &&
    homeContent.includes("savingRef"),
  "Los dos formularios hijos de Resto de Inicio deben quedar inline sólo porque HomeContentEditor intercepta ambos y los persiste juntos con lock síncrono."
);

assert(
  gameActions.includes("admin-form-actions") &&
    gameActions.includes("saveLabel") &&
    gameActions.includes("continueLabel") &&
    gameActions.includes('type="submit"'),
  "Juegos debe conservar su contrato común de Guardar / Guardar y continuar."
);

const revisionEditors = [
  ["Clasificaciones y etiquetas", taxonomy, "Guardar"],
  ["Marca · Identidad", configuration, "Guardar borrador"],
  ["Marca · Paleta", appearance, "Guardar colores"],
  ["Marca · Fondos", backgrounds, "Guardar fondo"],
  ["Páginas públicas · Presentación", publicPresentation, "Guardar borrador"],
  ["Páginas públicas · Quiénes somos", about, "Guardar"],
  ["Actualización histórica", historicalUpdate, "Guardar borrador histórico"],
];

for (const [label, content, saveCopy] of revisionEditors) {
  assert(
    content.includes("expectedRevision") && content.includes(saveCopy),
    `${label} debe seguir usando revisión editorial y una acción de guardado cubierta por la barra persistente.`
  );
}

assert(
  homeCuration.includes("expectedRevision") &&
    homeCuration.includes("Guardar curaduría") &&
    homePresentation.includes("expectedRevision") &&
    homePresentation.includes("Guardar presentación"),
  "Los bloques de Resto de Inicio deben conservar sus acciones inline y revisión esperada aunque el guardado final sea conjunto."
);

assert(
  heroSaveBoundary.includes('Accept: "application/json"') &&
    heroSaveBoundary.includes("onSubmitCapture={saveHero}") &&
    heroSaveBoundary.includes("readPreparedFormFields(form)") &&
    heroSaveBoundary.includes("submitPreparedFields(fields)") &&
    !heroSaveBoundary.includes("sessionStorage") &&
    !heroSaveBoundary.includes("persistHeroRecoveryFields") &&
    !heroSaveBoundary.includes("motionEngineOverride") &&
    !heroSaveBoundary.includes("requestMotionEngineSave") &&
    heroSaveBoundary.includes("response.status === 409") &&
    !heroSaveBoundary.includes("clearStoredHeroDrafts") &&
    heroSaveBoundary.includes("router.refresh()") &&
    homePage.includes("<HomeHeroSaveBoundary revision={item.revision}>") &&
    homePage.includes("key={item.revision}"),
  "Inicio · Hero debe conservar el guardado protegido: payload capturado, un único owner de persistencia, errores sin desmontar el editor, sin recovery local redundante y remonte sólo después de una revisión confirmada."
);

assert(
  newGame.includes('action="/api/admin/content/games"') &&
    newGame.includes("Crear borrador y continuar"),
  "Nuevo juego debe conservar la excepción persistente que crea el primer borrador."
);

assert(
  publicationPanel.includes("publish") &&
    !publicationPanel.includes("restoreActionBase") &&
    !publicationPanel.includes("/restore") &&
    gamePublication.includes("Publicar") &&
    integratedUpdate.includes("publish-update") &&
    /Publicar\s+nueva\s+versión/.test(
      integratedUpdate
    ) &&
    mediaUpload.includes("media-upload"),
  "Las acciones de publicación vigentes y los subflujos multimedia deben seguir identificables para quedar fuera del guardado persistente, sin reintroducir restauración."
);

if (failures.length > 0) {
  console.error("\nGuardado persistente administrativo: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Guardado persistente administrativo: OK (editores de borrador cubiertos; Resto de Inicio coordinado sin barras fijas superpuestas; Hero con payload capturado y protección de salida sin recovery local; publicación, acciones operativas y cargas auxiliares separadas)."
);
