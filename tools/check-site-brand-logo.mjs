import {
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
  sourceIdentity,
  validation,
  formSchema,
  configPage,
  configRoute,
  logoEditor,
  logoEditorStyles,
  logoUploadRoute,
  logoStorage,
  logoReader,
  safeSvg,
  privacySafeSvg,
  safeRaster,
  editorialMedia,
  publicMediaRoute,
  mediaServing,
  nextConfig,
  publicConfig,
  rootLayout,
  logoRenderer,
  logoStyles,
  siteBrand,
  headerClient,
  footer,
  accountDashboard,
  adminShell,
  identityPreview,
  appearanceWorkspace,
  siteLogoImage,
  socialImage,
] = await Promise.all([
  source("src/lib/site.ts"),
  source("src/lib/admin/content-validation-core.ts"),
  source("src/lib/admin/frontend-content-forms.ts"),
  source("src/app/admin/(protected)/configuracion/page.tsx"),
  source("src/app/api/admin/content/configuration/route.ts"),
  source("src/components/admin/SiteBrandLogoEditor.tsx"),
  source("src/components/admin/SiteBrandLogoEditor.module.css"),
  source("src/app/api/admin/content/configuration/logo-upload/route.ts"),
  source("src/lib/media/taxonomy-icon-upload.ts"),
  source("src/lib/media/site-brand-logo.ts"),
  source("src/lib/media/safe-svg-icon.ts"),
  source("src/lib/media/safe-site-logo-svg.ts"),
  source("src/lib/media/safe-site-logo-raster.ts"),
  source("src/lib/media/editorial-media.ts"),
  source("src/app/media/editorial/[slug]/[filename]/route.ts"),
  source("src/lib/media/editorial-media-serving.ts"),
  source("next.config.ts"),
  source("src/lib/site/public-site-config.ts"),
  source("src/app/layout.tsx"),
  source("src/components/brand/SiteLogoMark.tsx"),
  source("src/components/brand/SiteLogoMark.module.css"),
  source("src/components/layout/SiteBrand.tsx"),
  source("src/components/layout/HeaderClientBase.tsx"),
  source("src/components/layout/Footer.tsx"),
  source("src/app/cuenta/AccountDashboardClient.tsx"),
  source("src/components/admin/AdminShell.tsx"),
  source("src/components/admin/SiteIdentityPreview.tsx"),
  source("src/components/admin/SiteAppearanceWorkspace.tsx"),
  source("src/lib/site-logo-image.ts"),
  source("src/lib/social-image.tsx"),
]);

assert(
  sourceIdentity.includes('logoColorMode: "brand"') &&
    sourceIdentity.includes('logoCustomColor: "#ff0847"'),
  "La identidad fuente debe conservar un fallback explícito: logo original siguiendo el color de marca."
);

assert(
  validation.includes("siteBrandLogoAssetPattern") &&
    validation.includes("logoAsset:") &&
    validation.includes("logoColorMode:") &&
    validation.includes("logoCustomColor:") &&
    validation.includes('config.logoColorMode === "custom"'),
  "site_config debe validar asset, modo de color y color personalizado dentro del contrato editorial versionado."
);

assert(
  formSchema.includes("logoAsset: z.string().trim().max(400)") &&
    formSchema.includes("logoAsset: logoAsset || undefined") &&
    formSchema.includes("logoColorMode: z.enum(siteLogoColorModes)") &&
    configRoute.includes("hasExactAdminFormFields") &&
    configRoute.includes("readStoredSiteBrandLogo(input.logoAsset)") &&
    configRoute.includes("resolveSiteLogoColorMode") &&
    configRoute.includes("normalizedInput"),
  "El formulario debe transportar el contrato del logo, revalidar el asset y normalizar server-side modos incompatibles."
);

assert(
  configPage.includes("<SiteBrandLogoEditor") &&
    configPage.includes("initialAsset={config.logoAsset}") &&
    configPage.includes("initialColorMode={config.logoColorMode}") &&
    logoEditor.includes('name="logoAsset"') &&
    logoEditor.includes('name="logoColorMode"') &&
    logoEditor.includes('name="logoCustomColor"'),
  "Configuración → Identidad debe editar el logo dentro del mismo guardado editorial."
);

const canonicalLogoModeFields =
  logoEditor.match(/name="logoColorMode"/g) ?? [];

assert(
  canonicalLogoModeFields.length === 3 &&
    logoEditor.includes('value="original"') &&
    logoEditor.includes('value="brand"') &&
    logoEditor.includes('value="custom"') &&
    logoEditor.includes("siteBrandLogoSupportsRecolor") &&
    logoEditor.includes("disabled={!supportsRecolor}") &&
    !logoEditor.includes('name="logo-color-mode-ui"'),
  "El modo de color debe usar un único grupo canónico y bloquear recolor para raster."
);

assert(
  logoEditor.includes("const uploadLock = useRef(false)") &&
    logoEditor.includes("if (uploadLock.current) return") &&
    logoEditor.includes("uploadLock.current = true") &&
    logoEditor.includes("uploadLock.current = false") &&
    logoEditor.includes('closest("form")') &&
    logoEditor.includes("if (!uploadLock.current) return") &&
    logoEditor.includes('form.addEventListener("submit", blockSubmit)') &&
    logoEditor.includes('form.removeEventListener("submit", blockSubmit)') &&
    logoEditor.includes("disabled={uploading}") &&
    !logoEditor.includes("querySelectorAll<"),
  "Logo debe serializar uploads y bloquear el submit padre desde un listener estable, sin depender del timing de estado React ni manipular botones por querySelector."
);

assert(
  logoEditor.includes("hidden") &&
    logoEditor.includes('aria-label="Archivo de imagen del logo"') &&
    logoEditor.includes(".svg,.png,.jpg,.jpeg,.webp,.gif") &&
    logoEditor.includes("no se conserva su nombre original") &&
    logoEditor.includes("EXIF/XMP") &&
    logoEditorStyles.includes(".editor .fileInput") &&
    logoEditorStyles.includes("width: 44px") &&
    logoEditorStyles.includes("height: 44px"),
  "El selector multiformato debe seguir fuera del layout visible, ser accesible y explicar el saneamiento de privacidad."
);

assert(
  logoUploadRoute.includes("authorizeAdminMediaRequest") &&
    logoUploadRoute.includes("hasExactAdminMediaFormFields") &&
    logoUploadRoute.includes("expectedRevision") &&
    logoUploadRoute.includes("item.revision !== revision.data") &&
    logoUploadRoute.includes("storeSiteBrandLogo") &&
    logoUploadRoute.includes("format: upload.format") &&
    !logoUploadRoute.includes("logo.name"),
  "La carga del logo debe exigir sesión Admin, formulario exacto y revisión optimista sin persistir ni devolver el nombre original."
);

assert(
  logoStorage.includes("sanitizePrivacySafeSiteBrandLogoSvg") &&
    logoStorage.includes("inspectPrivacySafeSiteBrandLogoSvg") &&
    logoStorage.includes("sanitizeSiteBrandLogoRaster") &&
    logoStorage.includes("inspectSafeSiteBrandLogoRaster") &&
    logoStorage.includes('flag: "wx"') &&
    logoStorage.includes("raster.inspection.digest") &&
    logoStorage.includes("storeSiteBrandLogo") &&
    safeSvg.includes("hasScalableViewBox") &&
    safeSvg.includes("forbiddenSiteBrandElements"),
  "El logo debe guardarse saneado, content-addressed e inmutable tanto para SVG como para raster."
);

assert(
  privacySafeSvg.includes("sanitizeSiteBrandLogoEmbeddedRasters") &&
    privacySafeSvg.includes("sanitizeSiteBrandLogoRaster") &&
    privacySafeSvg.includes("stripNonVisualSiteBrandSvgMetadata") &&
    privacySafeSvg.includes("return sanitizeSiteBrandLogoSvg(output)") &&
    privacySafeSvg.includes("withoutNonVisualMetadata.equals(input)") &&
    privacySafeSvg.includes("normalizedRasters.equals(input)"),
  "Los raster embebidos dentro de SVG deben cruzar la misma frontera de privacidad, recanonizar el documento y permanecer estables al releerlo."
);

assert(
  safeRaster.includes('"png"') &&
    safeRaster.includes('"jpg"') &&
    safeRaster.includes('"webp"') &&
    safeRaster.includes('"gif"') &&
    safeRaster.includes("sanitizeEditorialWebp") &&
    safeRaster.includes("processPng") &&
    safeRaster.includes("processJpeg") &&
    safeRaster.includes("processGif") &&
    safeRaster.includes("marker >= 0xe0") &&
    safeRaster.includes('label === 0xfe') &&
    safeRaster.includes('"tRNS"') &&
    !safeRaster.includes('"tEXt"'),
  "El raster del logo debe aceptar sólo formatos explícitos y eliminar metadata/perfiles/comentarios."
);

assert(
  editorialMedia.includes("webm|png|jpg|gif") &&
    logoReader.includes("resolveEditorialMediaDiskPath") &&
    logoReader.includes("inspectPrivacySafeSiteBrandLogoSvg") &&
    logoReader.includes("inspectSafeSiteBrandLogoRaster") &&
    logoReader.includes("inspection.digest !== expectedDigest") &&
    logoReader.includes("siteBrandRasterContentType") &&
    !logoReader.includes("rasterColorizedSvgDataUri"),
  "La lectura debe revalidar formato, seguridad y hash, y los raster no deben recolorearse server-side."
);

assert(
  publicMediaRoute.includes("const isSiteLogoAsset = slug === SITE_BRAND_LOGO_SLUG") &&
    publicMediaRoute.includes("logoRasterFormat") &&
    publicMediaRoute.includes("inspectPrivacySafeSiteBrandLogoSvg") &&
    publicMediaRoute.includes("inspectSafeSiteBrandLogoRaster") &&
    publicMediaRoute.includes("siteBrandRasterContentType") &&
    publicMediaRoute.includes("!isSvg && !isWebm && !isWebp && !isSiteLogoAsset") &&
    publicMediaRoute.includes("safe.digest !== expectedDigest") &&
    publicMediaRoute.includes("resolveEditorialMediaServingAccess") &&
    publicMediaRoute.includes('servingAccess === "admin"') &&
    publicMediaRoute.includes('"private, no-store, max-age=0"') &&
    publicMediaRoute.includes('"public, max-age=31536000, immutable"') &&
    publicMediaRoute.includes("Content-Security-Policy") &&
    publicMediaRoute.includes("img-src data:") &&
    publicMediaRoute.includes("style-src 'unsafe-inline'") &&
    publicMediaRoute.includes("sandbox") &&
    mediaServing.includes('"site_config"') &&
    mediaServing.includes("site.logoAsset") &&
    mediaServing.includes("PUBLIC_EXPOSURE_PUBLICATION_SQL") &&
    mediaServing.includes("wasEverPublished"),
  "El namespace del logo debe validar SVG/raster por contenido y usar la frontera multimedia compartida: draft privado, publicación histórica pública e inmutable."
);

const globalSecurityHeadersIndex =
  nextConfig.indexOf('source: "/(.*)"');
const editorialMediaHeadersIndex =
  nextConfig.indexOf('source: "/media/editorial/:path*"');

assert(
  nextConfig.includes("editorialMediaContentSecurityPolicy") &&
    nextConfig.includes(
      '"default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; sandbox"'
    ) &&
    globalSecurityHeadersIndex >= 0 &&
    editorialMediaHeadersIndex > globalSecurityHeadersIndex,
  "La CSP aislada de multimedia editorial debe declararse después de la regla global."
);

assert(
  publicConfig.includes("logoColorMode: SiteLogoColorMode") &&
    publicConfig.includes("logoCustomColor: string") &&
    publicConfig.includes("...sourceFallback()") &&
    rootLayout.includes("resolveSiteLogoColor(config)") &&
    rootLayout.includes("readStoredSiteBrandLogo(config.logoAsset)") &&
    rootLayout.includes("resolveSiteLogoColorMode") &&
    rootLayout.includes('data-site-logo={logoAsset ? "custom" : "default"}') &&
    rootLayout.includes('data-site-logo-color-mode={logoColorMode}') &&
    rootLayout.includes('"--site-logo-image"'),
  "La web pública debe leer sólo el snapshot publicado, normalizar el modo efectivo y caer al símbolo fuente si el asset deja de ser válido."
);

assert(
  logoRenderer.includes("isSiteBrandLogoAsset") &&
    logoRenderer.includes("resolveSiteLogoColorMode") &&
    logoRenderer.includes("effectiveColorMode") &&
    logoRenderer.includes("data-logo-override") &&
    logoRenderer.includes("data-logo-color-mode") &&
    logoStyles.includes("mask-image") &&
    logoStyles.includes("background-image") &&
    logoStyles.includes('data-site-logo-color-mode="original"'),
  "SiteLogoMark debe ser la autoridad de render web y forzar original para raster aunque un consumidor pase otro modo."
);

assert(
  siteBrand.includes("<SiteLogoMark") &&
    headerClient.includes("<SiteBrand") &&
    footer.includes("<SiteLogoMark") &&
    accountDashboard.includes("<SiteBrand") &&
    adminShell.includes("<SiteLogoMark"),
  "Header, Footer, Mi DeUna autenticado y Admin protegido deben converger en SiteBrand/SiteLogoMark."
);

assert(
  identityPreview.includes("effectiveLogoColorMode") &&
    identityPreview.includes("siteBrandLogoSupportsRecolor") &&
    identityPreview.includes("Colores raster") &&
    appearanceWorkspace.includes('name="logoAsset"') &&
    appearanceWorkspace.includes('name="logoColorMode"') &&
    appearanceWorkspace.includes("effectiveLogoColorMode") &&
    appearanceWorkspace.includes("Colores raster"),
  "Preview de Identidad y Apariencia deben reflejar el modo efectivo real del asset raster o SVG."
);

assert(
  appearanceWorkspace.includes("brandColor={brandColor}") &&
    !appearanceWorkspace.includes("brandColor={initialBrandColor}"),
  "Fondos debe previsualizar el color de marca actualmente editado, no el valor inicial guardado."
);

const socialImageBindsDataUri =
  socialImage.includes("logoDataUri") &&
  (
    socialImage.includes("src={logoDataUri}") ||
    socialImage.includes("src: logoDataUri")
  );

assert(
  siteLogoImage.includes("buildSiteBrandLogoDataUri") &&
    siteLogoImage.includes("resolveSiteLogoColor(identity)") &&
    siteLogoImage.includes("resolveSiteLogoColorMode") &&
    siteLogoImage.includes('colorMode === "original" ? null : color') &&
    socialImage.includes("resolveSiteLogoImage") &&
    socialImageBindsDataUri &&
    !socialImage.includes("SiteLogoMark"),
  "Open Graph/Twitter deben reutilizar el resolver server-side del asset publicado y respetar raster original."
);

if (failures.length > 0) {
  console.error("\nLogo global de marca: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Logo global de marca: OK (SVG/PNG/JPEG/WebP/GIF saneados, privacidad, publicación histórica, renderer único, app-icons y salida social coherentes)."
  );
}
