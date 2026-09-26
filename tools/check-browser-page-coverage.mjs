import {
  readdir,
} from "node:fs/promises";
import path from "node:path";

import {
  adminLoginVisualPage,
  adminVisualPages,
  coveredPageRoutePatterns,
  publicVisualPages,
  redirectChecks,
  representativeCollectionSlug,
  representativeGameSlug,
  representativeSoftwareSlug,
  representativeUpdateId,
} from "./browser-page-manifest.mjs";

const appRoot = path.resolve("src/app");

async function collectPageFiles(directory = appRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectPageFiles(absolute));
      continue;
    }
    if (entry.isFile() && entry.name === "page.tsx") {
      files.push(absolute);
    }
  }

  return files;
}

function routePatternForFile(file) {
  const relativeDirectory = path.relative(
    appRoot,
    path.dirname(file)
  );
  const segments = relativeDirectory
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));

  return segments.length ? `/${segments.join("/")}` : "/";
}

function scenarioPattern(pathname) {
  const route = pathname.split("?", 1)[0] || "/";
  return route
    .replace(
      `/${representativeGameSlug}`,
      "/[slug]"
    )
    .replace(
      `/${representativeSoftwareSlug}`,
      "/[slug]"
    )
    .replace(
      `/${representativeCollectionSlug}`,
      "/[slug]"
    )
    .replace(
      `/${representativeUpdateId}`,
      "/[id]"
    );
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

const pageFiles = await collectPageFiles();
const discovered = pageFiles
  .map(routePatternForFile)
  .sort();
const declared = [...coveredPageRoutePatterns].sort();
const missingFromManifest = discovered.filter(
  (route) => !declared.includes(route)
);
const staleManifestEntries = declared.filter(
  (route) => !discovered.includes(route)
);
const manifestDuplicates = duplicates(coveredPageRoutePatterns);

const visualScenarios = [
  ...publicVisualPages,
  adminLoginVisualPage,
  ...adminVisualPages,
];
const visualIds = visualScenarios.map((page) => page.id);
const visualIdDuplicates = duplicates(visualIds);
const directlyCoveredPatterns = new Set(
  visualScenarios.map((page) => scenarioPattern(page.pathname))
);
const redirectPatterns = new Set(
  redirectChecks.map((check) => scenarioPattern(check.pathname))
);

// Download is data-dependent: it may render or redirect depending on the
// published snapshot. Historical update drafts use a dedicated visual fixture
// and therefore must remain directly represented in adminVisualPages.
const dynamicSweepPatterns = new Set([
  "/juegos/[slug]/descargar",
]);

const scenarioCovered = discovered.filter(
  (route) =>
    directlyCoveredPatterns.has(route) ||
    redirectPatterns.has(route) ||
    dynamicSweepPatterns.has(route)
);
const withoutBrowserScenario = discovered.filter(
  (route) => !scenarioCovered.includes(route)
);

const failures = [];
if (missingFromManifest.length) {
  failures.push(
    `Rutas page.tsx sin declarar: ${missingFromManifest.join(", ")}`
  );
}
if (staleManifestEntries.length) {
  failures.push(
    `Rutas declaradas que ya no existen: ${staleManifestEntries.join(", ")}`
  );
}
if (manifestDuplicates.length) {
  failures.push(
    `Rutas duplicadas en manifest: ${manifestDuplicates.join(", ")}`
  );
}
if (visualIdDuplicates.length) {
  failures.push(
    `IDs visuales duplicados: ${visualIdDuplicates.join(", ")}`
  );
}
if (withoutBrowserScenario.length) {
  failures.push(
    `Rutas sin escenario browser: ${withoutBrowserScenario.join(", ")}`
  );
}

if (failures.length) {
  console.error("\nCobertura browser de páginas: BLOQUEADA\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Cobertura browser de páginas: OK (${discovered.length} page.tsx; ${visualScenarios.length} estados visuales; ${redirectChecks.length} redirects; ${dynamicSweepPatterns.size} rutas dinámicas dependientes de datos).`
);
