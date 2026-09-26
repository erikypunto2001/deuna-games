export const representativeGameSlug = "elden-ring";
export const representativeUpdateId = "visual-historical-update";
export const representativeSoftwareSlug = "visual-emulator";
export const representativeCollectionSlug = "visual-collection";
const representativeGameTitle = "ELDEN RING";

export const browserViewports = [
  { id: "desktop", width: 1440, height: 1000, mobile: false },
  { id: "tablet", width: 1024, height: 900, mobile: false },
  { id: "mobile", width: 390, height: 844, mobile: true },
];

// Route patterns are normalized from src/app/**/page.tsx. Route groups such as
// (protected) are intentionally absent because they do not exist in the URL.
// Every real page route must live here so adding a page cannot silently escape
// browser coverage.
export const coveredPageRoutePatterns = [
  "/",
  "/actualizaciones",
  "/colecciones",
  "/colecciones/[slug]",
  "/cuenta",
  "/juegos",
  "/juegos/[slug]",
  "/juegos/[slug]/descargar",
  "/juegos/bajos-recursos",
  "/juegos/nuevos",
  "/juegos/populares",
  "/privacidad",
  "/programas",
  "/programas/[slug]",
  "/quienes-somos",
  "/requisitos",
  "/admin",
  "/admin/actualizaciones",
  "/admin/actualizaciones/[id]",
  "/admin/actualizaciones/nueva",
  "/admin/catalogos",
  "/admin/colecciones",
  "/admin/colecciones/[slug]",
  "/admin/colecciones/nueva",
  "/admin/configuracion",
  "/admin/cuentas",
  "/admin/juegos",
  "/admin/juegos/[slug]",
  "/admin/juegos/[slug]/actualizacion",
  "/admin/juegos/[slug]/publicacion",
  "/admin/juegos/[slug]/vista-previa",
  "/admin/juegos/nuevo",
  "/admin/login",
  "/admin/mantenimiento",
  "/admin/paginas",
  "/admin/plataformas",
  "/admin/programas",
  "/admin/programas/[slug]",
  "/admin/programas/nuevo",
  "/admin/paginas/presentacion",
  "/admin/paginas/quienes-somos",
  "/admin/portada",
  "/admin/seguridad",
].sort();

export const publicVisualPages = [
  { id: "public-home", pathname: "/", expectedText: null },
  { id: "public-games", pathname: "/juegos", expectedText: null },
  { id: "public-collections", pathname: "/colecciones", expectedText: "Colecciones" },
  { id: "public-collection-detail", pathname: `/colecciones/${representativeCollectionSlug}`, expectedText: "Colección visual CI" },
  { id: "public-programs", pathname: "/programas", expectedText: "Programas" },
  { id: "public-program-detail", pathname: `/programas/${representativeSoftwareSlug}`, expectedText: "Emulador visual CI" },
  { id: "public-updates", pathname: "/actualizaciones", expectedText: null },
  { id: "public-finder", pathname: "/requisitos", expectedText: null, dismissDialog: true },
  { id: "public-about", pathname: "/quienes-somos", expectedText: null },
  { id: "public-privacy", pathname: "/privacidad", expectedText: null },
  { id: "public-account-access", pathname: "/cuenta", expectedText: "Tu DeUna" },
  {
    id: "public-game-detail",
    pathname: `/juegos/${representativeGameSlug}`,
    expectedText: representativeGameTitle,
  },
  {
    id: "public-not-found",
    pathname: "/__deuna_browser_smoke_missing__",
    expectedText: "ERROR 404",
    expectedDocumentStatus: 404,
  },
];

export const adminLoginVisualPage = {
  id: "admin-login",
  pathname: "/admin/login",
  expectedText: "Panel de",
};

const gameEditorSections = [
  ["ficha", "game-ficha"],
  ["datos", "game-data"],
  ["requisitos", "game-requirements"],
  ["rendimiento", "game-performance"],
  ["multimedia", "game-media"],
  ["descargas", "game-downloads"],
  ["valoracion", "game-valuation"],
];

const historicalUpdateSections = [
  ["editar", "historical-update-edit"],
  ["publicacion", "historical-update-publication"],
];

const catalogSections = [
  ["clasificaciones", "catalog-classifications"],
  ["etiquetas", "catalog-tags"],
  ["publicacion", "catalog-publication"],
];

const configurationStates = [
  ["identidad", null, "configuration-identity"],
  ["apariencia", "palette", "configuration-palette"],
  ["apariencia", "backgrounds", "configuration-backgrounds"],
  ["publicacion", null, "configuration-publication"],
];

const presentationSections = [
  ["juegos", "pages-games"],
  ["actualizaciones", "pages-updates"],
  ["compatibilidad", "pages-finder"],
  ["publicacion", "pages-publication"],
];

const aboutSections = [
  ["encabezado", "about-header"],
  ["principios", "about-principles"],
  ["proposito", "about-purpose"],
  ["cierre", "about-closing"],
  ["publicacion", "about-publication"],
];

const homeSections = [
  ["hero", "home-hero"],
  ["contenido", "home-content"],
  ["publicacion", "home-publication"],
];

export const adminVisualPages = [
  { id: "admin-dashboard", pathname: "/admin", expectedText: "Resumen" },
  { id: "admin-games", pathname: "/admin/juegos", expectedText: "Juegos" },
  { id: "admin-new-game", pathname: "/admin/juegos/nuevo", expectedText: "Nuevo juego" },
  { id: "admin-platforms", pathname: "/admin/plataformas", expectedText: "Plataformas" },
  { id: "admin-programs", pathname: "/admin/programas", expectedText: "Programas" },
  { id: "admin-program-detail", pathname: `/admin/programas/${representativeSoftwareSlug}`, expectedText: "Emulador visual CI" },
  { id: "admin-new-program", pathname: "/admin/programas/nuevo", expectedText: "Nuevo programa" },
  { id: "admin-collections", pathname: "/admin/colecciones", expectedText: "Colecciones" },
  { id: "admin-collection-detail", pathname: `/admin/colecciones/${representativeCollectionSlug}`, expectedText: "Colección visual CI" },
  { id: "admin-new-collection", pathname: "/admin/colecciones/nueva", expectedText: "Nueva colección" },
  ...gameEditorSections.map(([section, id]) => ({
    id: `admin-${id}`,
    pathname: `/admin/juegos/${representativeGameSlug}?seccion=${section}`,
    expectedText: representativeGameTitle,
  })),
  {
    id: "admin-game-preview",
    pathname: `/admin/juegos/${representativeGameSlug}/vista-previa`,
    expectedText: "VISTA PREVIA EDITORIAL",
  },
  {
    id: "admin-game-publication",
    pathname: `/admin/juegos/${representativeGameSlug}/publicacion`,
    expectedText: representativeGameTitle,
  },
  {
    id: "admin-game-update",
    pathname: `/admin/juegos/${representativeGameSlug}/actualizacion`,
    expectedText: "NUEVA VERSIÓN",
  },
  ...historicalUpdateSections.map(([section, id]) => ({
    id: `admin-${id}`,
    pathname:
      `/admin/actualizaciones/${representativeUpdateId}?seccion=${section}`,
    expectedText:
      "Compatibilidad editorial para un borrador antiguo",
  })),
  ...catalogSections.map(([section, id]) => ({
    id: `admin-${id}`,
    pathname: `/admin/catalogos?seccion=${section}`,
    expectedText: "Clasificaciones y etiquetas",
  })),
  ...configurationStates.map(([section, panel, id]) => ({
    id: `admin-${id}`,
    pathname: `/admin/configuracion?seccion=${section}${panel ? `&panel=${panel}` : ""}`,
    expectedText:
      section === "identidad"
        ? "Identidad de marca"
        : section === "apariencia"
          ? "Apariencia del sitio"
          : "Publicación de marca y apariencia",
  })),
  { id: "admin-pages-index", pathname: "/admin/paginas", expectedText: "Páginas públicas" },
  ...presentationSections.map(([section, id]) => ({
    id: `admin-${id}`,
    pathname: `/admin/paginas/presentacion?seccion=${section}`,
    expectedText: "Textos y cabeceras públicas",
  })),
  ...aboutSections.map(([section, id]) => ({
    id: `admin-${id}`,
    pathname: `/admin/paginas/quienes-somos?seccion=${section}`,
    expectedText: "Quiénes somos",
  })),
  ...homeSections.map(([section, id]) => ({
    id: `admin-${id}`,
    pathname: `/admin/portada?seccion=${section}`,
    expectedText: "Inicio",
  })),
  { id: "admin-accounts", pathname: "/admin/cuentas", expectedText: "Cuentas administrativas" },
  { id: "admin-security", pathname: "/admin/seguridad", expectedText: "Acceso y seguridad" },
  { id: "admin-maintenance", pathname: "/admin/mantenimiento", expectedText: "Mantenimiento" },
];

export const redirectChecks = [
  {
    id: "public-new-games-alias",
    pathname: "/juegos/nuevos",
    authenticated: false,
    finalPathname: "/juegos",
    finalSearch: { estado: "recent", orden: "recientes" },
  },
  {
    id: "public-popular-games-alias",
    pathname: "/juegos/populares",
    authenticated: false,
    finalPathname: "/juegos",
    finalSearch: {},
  },
  {
    id: "public-low-spec-games-alias",
    pathname: "/juegos/bajos-recursos",
    authenticated: false,
    finalPathname: "/juegos",
    finalSearch: { equipo: "lowSpec" },
  },
  {
    id: "admin-updates-alias",
    pathname: "/admin/actualizaciones",
    authenticated: true,
    finalPathname: "/admin/juegos",
    finalSearch: {},
  },
  {
    id: "admin-new-update-alias",
    pathname: "/admin/actualizaciones/nueva",
    authenticated: true,
    finalPathname: "/admin/juegos",
    finalSearch: {},
  },
];