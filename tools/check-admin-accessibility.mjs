import {
  readdir,
  readFile,
} from "node:fs/promises";
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
  shell,
  shellUx,
  navigation,
  contextBar,
  informationArchitectureCss,
  catalogCss,
  gamesCatalog,
  updateWorkspace,
  dashboard,
  publicationOverview,
  publicationPanel,
  editorialHistory,
  rootLayout,
  homePage,
  globalCss,
  protectedLayout,
  adminLayout,
  loginPage,
  adminBaseCss,
  loginCss,
  identityPreview,
  identityPreviewCss,
  themeContract,
  taxonomySelectCss,
  platformCss,
  newGameCss,
  accountsCss,
  brandForegroundSource,
  gameEditorContract,
  gameEditorPage,
  gameHealthOverview,
  publicPagesIndex,
  securityPage,
  securityOverview,
  homeContentEditor,
  homeContentEditorCss,
  taxonomyEditor,
  appearanceWorkspace,
  backgroundManager,
] = await Promise.all([
  source("src/components/admin/AdminShell.tsx"),
  source("src/components/admin/AdminShellUx.module.css"),
  source("src/components/admin/AdminNavigation.tsx"),
  source("src/components/admin/AdminContextBar.tsx"),
  source("src/components/admin/AdminInformationArchitecture.module.css"),
  source("src/components/admin/AdminCatalog.module.css"),
  source("src/components/admin/AdminGamesCatalog.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/actualizacion/page.tsx"),
  source("src/app/admin/(protected)/page.tsx"),
  source("src/lib/admin/publication-overview.ts"),
  source("src/components/admin/PublicationPanel.tsx"),
  source("src/components/admin/EditorialHistory.tsx"),
  source("src/app/layout.tsx"),
  source("src/app/page.tsx"),
  source("src/app/globals.css"),
  source("src/app/admin/(protected)/layout.tsx"),
  source("src/app/admin/layout.tsx"),
  source("src/app/admin/login/page.tsx"),
  source("src/app/admin/admin.module.css"),
  source("src/app/admin/login/login.module.css"),
  source("src/components/admin/SiteIdentityPreview.tsx"),
  source("src/components/admin/SiteIdentityPreview.module.css"),
  source("src/app/admin/admin-theme-contract.css"),
  source("src/components/admin/GameTaxonomyMultiSelect.module.css"),
  source("src/components/admin/GamePlatformEditor.module.css"),
  source("src/components/admin/NewGameForm.module.css"),
  source("src/app/admin/(protected)/cuentas/accounts.module.css"),
  source("src/lib/site/brand-foreground.ts"),
  source("src/lib/admin/game-editor-sections.ts"),
  source("src/app/admin/(protected)/juegos/[slug]/page.tsx"),
  source("src/components/admin/GameEditorHealthOverview.tsx"),
  source("src/app/admin/(protected)/paginas/page.tsx"),
  source("src/app/admin/(protected)/seguridad/page.tsx"),
  source("src/lib/admin/security-overview.ts"),
  source("src/components/admin/HomeContentEditor.tsx"),
  source("src/components/admin/HomeContentEditor.module.css"),
  source("src/components/admin/GameTaxonomyEditor.tsx"),
  source("src/components/admin/SiteAppearanceWorkspace.tsx"),
  source("src/components/admin/SiteBackgroundManager.tsx"),
]);

assert(
  rootLayout.includes('href="#main-content"') &&
    rootLayout.includes('className="skip-link"') &&
    rootLayout.includes("Saltar al contenido principal") &&
    shell.includes('id="main-content"') &&
    shell.includes("tabIndex={-1}") &&
    !shell.includes('href="#main-content"'),
  "Debe existir un único salto global de teclado al contenido principal; el shell no debe duplicarlo."
);

assert(
  rootLayout.includes("getPublicHomeConfig") &&
    rootLayout.includes("homeConfig.copy.hero.accessibleTitle") &&
    homePage.includes("homeConfig.copy.hero.accessibleTitle") &&
    homePage.includes("<h1 className={styles.pageTitle}") &&
    !rootLayout.includes("HOME_PAGE_TITLE") &&
    !homePage.includes("HOME_PAGE_TITLE"),
  "La Home debe compartir el título publicado de Portada entre metadata y H1 accesible, sin copy SEO fijo paralelo."
);

assert(
  globalCss.includes(".skip-link") &&
    globalCss.includes("color-mix(in srgb, var(--brand)") &&
    !globalCss.includes("rgba(255, 8, 71, 0.55)") &&
    !globalCss.includes("rgba(255, 8, 71, 0.095)") &&
    !globalCss.includes("rgba(255, 8, 71, 0.025)"),
  "El skip-link y el ambiente global deben derivar de la marca configurable y no del rojo histórico."
);

assert(
  shellUx.includes(":focus-visible") &&
    shellUx.includes("@media (prefers-reduced-motion: reduce)") &&
    shellUx.includes("min-height: 44px") &&
    shellUx.includes("font-size: 14px"),
  "El shell administrativo debe conservar foco visible, reducción de movimiento y una escala legible de controles."
);

assert(
  shell.includes("className={ux.logoutButton}") &&
    /\.sidebar\.sidebar \.logoutButton\s*\{[^}]*min-height:\s*44px;/.test(shellUx),
  "Salir debe tener una clase semántica estable y conservar un target táctil mínimo de 44px."
);

assert(
  themeContract.includes('button[aria-label^="Subir "]') &&
    themeContract.includes('button[aria-label^="Bajar "]') &&
    themeContract.includes('button[aria-label^="Quitar "]') &&
    themeContract.includes('button[title="Deshacer"]') &&
    themeContract.includes('button[title="Rehacer"]') &&
    themeContract.includes('details > summary') &&
    themeContract.includes('a[href*="?seccion=multimedia#"]') &&
    themeContract.includes("min-width: 44px") &&
    themeContract.includes("min-height: 44px"),
  "Los controles editoriales compactos de Inicio deben conservar hit-areas táctiles reales de al menos 44px."
);

assert(
  shellUx.includes('.main :is(a, button):focus-visible') &&
    shellUx.includes('.main :is(input, textarea, select):focus-visible') &&
    shellUx.includes('.main input[type="search"]:focus-visible') &&
    shellUx.includes("outline: none;") &&
    shellUx.includes("box-shadow: none;") &&
    !shellUx.includes("#ff9bb3"),
  "El shell debe usar un único sistema de foco y los estados activos deben derivar de la marca."
);

assert(
  navigation.includes("<details") &&
    navigation.includes("activeItem?.label") &&
    navigation.includes('aria-current={active ? "page" : undefined}') &&
    navigation.includes("mobileNavPanel") &&
    contextBar.includes("<details") &&
    contextBar.includes("mobileLabel") &&
    contextBar.includes('aria-current={item.active ? "page" : undefined}') &&
    contextBar.includes('aria-current={child.active ? "page" : undefined}') &&
    contextBar.includes("contextMobilePanel"),
  "Las navegaciones móviles deben exponer la opción activa, conservar aria-current y ofrecer una estructura desplegable accesible."
);

assert(
  !shell.includes("DeUna Games") &&
    shell.includes("siteName") &&
    shell.includes("siteShortName") &&
    shell.includes("compactName") &&
    shell.includes("aria-label={`Panel administrativo de ${siteName}`}") &&
    shellUx.includes(".brandName") &&
    shellUx.includes("text-overflow: ellipsis"),
  "La marca del shell debe usar la identidad publicada y tolerar nombres configurables largos."
);

assert(
  protectedLayout.includes('import "../admin-theme-contract.css"') &&
    protectedLayout.includes("getPublicSiteConfig") &&
    protectedLayout.includes("siteName={siteConfig.name}") &&
    protectedLayout.includes("siteShortName={siteConfig.shortName}") &&
    themeContract.includes(':has(> input[type="search"]):focus-within') &&
    themeContract.includes('input[type="search"]:focus-visible') &&
    themeContract.includes('button[aria-pressed="true"]') &&
    themeContract.includes('main#main-content:focus-visible') &&
    themeContract.includes("var(--admin-brand-text-strong)"),
  "El área protegida debe cargar identidad publicada y el contrato adaptativo de tema para foco, búsqueda y selección."
);

assert(
  rootLayout.includes("brandForeground") &&
    rootLayout.includes('"--theme-on-brand": readableBrandText') &&
    rootLayout.includes('"--text-on-brand": readableBrandText') &&
    brandForegroundSource.includes("contrastRatio") &&
    brandForegroundSource.includes("relativeLuminance"),
  "El texto sobre acciones de marca debe calcularse por contraste y publicarse como token global."
);

assert(
  adminLayout.includes("getPublicSiteConfig") &&
    adminLayout.includes("generateMetadata") &&
    adminLayout.includes("config.name") &&
    !adminLayout.includes("DeUna Games"),
  "La metadata administrativa debe derivar la identidad del sitio publicado y no contener la marca fija."
);

assert(
  loginPage.includes("getPublicSiteConfig") &&
    loginPage.includes("config.shortName") &&
    loginPage.includes("config.name") &&
    !loginPage.includes("DeUna Games"),
  "El login administrativo debe reflejar la identidad publicada."
);

assert(
  adminBaseCss.includes(".loginForm input:focus-visible") &&
    adminBaseCss.includes(".loginForm button:focus-visible") &&
    adminBaseCss.includes("color: var(--text-on-brand);") &&
    adminBaseCss.includes("font-size: 16px;") &&
    loginCss.includes("color: var(--text-on-brand);") &&
    loginCss.includes("font-size: 11px;"),
  "El login debe conservar foco visible, contraste adaptable, controles móviles legibles y texto auxiliar de al menos 11px."
);

assert(
  identityPreview.includes("shortName: string") &&
    identityPreview.includes("const compactName = shortName.trim() || name") &&
    identityPreview.includes("{compactName}") &&
    !identityPreview.includes('"--preview-on-brand"') &&
    identityPreviewCss.includes(".previewBrand strong") &&
    identityPreviewCss.includes("color: #f3f6f9") &&
    identityPreviewCss.includes("background: color-mix(in srgb, var(--preview-brand) 10%, transparent)") &&
    identityPreviewCss.includes("box-shadow: inset 0 -2px 0 var(--preview-brand)"),
  "La vista previa de identidad debe representar el Nombre corto, mantener texto legible sobre el fondo seguro y usar la marca sólo como acento cuando el logo no tiene marco."
);

assert(
  taxonomySelectCss.includes("color-mix(in srgb, var(--brand)") &&
    taxonomySelectCss.includes(".search input:focus-visible") &&
    !taxonomySelectCss.includes("rgba(255, 21, 84") &&
    !taxonomySelectCss.includes("rgba(255, 80, 126") &&
    !taxonomySelectCss.includes("#ff9bb7"),
  "Las selecciones de taxonomía y su buscador deben adaptarse a la marca sin conservar el rojo histórico."
);

assert(
  platformCss.includes("color-mix(in srgb, var(--brand)") &&
    !platformCss.includes("#ffe1e8"),
  "Las plataformas activas deben derivar su color del tema publicado."
);

assert(
  newGameCss.includes("color-mix(in srgb, var(--brand)") &&
    !newGameCss.includes("#ffb2c4") &&
    !newGameCss.includes("#e9b5c1") &&
    !newGameCss.includes("#e3a4b3"),
  "El flujo Nuevo juego no debe conservar acentos rosados fijos en acciones de marca."
);

assert(
  catalogCss.includes("font-size: 15px") &&
    catalogCss.includes("font-size: 12px") &&
    catalogCss.includes("border-bottom: 1px solid #2e3a47") &&
    catalogCss.includes("nth-child(even)") &&
    catalogCss.includes(":focus-within") &&
    informationArchitectureCss.includes(".rowActions") &&
    informationArchitectureCss.includes("min-height: 34px") &&
    !catalogCss.includes("#e8adb9") &&
    !catalogCss.includes("#ffd4de"),
  "Los catálogos administrativos deben distinguir filas, jerarquía de texto, foco, acciones legibles y color de marca dinámico."
);

assert(
  accountsCss.includes(".badge") &&
    accountsCss.includes("color-mix(in srgb, var(--brand)") &&
    !accountsCss.includes("rgba(255, 64, 118") &&
    !accountsCss.includes("rgba(255, 56, 111") &&
    !accountsCss.includes("#ff789e"),
  "Las insignias de rol administrativas deben derivar de la marca; sólo peligro/error puede conservar rojo semántico."
);

assert(
  gamesCatalog.includes('role="search"') &&
    gamesCatalog.includes('role="status"') &&
    gamesCatalog.includes('aria-live="polite"') &&
    gamesCatalog.includes("<caption") &&
    gamesCatalog.includes('className={styles.srOnly}'),
  "Juegos debe conservar búsqueda semántica, resultados anunciables y caption accesible."
);

assert(
  updateWorkspace.includes("<form") &&
    updateWorkspace.includes("<fieldset") &&
    updateWorkspace.includes("<label>") &&
    updateWorkspace.includes("<table>") &&
    updateWorkspace.includes('scope="row"') &&
    updateWorkspace.includes('role="status"'),
  "El flujo integrado de actualización debe conservar formulario etiquetado, bloqueo semántico, avisos de estado e historial tabular accesible."
);

assert(
  publicationPanel.includes('role="status"') &&
    publicationPanel.includes('role="alert"') &&
    publicationPanel.includes("Restaurar publicación ${publication.publicationNumber}") &&
    editorialHistory.includes("Restaurar revisión ${revision.revision}"),
  "Publicación e Historial deben anunciar resultados y distinguir cada acción de restauración para tecnologías de asistencia."
);

assert(
  gamesCatalog.includes("Todas las clasificaciones") &&
    gamesCatalog.includes(">Clasificación<") &&
    !gamesCatalog.includes("Todas las categorías"),
  "El catálogo de Juegos debe presentar la taxonomía unificada como Clasificación."
);

assert(
  dashboard.includes("Requiere atención") &&
    dashboard.includes("publication.pendingItems") &&
    dashboard.includes("attentionPath"),
  "El Resumen debe ofrecer una cola operativa de contenido que requiere atención."
);

assert(
  gameEditorContract.includes('"valoracion"') &&
    gameEditorContract.includes('label: "Valoración"') &&
    gameEditorPage.includes("resolveGameEditorSection") &&
    contextBar.includes('directGameSection("valoracion", Star)') &&
    gameHealthOverview.includes("getGameEditorSection") &&
    !gameHealthOverview.includes('<nav className={styles.sections}'),
  "El editor de juego debe compartir un contrato canónico, incluir Valoración en la navegación y evitar una segunda navegación completa en el overview."
);

assert(
  gamesCatalog.includes("MOBILE_GAMES_PER_PAGE = 8") &&
    gamesCatalog.includes('data-admin-games-mobile-list="true"') &&
    gamesCatalog.includes('data-admin-games-mobile-card="true"') &&
    gamesCatalog.includes('data-admin-games-mobile-pagination="true"') &&
    gamesCatalog.includes('data-admin-games-table="true"') &&
    gamesCatalog.includes('data-mobile-actions={mobile ? "true" : undefined}') &&
    catalogCss.includes(".mobileList") &&
    catalogCss.includes(".mobilePagination") &&
    catalogCss.includes(".tableViewport") &&
    catalogCss.includes("display: none;"),
  "Juegos debe ofrecer una presentación móvil paginada con acciones visibles, no depender de desplazar una tabla de 980px ni renderizar el catálogo completo en una sola columna."
);

assert(
  publicPagesIndex.includes("pending: boolean | null") &&
    publicPagesIndex.includes("pending === null") &&
    publicPagesIndex.includes("Estado no disponible") &&
    adminBaseCss.includes(".statusUnknown"),
  "Páginas públicas debe distinguir publicación confirmada, cambios pendientes y estado desconocido."
);

assert(
  !dashboard.includes("games.length") &&
    !dashboard.includes("gameUpdates.length") &&
    dashboard.includes('publicGames ?? "—"') &&
    dashboard.includes('pending ?? "—"') &&
    dashboard.includes("Estado de publicación no disponible"),
  "Resumen no debe sustituir métricas de publicación desconocidas por conteos de datos fuente."
);

assert(
  securityOverview.includes("WHERE user_id = $1") &&
    securityPage.includes("Tus sesiones activas") &&
    securityPage.includes("Tu actividad de acceso") &&
    dashboard.includes("Tus sesiones administrativas activas"),
  "Las superficies de seguridad deben describir correctamente el alcance por usuario de las consultas actuales."
);

assert(
  homeContentEditor.includes('type HomeContentStep = "structure" | "curation" | "cards"') &&
    homeContentEditor.includes("activeStep") &&
    homeContentEditor.includes('hidden={activeStep !== "structure"}') &&
    homeContentEditor.includes('hidden={activeStep !== "curation"}') &&
    homeContentEditor.includes('hidden={activeStep !== "cards"}') &&
    homeContentEditor.includes("curationJson") &&
    homeContentEditor.includes("presentationJson") &&
    homeContentEditorCss.includes(".step[hidden]") &&
    homeContentEditorCss.includes("display: none;"),
  "Resto de Inicio debe mostrar un paso a la vez, respetar hidden incluso con CSS autor y no perder el guardado coordinado de la revisión completa."
);

assert(
  taxonomyEditor.includes("DEFAULT_TERMS_PER_PAGE = 12") &&
    taxonomyEditor.includes("VISUAL_TERMS_PER_PAGE = 6") &&
    taxonomyEditor.includes("termsPerPage") &&
    taxonomyEditor.includes("matchingTerms") &&
    taxonomyEditor.includes("visibleTerms") &&
    taxonomyEditor.includes("data-taxonomy-term-row") &&
    taxonomyEditor.includes("moveTerm(currentSection.kind, index"),
  "Catálogos debe limitar Clasificaciones ricas a 6 filas, mantener Etiquetas compactas en 12 y conservar el índice absoluto al reordenar términos filtrados o paginados."
);

assert(
  appearanceWorkspace.includes('role="tablist"') &&
    appearanceWorkspace.includes('role="tab"') &&
    appearanceWorkspace.includes("tabIndex={selected ? 0 : -1}") &&
    appearanceWorkspace.includes('event.key === "ArrowRight"') &&
    appearanceWorkspace.includes('event.key === "ArrowLeft"') &&
    appearanceWorkspace.includes('event.key === "Home"') &&
    appearanceWorkspace.includes('event.key === "End"') &&
    appearanceWorkspace.includes("tabRefs.current[nextIndex]?.focus()"),
  "Apariencia debe implementar el patrón de teclado de tabs y mantener un único tab activo dentro del orden normal de foco."
);

assert(
  backgroundManager.includes('role="tablist"') &&
    backgroundManager.includes('role="tab"') &&
    backgroundManager.includes('aria-controls="background-page-panel"') &&
    backgroundManager.includes('role="tabpanel"') &&
    backgroundManager.includes('aria-labelledby={`background-page-tab-${page}`}') &&
    backgroundManager.includes("tabIndex={selected ? 0 : -1}") &&
    backgroundManager.includes('event.key === "ArrowRight"') &&
    backgroundManager.includes('event.key === "ArrowLeft"') &&
    backgroundManager.includes('event.key === "Home"') &&
    backgroundManager.includes('event.key === "End"') &&
    backgroundManager.includes("pageTabRefs.current[nextIndex]?.focus()"),
  "Fondos debe aplicar el patrón completo de tabs: teclado, foco roving y relación tab/tabpanel para la página seleccionada."
);

assert(
  publicationOverview.includes('"game_taxonomy",') &&
    publicationOverview.includes('"public_pages_config",') &&
    publicationOverview.includes("pendingItems") &&
    publicationOverview.includes("ANY($1::text[])") &&
    publicationOverview.includes("[publishableTypes]") &&
    publicationOverview.includes("LIMIT 10"),
  "El overview debe incluir todos los tipos publicables, usar SQL parametrizado y mantener una cola acotada de pendientes."
);

const adminCssDir = path.join(
  root,
  "src/components/admin"
);
const adminCssFiles = (await readdir(adminCssDir))
  .filter((file) => file.endsWith(".module.css"));

for (const file of adminCssFiles) {
  const css = await readFile(
    path.join(adminCssDir, file),
    "utf8"
  );
  const tinyPixelSizes = [
    ...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px\s*;/g),
  ]
    .map((match) => Number(match[1]))
    .filter((size) => size < 11);

  assert(
    tinyPixelSizes.length === 0,
    `${file} vuelve a introducir tipografía menor a 11px (${tinyPixelSizes.join(", ")}).`
  );
}

if (failures.length > 0) {
  console.error("\nAccesibilidad administrativa: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Accesibilidad administrativa: OK (${adminCssFiles.length} módulos revisados; identidad dinámica y contrastada, navegación móvil desplegable, login accesible, skip-link único, contraste adaptable, escala legible, foco único, tema adaptativo, teclado, movimiento reducido, publicación anunciable, targets editoriales táctiles y catálogos semánticos).`
  );
}
