import {
  readFile,
  readdir,
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

async function joinSources(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const names = await readdir(directory);
  const files = names.filter((name) => name.endsWith(".tsx"));
  const contents = await Promise.all(
    files.map((name) => readFile(path.join(directory, name), "utf8"))
  );
  return contents.join("\n");
}

const [
  rootLayout,
  manifest,
  openGraphImage,
  twitterImage,
  socialImage,
  robots,
  sitemap,
  homePage,
  homeConfig,
  publicHomeReader,
  homeComponents,
  gamesPage,
  gamesStyles,
  gameCatalogClient,
  catalogCapabilities,
  popularGamesRoute,
  recentGamesRoute,
  updatesPage,
  requirementsPage,
  publicPagesConfig,
  publicPagesReader,
  adminPresentationPage,
  publicGamesAdminRoute,
  siteBackgrounds,
  footer,
] = await Promise.all([
  source("src/app/layout.tsx"),
  source("src/app/manifest.ts"),
  source("src/app/opengraph-image.tsx"),
  source("src/app/twitter-image.tsx"),
  source("src/lib/social-image.tsx"),
  source("src/app/robots.ts"),
  source("src/app/sitemap.ts"),
  source("src/app/page.tsx"),
  source("src/data/home-config.ts"),
  source("src/lib/home/public-home-config.ts"),
  joinSources("src/components/home"),
  source("src/app/juegos/page.tsx"),
  source("src/app/juegos/page.module.css"),
  source("src/components/games/GameCatalogClient.tsx"),
  source("src/lib/games/catalog-capabilities.ts"),
  source("src/app/juegos/populares/page.tsx"),
  source("src/app/juegos/nuevos/page.tsx"),
  source("src/app/actualizaciones/page.tsx"),
  source("src/app/requisitos/page.tsx"),
  source("src/data/public-pages-config.ts"),
  source("src/lib/site/public-pages-config.ts"),
  source("src/app/admin/(protected)/paginas/presentacion/page.tsx"),
  source("src/app/api/admin/content/public-pages/games/route.ts"),
  source("src/lib/site/backgrounds.ts"),
  source("src/components/layout/Footer.tsx"),
]);

assert(
  homePage.includes("getPublicHomeConfig") &&
    homePage.includes("homeConfig.sections.map(renderSection)") &&
    homePage.includes("const copy = homeConfig.copy") &&
    homeConfig.includes("sections:") &&
    homeConfig.includes("copy:"),
  "Inicio debe resolver orden, visibilidad y copy desde una sola configuración editorial publicada."
);

assert(
  publicHomeReader.includes("item_type = 'home_config'") &&
    publicHomeReader.includes("published_payload") &&
    publicHomeReader.includes("public_visible = true") &&
    publicHomeReader.includes("cache(") &&
    !publicHomeReader.includes("draft_payload"),
  "La configuración pública de Inicio debe ser cacheada y leer sólo el snapshot publicado visible."
);

for (const phrase of [
  "COMPATIBILIDAD DE JUEGOS",
  "Ver todas las actualizaciones",
  "JUEGOS CON REQUISITOS",
  "Una selección editorial para explorar el catálogo sin presentar métricas que no estén respaldadas.",
  "Versiones identificadas",
]) {
  assert(
    homeConfig.includes(phrase) && !homeComponents.includes(phrase),
    `El copy editorial de Inicio debe vivir en home-config y no quedar fijo en componentes: ${phrase}`
  );
}

assert(
  catalogCapabilities.includes("export function getCatalogCapabilities") &&
    catalogCapabilities.includes("reviewScore(game.reviews) > 0") &&
    catalogCapabilities.includes("parseGameDate(game.releaseDate) !== 0") &&
    catalogCapabilities.includes("Number.isFinite(game.rating)") &&
    catalogCapabilities.includes("game.version?.trim()") &&
    catalogCapabilities.includes("export function resolveSupportedCatalogSort") &&
    catalogCapabilities.includes("export function resolveSupportedCatalogStatus") &&
    gameCatalogClient.includes("getCatalogCapabilities") &&
    gameCatalogClient.includes("resolveSupportedCatalogSort") &&
    gameCatalogClient.includes("resolveSupportedCatalogStatus") &&
    !gameCatalogClient.includes("function supportedSort(") &&
    !gameCatalogClient.includes("const hasRatings = games.some(") &&
    homePage.includes("getCatalogCapabilities") &&
    homePage.includes("ratings: ratingsAvailable") &&
    homePage.includes("ratingsAvailable={ratingsAvailable}") &&
    homeComponents.includes('href: "/juegos?orden=rating"') &&
    homeComponents.includes("requiresRatings: true") &&
    homeComponents.includes("option.requiresRatings && !ratingsAvailable") &&
    homeComponents.includes("hardwareCardUnavailable"),
  "Home y catálogo deben compartir una única detección de capacidades públicas y no habilitar ratings, popularidad, fechas o versiones sin datos utilizables."
);

assert(
  footer.includes("getPublicSiteConfig") &&
    footer.includes("getPublicGames") &&
    footer.includes("getCatalogCapabilities") &&
    footer.includes("capabilities.reviews &&") &&
    footer.includes("capabilities.releaseDates &&") &&
    footer.includes("capabilities.ratings &&") &&
    footer.includes("Lanzamientos recientes") &&
    !footer.includes("Añadidos recientemente") &&
    footer.includes("config.description") &&
    footer.includes("config.footerTagline") &&
    !footer.includes("Hecho para encontrar tu próximo juego."),
  "El Footer debe reutilizar identidad publicada y exponer sólo accesos respaldados por capacidades reales del catálogo."
);

assert(
  popularGamesRoute.includes("getPublicGames") &&
    popularGamesRoute.includes("getCatalogCapabilities") &&
    popularGamesRoute.includes("capabilities.reviews") &&
    popularGamesRoute.includes('"/juegos?orden=popular"') &&
    popularGamesRoute.includes(': "/juegos"') &&
    recentGamesRoute.includes("getPublicGames") &&
    recentGamesRoute.includes("getCatalogCapabilities") &&
    recentGamesRoute.includes("capabilities.releaseDates") &&
    recentGamesRoute.includes('"/juegos?estado=recent&orden=recientes"') &&
    recentGamesRoute.includes(': "/juegos"'),
  "Los redirects de Populares y Lanzamientos recientes deben degradar al catálogo general cuando la capacidad publicada no existe."
);

assert(
  rootLayout.includes("getPublicHomeConfig") &&
    rootLayout.includes("homeConfig.copy.hero.accessibleTitle") &&
    homePage.includes("homeConfig.copy.hero.accessibleTitle") &&
    !rootLayout.includes("Encuentra juegos para tu PC") &&
    !homePage.includes("Encuentra juegos para tu PC"),
  "La metadata de Inicio debe reutilizar el título accesible publicado en Portada, sin mantener un segundo copy SEO fijo."
);

assert(
  manifest.includes("getPublicSiteConfig") &&
    manifest.includes("name: config.name") &&
    manifest.includes("short_name: config.shortName") &&
    manifest.includes("description: config.description") &&
    manifest.includes("safeThemeBackground(config.themeColor)") &&
    manifest.includes("background_color: themeColor") &&
    manifest.includes("theme_color: themeColor"),
  "El manifest debe reutilizar la identidad pública publicada y normalizar el color PWA con el mismo contrato seguro de la web."
);

for (const [name, image] of [
  ["OpenGraph", openGraphImage],
  ["Twitter", twitterImage],
]) {
  assert(
    image.includes("getPublicHomeConfig") &&
      image.includes("homeConfig.copy.hero.accessibleTitle") &&
      image.includes("headline:"),
    `${name} debe reutilizar el titular publicado de Portada.`
  );
}

assert(
  socialImage.includes("headline: string") &&
    socialImage.includes("identity.headline") &&
    !socialImage.includes("Encuentra juegos para&nbsp;") &&
    !socialImage.includes(">tu PC<"),
  "La plantilla social compartida debe recibir el titular editorial y no conservar un copy promocional paralelo."
);

assert(
  robots.includes('disallow: [') &&
    robots.includes('"/admin"') &&
    robots.includes('"/api/admin/"') &&
    robots.includes('absoluteUrl("/sitemap.xml")'),
  "robots.txt debe seguir siendo una regla estructural que excluya el panel y su API administrativa."
);

const sitemapReadsPublicGames =
  sitemap.includes("await getPublicGames()") ||
  /Promise\.all\(\s*\[[\s\S]*?getPublicGames\(\)/.test(
    sitemap
  );

assert(
  sitemap.includes("getPublicGames") &&
    sitemapReadsPublicGames &&
    !sitemap.includes('from "@/data/games"') &&
    sitemap.includes("game.slug"),
  "El sitemap debe generarse desde el catálogo público publicado para incluir altas del panel y excluir juegos ocultos."
);

for (const [name, content] of [
  ["Juegos", gamesPage],
  ["Actualizaciones", updatesPage],
  ["¿Qué puedo jugar?", requirementsPage],
]) {
  assert(
    content.includes("getPublicPagesConfig") &&
      !content.includes("sourcePublicPagesConfig"),
    `${name} debe consumir la configuración editorial publicada y no la fuente directamente.`
  );
}

assert(
  publicPagesConfig.includes("games:") &&
    publicPagesConfig.includes("updates:") &&
    publicPagesConfig.includes("finder:") &&
    publicPagesReader.includes("published_payload") &&
    publicPagesReader.includes("public_visible = true") &&
    publicPagesReader.includes("cache(") &&
    !publicPagesReader.includes("draft_payload"),
  "Las superficies públicas deben compartir una configuración estructurada, cacheada y basada sólo en snapshots publicados."
);

assert(
  !gamesPage.includes("heroImage") &&
    !gamesPage.includes("heroShade") &&
    !gamesPage.includes("heroGlow") &&
    !gamesStyles.includes(".heroImage") &&
    !gamesStyles.includes(".heroShade") &&
    !gamesStyles.includes(".heroGlow") &&
    !gamesStyles.includes("juegos-reference-hero-v2.webp") &&
    !publicPagesConfig.includes("heroImage") &&
    !adminPresentationPage.includes('name="heroImage"') &&
    !publicGamesAdminRoute.includes('"heroImage"') &&
    siteBackgrounds.includes('{ key: "games", label: "Juegos" }') &&
    siteBackgrounds.includes('return "games";'),
  "Juegos no debe reintroducir un Hero gráfico propio ni su campo editorial; el fondo general configurable de la página debe seguir disponible."
);

for (const phrase of [
  "Explora nuestro catálogo, filtra por clasificación",
  "Sigue las nuevas versiones de los juegos disponibles.",
  "Detectamos lo que el navegador permite",
]) {
  assert(
    publicPagesConfig.includes(phrase) &&
      !gamesPage.includes(phrase) &&
      !updatesPage.includes(phrase) &&
      !requirementsPage.includes(phrase),
    `El copy editorial de páginas públicas no debe duplicarse dentro de sus componentes: ${phrase}`
  );
}

if (failures.length > 0) {
  console.error("\nFronteras editoriales del frontend: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Fronteras editoriales del frontend: OK (contenido administrable centralizado; Hero gráfico propio de Juegos ausente; fondo general de Juegos preservado; capacidades públicas coherentes; metadata, social y sitemap alineados con snapshots publicados; UI técnica permanece en código)."
  );
}
