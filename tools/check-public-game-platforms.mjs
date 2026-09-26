import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const [
  releases,
  presentation,
  page,
  downloadPage,
  updatePage,
  requirementsPage,
  performanceRoute,
  compatibilityCard,
] = await Promise.all([
  readFile(
    path.join(root, "src", "lib", "games", "releases.ts"),
    "utf8"
  ),
  readFile(
    path.join(root, "src", "lib", "games", "game-detail-presentation.ts"),
    "utf8"
  ),
  readFile(
    path.join(root, "src", "app", "juegos", "[slug]", "page.tsx"),
    "utf8"
  ),
  readFile(
    path.join(root, "src", "app", "juegos", "[slug]", "descargar", "page.tsx"),
    "utf8"
  ),
  readFile(
    path.join(
      root,
      "src",
      "app",
      "admin",
      "(protected)",
      "juegos",
      "[slug]",
      "actualizacion",
      "page.tsx"
    ),
    "utf8"
  ),
  readFile(
    path.join(root, "src", "app", "requisitos", "page.tsx"),
    "utf8"
  ),
  readFile(
    path.join(root, "src", "app", "api", "games", "[slug]", "performance", "route.ts"),
    "utf8"
  ),
  readFile(
    path.join(root, "src", "app", "juegos", "[slug]", "GameCompatibilityCard.tsx"),
    "utf8"
  ),
]);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(
  releases.includes("const platformIds = (") &&
    releases.includes("game.platforms ?? []") &&
    releases.includes("return platformIds.map(") &&
    !releases.includes('["pc-windows"]') &&
    presentation.includes("gamePlatformIds(game)") &&
    presentation.includes('"A confirmar"'),
  "Las plataformas legacy deben derivarse sólo de datos explícitos; requisitos/FPS/descarga nunca deben inventar PC."
);

assert(
  page.includes("platformIds.map(") &&
    page.includes("platformNames.length") &&
    page.includes("platforms.length") &&
    page.includes(": undefined") &&
    page.includes("gamePlatform:"),
  "JSON-LD debe omitir gamePlatform cuando no existe ninguna plataforma publicada."
);

assert(
  presentation.includes("const pcRelease = resolvePcRelease(game)") &&
    presentation.includes("const requirements =") &&
    presentation.includes("pcRelease?.requirements") &&
    !presentation.includes("pcRelease?.requirements ??\n    game.requirements"),
  "La ficha sólo debe mostrar requisitos de PC cuando existe un release PC explícito o legacy respaldado por platforms."
);

assert(
  downloadPage.includes("resolveGameReleaseDownload") &&
    downloadPage.includes("releaseId") &&
    downloadPage.includes("packageId") &&
    /releaseId[\s\S]{0,260}resolveGameReleaseDownload/.test(downloadPage) &&
    !/releaseId[\s\S]{0,500}["']PC["']/.test(downloadPage),
  "La descarga por release debe respetar la plataforma solicitada y no caer silenciosamente a PC."
);

assert(
  updatePage.includes("resolveGameReleases") &&
    updatePage.includes("selectedRelease") &&
    updatePage.includes("release.platformId") &&
    !updatePage.includes('defaultValue={download?.platform ?? "PC"}'),
  "Nueva versión debe operar sobre un release existente y nunca inventar PC."
);

assert(
  requirementsPage.includes("resolvePcRelease") &&
    requirementsPage.includes("games.filter(") &&
    requirementsPage.includes("Boolean(") &&
    requirementsPage.includes("games={pcGames}") &&
    requirementsPage.includes("pcGames.flatMap"),
  "El Finder debe incluir únicamente juegos con release PC explícito/resuelto."
);

assert(
  page.includes("pcRelease") &&
    page.includes("supportsPc={Boolean(pcRelease)}") &&
    compatibilityCard.includes("supportsPc: boolean") &&
    compatibilityCard.includes("no tiene PC entre sus plataformas publicadas") &&
    performanceRoute.includes("resolvePcRelease") &&
    performanceRoute.includes("pcRelease?.performance") &&
    performanceRoute.includes("pcRelease?.performanceMetadata"),
  "Ficha y API de rendimiento deben calcular FPS sólo desde el release PC publicado."
);

if (failures.length > 0) {
  console.error("\nPlataformas públicas: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Plataformas públicas: OK (releases explícitos, sin PC inferido; Finder, requisitos, descargas y FPS respetan la plataforma publicada)."
  );
}
