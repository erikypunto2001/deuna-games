import {
  readFile,
  stat,
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
  accountDashboard,
  adminLogin,
  adminLoginStyles,
  adminShell,
  notFound,
  rootLayout,
  manifest,
  appIconRoute,
  faviconRoute,
  appIconContract,
  appIconRenderer,
  logoImageResolver,
  socialImage,
  mediaRoute,
  mediaServing,
] = await Promise.all([
  source("src/app/cuenta/AccountDashboardClient.tsx"),
  source("src/app/admin/login/page.tsx"),
  source("src/app/admin/login/login.module.css"),
  source("src/components/admin/AdminShell.tsx"),
  source("src/app/not-found.tsx"),
  source("src/app/layout.tsx"),
  source("src/app/manifest.ts"),
  source("src/app/app-icon/[size]/route.ts"),
  source("src/app/favicon.ico/route.ts"),
  source("src/lib/site/app-icon.ts"),
  source("src/lib/site-app-icon.tsx"),
  source("src/lib/site-logo-image.ts"),
  source("src/lib/social-image.tsx"),
  source("src/app/media/editorial/[slug]/[filename]/route.ts"),
  source("src/lib/media/editorial-media-serving.ts"),
]);


assert(
  accountDashboard.includes("<SiteBrand") &&
    accountDashboard.includes("siteName={siteName}"),
  "Mi DeUna autenticado debe conservar SiteBrand y la identidad publicada."
);


assert(
  adminLogin.includes('from "@/components/brand/SiteLogoMark"') &&
    adminLogin.includes("<SiteLogoMark size={30}"),
  "El login Admin debe mostrar el mismo logo publicado que el panel protegido."
);


assert(
  adminLoginStyles.includes(".brandIcon.brandIcon") &&
    adminLoginStyles.includes("#101722") &&
    adminLoginStyles.includes("#080d14"),
  "El logo del login Admin debe apoyarse sobre una superficie neutra para no perder contraste con el color de marca."
);


assert(
  adminShell.includes("<SiteLogoMark") &&
    adminShell.includes("siteName"),
  "El shell Admin protegido debe conservar el renderer canónico del logo."
);


assert(
  notFound.includes("<Header") &&
    notFound.includes("<Footer"),
  "La página 404 debe heredar la identidad publicada a través de Header y Footer."
);


assert(
  logoImageResolver.includes("buildSiteBrandLogoDataUri") &&
    logoImageResolver.includes("resolveSiteLogoColor") &&
    logoImageResolver.includes("resolveSiteLogoColorMode") &&
    logoImageResolver.includes('colorMode === "original" ? null : color'),
  "La resolución server-side del logo debe centralizar fallback, recolor SVG y raster original."
);


assert(
  socialImage.includes("resolveSiteLogoImage") &&
    socialImage.includes("logoDataUri") &&
    socialImage.includes("src: logoDataUri"),
  "Open Graph/Twitter deben consumir el resolver server-side compartido."
);


assert(
  appIconContract.includes("siteAppIconSizes") &&
    appIconContract.includes("siteAppIconVersion") &&
    appIconContract.includes("safeThemeBackground") &&
    appIconContract.includes("32,") &&
    appIconContract.includes("64,") &&
    appIconContract.includes("180,") &&
    appIconContract.includes("192,") &&
    appIconContract.includes("512,"),
  "El contrato puro de iconos debe fijar tamaños y versionar todas las señales visuales relevantes."
);


assert(
  appIconRenderer.includes("getPublicSiteConfig") &&
    appIconRenderer.includes("resolveSiteLogoImage") &&
    appIconRenderer.includes("safeThemeBackground") &&
    appIconRenderer.includes("SiteAppIconSize") &&
    !appIconRenderer.includes("siteAppIconVersion"),
  "El renderer PNG debe leer sólo el snapshot publicado y mantenerse separado del contrato liviano de metadata."
);


assert(
  appIconRoute.includes('dynamic = "force-dynamic"') &&
    appIconRoute.includes('runtime = "nodejs"') &&
    appIconRoute.includes("isSiteAppIconSize") &&
    appIconRoute.includes("X-Content-Type-Options") &&
    !appIconRoute.includes("immutable"),
  "El endpoint de iconos debe validar tamaños, usar runtime server y no prometer inmutabilidad sobre una identidad dinámica."
);


assert(
  faviconRoute.includes('dynamic = "force-dynamic"') &&
    faviconRoute.includes('runtime = "nodejs"') &&
    faviconRoute.includes("createSiteAppIcon(32)") &&
    faviconRoute.includes("X-Content-Type-Options") &&
    faviconRoute.includes("must-revalidate") &&
    !faviconRoute.includes("immutable"),
  "El favicon de compatibilidad debe delegar dinámicamente al icono 32px de la identidad publicada, sin cache inmutable."
);


assert(
  rootLayout.includes('from "@/lib/site/app-icon"') &&
    rootLayout.includes("siteAppIconVersion(config)") &&
    rootLayout.includes("/app-icon/32?v=") &&
    rootLayout.includes("/app-icon/64?v=") &&
    rootLayout.includes("/app-icon/180?v=") &&
    rootLayout.includes('sizes: "32x32"') &&
    rootLayout.includes('sizes: "180x180"') &&
    !rootLayout.includes('from "@/lib/site-app-icon"'),
  "Metadata debe usar el contrato liviano y exponer favicon/Apple icon versionados por la identidad publicada."
);


assert(
  manifest.includes('from "@/lib/site/app-icon"') &&
    manifest.includes("siteAppIconVersion(config)") &&
    manifest.includes("safeThemeBackground(config.themeColor)") &&
    manifest.includes("background_color: themeColor") &&
    manifest.includes("theme_color: themeColor") &&
    manifest.includes("/app-icon/192?v=") &&
    manifest.includes("/app-icon/512?v=") &&
    manifest.includes('purpose: "any"'),
  "El manifest PWA debe usar el tema público seguro y publicar iconos 192/512 derivados de la identidad activa."
);


assert(
  mediaRoute.includes("resolveEditorialMediaServingAccess") &&
    mediaRoute.includes('servingAccess === "admin"') &&
    mediaRoute.includes('"private, no-store, max-age=0"') &&
    mediaRoute.includes('"public, max-age=31536000, immutable"') &&
    mediaServing.includes('"site_config"') &&
    mediaServing.includes("site.logoAsset") &&
    mediaServing.includes("published_payload") &&
    mediaServing.includes("public_visible") &&
    mediaServing.includes("isCurrentlyPublished") &&
    mediaServing.includes("safePublicationReferences(owner, item.published_payload)") &&
    mediaServing.includes("refreshed.references.has(publicPath)") &&
    !mediaServing.includes("editorial_publications") &&
    !mediaServing.includes("editorial_revisions"),
  "El logo debe usar la autoridad compartida de multimedia: borradores sólo para Admin y únicamente referencias de la publicación vigente permanecen públicas."
);


let staticFaviconExists = false;
try {
  const faviconEntry = await stat(path.join(root, "src/app/favicon.ico"));
  staticFaviconExists = faviconEntry.isFile();
} catch {}


assert(
  !staticFaviconExists,
  "No debe coexistir un favicon.ico estático que pueda contradecir el logo editorial publicado."
);


if (failures.length > 0) {
  console.error("\nSuperficies del logo global: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Superficies del logo global: OK (web, Admin, Cuenta, metadata, PWA, favicon dinámico, social y serving current-only convergen en la identidad editorial)."
  );
}