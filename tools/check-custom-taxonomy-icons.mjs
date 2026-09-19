import {
  readFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  inspectSafeTaxonomySvgIcon,
  sanitizeTaxonomySvgIcon,
} from "../src/lib/media/safe-svg-icon.ts";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [
  validation,
  validationCore,
  editor,
  presentation,
  taxonomyIcon,
  uploadRoute,
  uploadStorage,
  taxonomyPolicy,
  publicMediaRoute,
  mediaServing,
  homeClassifications,
  catalogClient,
] = await Promise.all([
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/admin/content-validation-core.ts"),
  source("src/components/admin/GameTaxonomyEditor.tsx"),
  source("src/lib/games/taxonomy-presentation.ts"),
  source("src/components/taxonomy/TaxonomyIcon.tsx"),
  source("src/app/api/admin/content/catalogs/icon-upload/route.ts"),
  source("src/lib/media/taxonomy-icon-upload.ts"),
  source("src/lib/media/taxonomy-icon-policy.ts"),
  source("src/app/media/editorial/[slug]/[filename]/route.ts"),
  source("src/lib/media/editorial-media-serving.ts"),
  source("src/components/home/FeaturedCategories.tsx"),
  source("src/components/games/GameCatalogClient.tsx"),
]);

const completeValidation = `${validation}\n${validationCore}`;

const simpleSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h16" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  "utf8"
);
const sanitizedSimple = sanitizeTaxonomySvgIcon(simpleSvg);

assert(
  sanitizedSimple !== null &&
    inspectSafeTaxonomySvgIcon(sanitizedSimple) !== null,
  "Un SVG geométrico simple debe poder normalizarse y validarse como icono."
);

for (const unsafe of [
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" onclick="alert(1)"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>html</div></foreignObject></svg>',
]) {
  assert(
    sanitizeTaxonomySvgIcon(Buffer.from(unsafe, "utf8")) === null,
    "El saneador SVG debe rechazar scripts, eventos, recursos externos y HTML embebido."
  );
}

assert(
  completeValidation.includes("iconAsset: taxonomyIconAssetSchema.optional()") &&
    completeValidation.includes("taxonomyIconAssetPattern") &&
    completeValidation.includes("iconAsset: existing.iconAsset ?? term.iconAsset") &&
    taxonomyPolicy.includes('TAXONOMY_ICON_SLUG = "taxonomy-icons"') &&
    taxonomyPolicy.includes("taxonomyIconAssetPattern") &&
    taxonomyPolicy.includes("(?:svg|webp)"),
  "La taxonomía debe aceptar sólo assets SVG/WebP hashados mediante la policy compartida y conservarlos al migrar datos heredados."
);

assert(
  editor.includes("/api/admin/content/catalogs/icon-upload") &&
    editor.includes('accept=".svg,.webp,image/svg+xml,image/webp"') &&
    editor.includes("iconAsset: payload.publicPath") &&
    editor.includes("asset={term.iconAsset}") &&
    editor.includes("Usar biblioteca") &&
    editor.includes("Guardar clasificaciones"),
  "El panel debe permitir subir/reemplazar iconos propios, previsualizarlos con color y mantener el guardado editorial explícito."
);

assert(
  editor.includes("const uploadLock = useRef(false)") &&
    editor.includes("if (uploadLock.current)") &&
    editor.includes("uploadLock.current = true") &&
    editor.includes("uploadLock.current = false") &&
    editor.includes("onSubmit={preventSubmitDuringUpload}") &&
    editor.includes("disabled={uploadBusy}") &&
    editor.includes("disabled={uploadBusy || used > 0}") &&
    editor.includes("disabled={uploadBusy || Boolean(normalizedQuery) || index === 0}") &&
    editor.includes('aria-busy={uploadBusy}'),
  "Taxonomía debe serializar uploads de iconos, congelar mutaciones editoriales y bloquear cualquier guardado mientras el asset todavía no quedó incorporado al estado local."
);

assert(
  presentation.includes("customTaxonomyIconPattern") &&
    presentation.includes("iconAsset") &&
    taxonomyIcon.includes("maskImage") &&
    taxonomyIcon.includes("WebkitMaskImage") &&
    taxonomyIcon.includes("--taxonomy-accent"),
  "La presentación pública debe validar el asset y colorearlo mediante máscara CSS con el mismo acento de taxonomía."
);

assert(
  uploadRoute.includes("authorizeAdminMediaRequest") &&
    uploadRoute.includes("hasExactAdminMediaFormFields") &&
    uploadRoute.includes("expectedRevision") &&
    uploadRoute.includes("storeTaxonomyIcon") &&
    uploadStorage.includes("sanitizeTaxonomySvgIcon") &&
    uploadStorage.includes("sanitizeEditorialWebp") &&
    uploadStorage.includes("inspection.hasAlpha") &&
    uploadStorage.includes('flag: "wx"'),
  "La carga de iconos debe permanecer autenticada, concurrente, saneada, hashada y exigir transparencia en WebP."
);

assert(
  publicMediaRoute.includes("TAXONOMY_ICON_MEDIA_SLUG") &&
    publicMediaRoute.includes("const isTaxonomyAsset") &&
    publicMediaRoute.includes("const isRestrictedImageNamespace") &&
    publicMediaRoute.includes("isTaxonomyAsset || isSiteLogoAsset") &&
    publicMediaRoute.includes("(isSvg && !isRestrictedImageNamespace)") &&
    publicMediaRoute.includes("(isWebm && isRestrictedImageNamespace)") &&
    publicMediaRoute.includes("(isTaxonomyAsset && !isSvg && !isWebp)") &&
    publicMediaRoute.includes("inspectSafeTaxonomySvgIcon") &&
    publicMediaRoute.includes("Content-Security-Policy") &&
    publicMediaRoute.includes('"Content-Type": "image/svg+xml; charset=utf-8"') &&
    publicMediaRoute.includes("resolveEditorialMediaServingAccess") &&
    mediaServing.includes('"game_taxonomy"') &&
    mediaServing.includes("taxonomy.classifications") &&
    mediaServing.includes("taxonomy.tags") &&
    mediaServing.includes("resolveAdminSession"),
  "Taxonomía debe seguir limitada a SVG/WebP y usar la frontera compartida publicación/preview Admin aunque el namespace del logo admita raster adicionales."
);

assert(
  homeClassifications.includes("asset={visual.iconAsset}") &&
    catalogClient.includes("asset={visual.iconAsset}"),
  "Inicio y Juegos deben mostrar el mismo icono propio publicado."
);

if (failures.length > 0) {
  console.error("\nIconos personalizados de taxonomía: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Iconos personalizados de taxonomía: OK (SVG/WebP seguro, recolor por máscara, borrador privado/publicación y superficies públicas compartidas)."
  );
}
