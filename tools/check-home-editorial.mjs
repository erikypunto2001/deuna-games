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
  homeCollections,
  rankingEngine,
  rootLayout,
  homePage,
  adminHomePage,
  sourceConfig,
  publicConfig,
  curationEditor,
  curationRoute,
  presentationRoute,
  combinedContentRoute,
  frontendContentForms,
  homeContentService,
  homeContentEditor,
  creationService,
  heroSection,
  heroStyles,
  heroMotionStyles,
  heroContract,
  heroDevices,
  heroLayout,
  heroEditor,
  heroEditorRoute,
  presentationEditor,
  livePreview,
  isolatedPreview,
  adminContext,
  homeAdminSections,
  gamesForYourPc,
  cardCarousel,
  accountPage,
  accountDashboard,
  accountDashboardView,
] = await Promise.all([
  source("src/data/home.ts"),
  source("src/lib/home/ranking.ts"),
  source("src/app/layout.tsx"),
  source("src/app/page.tsx"),
  source("src/app/admin/(protected)/portada/page.tsx"),
  source("src/data/home-config.ts"),
  source("src/lib/home/public-home-config.ts"),
  source("src/components/admin/HomeCurationEditor.tsx"),
  source("src/app/api/admin/content/home/route.ts"),
  source("src/app/api/admin/content/home/presentation/route.ts"),
  source("src/app/api/admin/content/home/content/route.ts"),
  source("src/lib/admin/frontend-content-forms.ts"),
  source("src/lib/admin/home-content-service.ts"),
  source("src/components/admin/HomeContentEditor.tsx"),
  source("src/lib/admin/content-create-service.ts"),
  source("src/components/home/HeroSection.tsx"),
  source("src/components/home/HeroSection.module.css"),
  source("src/components/home/HeroMotion.module.css"),
  source("src/lib/home/hero-contract.ts"),
  source("src/lib/home/hero-devices.ts"),
  source("src/lib/home/hero-layout.ts"),
  source("src/components/admin/HomeHeroEditor.tsx"),
  source("src/app/api/admin/content/home/hero/route.ts"),
  source("src/components/admin/HomePresentationEditor.tsx"),
  source("src/components/admin/HomeHeroLivePreview.tsx"),
  source("src/components/admin/IsolatedPublicPreviewFrame.tsx"),
  source("src/components/admin/AdminContextBar.tsx"),
  source("src/lib/admin/home-admin-sections.ts"),
  source("src/components/home/GamesForYourPC.tsx"),
  source("src/components/ui/CardCarousel.tsx"),
  source("src/app/cuenta/page.tsx"),
  source("src/app/cuenta/AccountDashboardClient.tsx"),
  source("src/lib/accounts/dashboard-view.ts"),
]);

assert(
  homeCollections.includes("resolveHomeCollectionGames") &&
    homeCollections.includes("resolved.curation.hero.mode") &&
    homeCollections.includes("HOME_HERO_MAX_SLIDES"),
  "La Home debe resolver el Hero mediante la curaduría compartida y respetar el límite editorial."
);

assert(
  heroContract.includes("HOME_HERO_MAX_SLIDES = 5") &&
    heroContract.includes("HOME_HERO_AUTOPLAY_MS = 6500"),
  "El contrato del Hero debe centralizar límite y autoplay por defecto."
);

assert(
  rankingEngine.includes("scoreHomeGame") &&
    rankingEngine.includes("resolveHomeCollectionGames") &&
    rankingEngine.includes('mode === "manual"') &&
    rankingEngine.includes('mode === "automatic"') &&
    rankingEngine.includes("isHomeRankingEligible") &&
    rankingEngine.includes('target === "hero"') &&
    rankingEngine.includes("game.heroImage || game.coverImage"),
  "El Hero debe seguir usando el ranking compartido, determinista y con arte publicable."
);

assert(
  sourceConfig.includes("sourceHomeConfig") &&
    sourceConfig.includes("defaultHomeCuration") &&
    sourceConfig.includes("defaultHeroPresentation") &&
    sourceConfig.includes("positions:") &&
    sourceConfig.includes("responsive:"),
  "La configuración fuente debe conservar fallbacks de curaduría y presentación del Hero."
);

assert(
  publicConfig.includes("published_payload") &&
    publicConfig.includes("item_type = 'home_config'") &&
    publicConfig.includes("public_visible = true") &&
    !publicConfig.includes("draft_payload"),
  "La portada pública debe leer sólo el snapshot publicado."
);

assert(
  rootLayout.includes("getPublicHomeConfig") &&
    rootLayout.includes("homeConfig.copy.hero.accessibleTitle") &&
    homePage.includes("homeConfig.copy.hero.accessibleTitle") &&
    homePage.includes("<h1 className={styles.pageTitle}") &&
    !rootLayout.includes("HOME_PAGE_TITLE") &&
    !homePage.includes("HOME_PAGE_TITLE"),
  "Metadata, social y H1 de Inicio deben reutilizar el título accesible del snapshot publicado, sin copy SEO paralelo."
);

assert(
  homePage.includes("getPublicHomeConfig") &&
    homePage.includes("collections.heroGames.length > 0") &&
    homePage.includes("presentation={homeConfig.heroPresentation}") &&
    !homePage.includes("copy={copy.hero}"),
  "La Home pública debe entregar al Hero juegos publicados y su contrato visual, no un segundo copy del Hero."
);

assert(
  adminHomePage.includes("resolveHomeAdminSection") &&
    adminHomePage.includes('if (section === "hero")') &&
    adminHomePage.includes('if (section === "contenido")') &&
    adminHomePage.includes("HomeContentEditor") &&
    adminHomePage.includes("key={item.revision}") &&
    !adminHomePage.includes("listPublicationStates") &&
    !adminHomePage.includes("buildHomeGameCollections"),
  "Portada admin debe cargar datos por sección y montar Resto de Inicio como un editor coordinado."
);

assert(
  adminHomePage.includes("publicGames={publicGames}") &&
    adminHomePage.includes("games={curationGames}") &&
    adminHomePage.includes("const publishedSlugs = publicGames.map"),
  "Hero y contenido deben derivar su verdad pública directamente del catálogo publicado."
);

assert(
  (adminHomePage.match(/rankingReferenceTime=\{rankingReferenceTime\}/g) ?? [])
    .length === 2 &&
    curationEditor.includes("rankingReferenceTime: number") &&
    curationEditor.includes("const rankingNow = rankingReferenceTime") &&
    !curationEditor.includes("Date.now()"),
  "Hero y Resto de Inicio deben congelar el mismo tipo de referencia temporal desde el servidor para evitar rankings distintos durante hidratación."
);

assert(
  homeContentEditor.includes("onSubmitCapture") &&
    homeContentEditor.includes("/api/admin/content/home/content") &&
    homeContentEditor.includes('input[name="curationJson"]') &&
    homeContentEditor.includes('input[name="presentationJson"]') &&
    homeContentEditor.includes("router.refresh()"),
  "Resto de Inicio debe interceptar los dos formularios y guardarlos mediante una única operación."
);

assert(
  homeContentEditor.includes("const savingRef = useRef(false)") &&
    homeContentEditor.includes("if (savingRef.current) return") &&
    homeContentEditor.includes("savingRef.current = true") &&
    (homeContentEditor.match(/savingRef\.current = false/g) ?? []).length >= 3 &&
    !homeContentEditor.includes("if (saving) return"),
  "El guardado atómico de Resto de Inicio debe usar un lock síncrono para impedir POST duplicados antes del siguiente render de React."
);

assert(
  homeContentEditor.includes('form[data-home-editor-dirty="true"]') &&
    homeContentEditor.includes("beforeunload") &&
    homeContentEditor.includes('document.addEventListener("click", protectLinks, true)') &&
    homeContentEditor.includes("window.confirm") &&
    curationEditor.includes("data-home-editor-dirty") &&
    presentationEditor.includes("data-home-editor-dirty") &&
    !curationEditor.includes("beforeunload") &&
    !presentationEditor.includes("beforeunload"),
  "La protección contra pérdida de cambios de Resto de Inicio debe vivir en el coordinador y cubrir cierre de pestaña y navegación interna."
);

assert(
  combinedContentRoute.includes("hasExactAdminFormFields") &&
    combinedContentRoute.includes("curationJson") &&
    combinedContentRoute.includes("presentationJson") &&
    combinedContentRoute.includes("saveHomeContentDraft"),
  "La ruta conjunta debe validar exactamente ambos slices antes del guardado atómico."
);

assert(
  homeContentService.includes("saveHomeContentDraft") &&
    homeContentService.includes("heroSlugs: current.heroSlugs") &&
    homeContentService.includes("hero: current.curation.hero") &&
    homeContentService.includes("heroPresentation: current.heroPresentation") &&
    homeContentService.includes("mergeHomePresentationCopy") &&
    homeContentService.includes("...current.hero") &&
    homeContentService.includes("accessibleTitle: hero.accessibleTitle"),
  "Resto de Inicio debe preservar selección, curaduría y diseño del Hero; sólo puede actualizar su título SEO/accesible y debe conservar los campos Hero legacy."
);

assert(
  frontendContentForms.includes("const editableHomeCopySchema") &&
    frontendContentForms.includes(".omit({ hero: true })") &&
    frontendContentForms.includes("hero: homeCopySchema.shape.hero.pick") &&
    frontendContentForms.includes("accessibleTitle: true") &&
    !frontendContentForms.includes("primaryCta: true") &&
    !frontendContentForms.includes("secondaryCta: true"),
  "El contrato HTTP de Presentación debe aceptar únicamente accessibleTitle del slice Hero, nunca sus CTAs legacy."
);

assert(
  curationEditor.includes("Manual") &&
    curationEditor.includes("Automático") &&
    curationEditor.includes("Híbrido") &&
    curationEditor.includes("resolveHomeCollectionGames") &&
    curationEditor.includes("new Set(publishedSlugs)") &&
    curationEditor.includes("publishedSet.has(game.slug)") &&
    !curationEditor.includes("publishedSlugs === null") &&
    !curationEditor.includes("? games"),
  "Curaduría debe operar en fail-closed: un borrador nunca puede convertirse en candidato público por falta de estado."
);

assert(
  !curationEditor.includes("sessionStorage") &&
    !presentationEditor.includes("sessionStorage") &&
    !curationEditor.includes("useInitialSessionStorageSnapshot") &&
    !presentationEditor.includes("useInitialSessionStorageSnapshot") &&
    !curationEditor.includes("Cambios locales recuperables") &&
    !presentationEditor.includes("Cambios locales recuperables"),
  "Resto de Inicio no debe mantener copias locales de recuperación: el borrador de servidor es la única persistencia editorial previa a publicación."
);

assert(
  presentationEditor.includes('hero: Pick<HomeCopy["hero"], "accessibleTitle">') &&
    presentationEditor.includes("SEO y accesibilidad de Inicio") &&
    presentationEditor.includes("copy.hero.accessibleTitle") &&
    presentationEditor.includes("buildPayload") &&
    !presentationEditor.includes("heroPresentation: config.heroPresentation") &&
    !presentationEditor.includes("heroGames:") &&
    !presentationEditor.includes("showHeroStudio") &&
    !presentationEditor.includes("primaryCta") &&
    !presentationEditor.includes("secondaryCta"),
  "Presentación debe poseer secciones, copy no-Hero y sólo el título SEO/accesible, sin reintroducir copy fantasma del Hero."
);

assert(
  curationRoute.includes("saveHomeCurationDraft") &&
    presentationRoute.includes("saveHomePresentationDraft") &&
    heroEditorRoute.includes("saveHomeHeroDraft") &&
    !curationRoute.includes("saveHomeConfigDraft") &&
    !presentationRoute.includes("saveHomeConfigDraft") &&
    !heroEditorRoute.includes("saveHomeConfigDraft"),
  "Las rutas HTTP de Home deben delegar ensamblado y ownership al servicio de dominio."
);

assert(
  heroLayout.includes("HOME_HERO_VISUAL_POSITIONS") &&
    heroLayout.includes('"left2"') &&
    heroLayout.includes('"left1"') &&
    heroLayout.includes('"main"') &&
    heroLayout.includes('"right1"') &&
    heroLayout.includes('"right2"') &&
    heroLayout.includes("homeHeroSlotX") &&
    heroLayout.includes("homeHeroVisiblePositions") &&
    heroLayout.includes("homeHeroPositionTransform"),
  "Editor y frontend deben compartir posiciones, visibilidad, slots y transformaciones del Hero."
);

assert(
  heroDevices.includes("HOME_HERO_BREAKPOINTS") &&
    heroDevices.includes("mobileMax: 680") &&
    heroDevices.includes("tabletMax: 1100") &&
    heroDevices.includes("HOME_HERO_VIEWPORT_DEFAULTS") &&
    heroDevices.includes("clampHomeHeroViewport") &&
    livePreview.includes("homeHeroDeviceForWidth") &&
    livePreview.includes("HOME_HERO_VIEWPORT_DEFAULTS") &&
    livePreview.includes("clampHomeHeroViewport") &&
    !livePreview.includes("HOME_HERO_VIEWPORT_WIDTH_LIMITS") &&
    !livePreview.includes("HOME_HERO_VIEWPORT_HEIGHT_LIMITS"),
  "La preview debe consumir el contrato único de dispositivos y elegir automáticamente un viewport real o recomendado, sin exponer límites técnicos de emulación."
);

assert(
  heroSection.includes("homeHeroVisiblePositions(") &&
    heroSection.includes("renderedCards.map") &&
    heroSection.includes("presentation.positions[position]") &&
    heroSection.includes("homeHeroPositionTransform(positionStyle)") &&
    heroSection.includes("homeHeroPositionDisplay") &&
    heroSection.includes("homeHeroSlotCSS") &&
    heroSection.includes('data-motion-style={presentation.motionStyle}') &&
    heroSection.includes('"--hero-drag-offset"') &&
    heroSection.includes("--hero-editor-overlay") &&
    heroSection.includes("--hero-editor-border"),
  "El renderer público debe consumir visibilidad/geometría canónicas, el único motionStyle V3, drag continuo, overlay y borde desde HomeHeroPresentation."
);

assert(
  heroSection.includes("game.rating") &&
    heroSection.includes("game.developer") &&
    heroSection.includes("game.releaseDate") &&
    heroSection.includes("game.platforms") &&
    heroSection.includes("game.version") &&
    heroSection.includes('const HERO_PRIMARY_ACTION = "Ver juego"') &&
    heroSection.includes('const HERO_SECONDARY_ACTION = "Más información"') &&
    !heroSection.includes("HomeCopy") &&
    !heroSection.includes("copy: HomeCopy"),
  "El Hero público debe obtener su información del juego y no depender de copy paralelo."
);

assert(
  heroMotionStyles.includes('data-motion-style="momentum"') &&
    heroMotionStyles.includes('data-motion-style="morph"') &&
    heroMotionStyles.includes('data-motion-style="parallax"') &&
    heroMotionStyles.includes("--hero-motion-duration") &&
    heroStyles.includes("@media(max-width:1100px)") &&
    heroStyles.includes("@media(max-width:680px)") &&
    heroMotionStyles.includes("prefers-reduced-motion"),
  "El Hero público debe implementar sólo los tres movimientos V3, sus ritmos art-directed y los breakpoints compartidos."
);

assert(
  heroEditor.includes("Editor de Hero") &&
    heroEditor.includes("selectionModes") &&
    heroEditor.includes("Elige la composición") &&
    heroEditor.includes("Tamaño y espacio") &&
    heroEditor.includes("Momentum") &&
    heroEditor.includes("Morph") &&
    heroEditor.includes("Parallax Sweep") &&
    heroEditor.includes("Editar imagen y encuadre") &&
    heroEditor.includes("HomeHeroLivePreview") &&
    heroEditor.includes("Guardar borrador") &&
    heroEditor.includes("Revisar y publicar Inicio") &&
    !heroEditor.includes("Transformación 3D") &&
    !heroEditor.includes("Tarjetas visibles") &&
    !heroEditor.includes("Perspectiva") &&
    !heroEditor.includes("Aplicar cambios a:") &&
    !heroEditor.includes("Cambiar imagen") &&
    !heroEditor.includes("Ajustar encuadre") &&
    !heroEditor.includes("Título accesible") &&
    !heroEditor.includes("Botón principal") &&
    !heroEditor.includes("Botón secundario"),
  "El editor del Hero debe controlar selección, geometría esencial y movimiento con una superficie simple, sin microcontroles técnicos ni campos de copy fantasma."
);

assert(
  livePreview.includes("<HeroSection") &&
    livePreview.includes('className="main-content"') &&
    livePreview.includes("<PublicPageBackground") &&
    livePreview.includes('previewPathname="/"') &&
    livePreview.includes("IsolatedPublicPreviewFrame") &&
    livePreview.includes("ref={setPreviewEnd}") &&
    isolatedPreview.includes("createPortal") &&
    isolatedPreview.includes("synchronizePreviewStyles") &&
    isolatedPreview.includes("synchronizeRootIdentity") &&
    !heroEditor.includes("previewCopy"),
  "La vista del editor debe usar el renderer público real dentro de infraestructura de preview aislada."
);

assert(
  adminContext.includes("homeAdminSectionContract") &&
    adminContext.includes("homeSections = homeAdminSectionContract.map") &&
    adminContext.includes("resolveHomeAdminSection") &&
    adminContext.includes('searchParams.get("seccion") ?? undefined') &&
    homeAdminSections.includes("resolveHomeAdminSection"),
  "Página y navegación de Inicio deben compartir IDs, labels y fallback de sección administrativa."
);

assert(
  !gamesForYourPc.includes("/cuenta#mi-pc") &&
    gamesForYourPc.includes('personalized ? "/cuenta?vista=pc"') &&
    accountPage.includes("resolveAccountDashboardView") &&
    accountPage.includes("searchParams") &&
    accountPage.includes("initialView={initialView}") &&
    accountDashboard.includes("initialView: AccountDashboardView") &&
    accountDashboard.includes("useState<AccountDashboardView>(initialView)") &&
    accountDashboard.includes("accountDashboardViewHref") &&
    accountDashboard.includes("window.history.pushState") &&
    accountDashboard.includes('window.addEventListener("popstate"') &&
    accountDashboard.includes("aria-current") &&
    accountDashboardView.includes("accountDashboardViewHref") &&
    accountDashboardView.includes('"overview"') &&
    accountDashboardView.includes('"pc"') &&
    accountDashboardView.includes(': "overview"'),
  "La Home personalizada debe abrir Mi PC mediante un deep-link SSR determinista y Mi DeUna debe mantener vista, URL y navegación Back/Forward sincronizadas."
);

assert(
  !accountPage.includes("compatibilityPercent") &&
    !accountDashboard.includes("% compatible") &&
    accountPage.includes("performanceEstimate: entry.estimate?.canEstimate") &&
    accountPage.includes("hardwareEstimateCount / games.length") &&
    accountDashboard.includes("FPS estimados") &&
    accountDashboard.includes("confianza") &&
    accountDashboard.includes("hardwareCoveragePercent") &&
    accountDashboard.includes("Este porcentaje mide cobertura de calibración, no compatibilidad"),
  "Mi PC debe mostrar rangos FPS estimados y confianza del motor real; cualquier porcentaje debe representar sólo cobertura de calibración, no una compatibilidad inventada."
);

assert(
  cardCarousel.includes("prefers-reduced-motion: reduce") &&
    cardCarousel.includes("behavior: reducedMotion") &&
    cardCarousel.includes('? "auto"') &&
    cardCarousel.includes(': "smooth"'),
  "Los carruseles de Inicio deben respetar movimiento reducido también en el scroll disparado por JavaScript."
);

assert(
  creationService.includes("addedAt: new Date().toISOString().slice(0, 10)"),
  "Los juegos nuevos deben conservar fecha UTC de incorporación."
);

if (failures.length > 0) {
  console.error("\nHome editorial: BLOQUEADA\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Home editorial: OK (ownership aislado, título SEO/accesible publicado con dueño explícito, guardado atómico con lock, sin recovery local redundante, navegación protegida, deep-link de Mi PC navegable, FPS sin falsa precisión, catálogo público fail-closed y preview pública compartida)."
  );
}