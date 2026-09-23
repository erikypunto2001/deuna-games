import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const [
  presentation,
  page,
  downloadPage,
  updatePage,
  requirementsPage,
  compatibilityCard,
] = await Promise.all([
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
    path.join(root, "src", "app", "juegos", "[slug]", "GameCompatibilityCard.tsx"),
    "utf8"
  ),
]);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(
  presentation.includes("const platforms = game.platforms ?? [];") &&
    presentation.includes("const platformLabel = platforms.length") &&
    presentation.includes(': "A confirmar";') &&
    page.includes("resolveGameDetailPresentation(game)") &&
    page.includes("platforms,") &&
    page.includes("platformLabel,"),
  "La presentación compartida y la ficha pública deben tratar una plataforma ausente como dato pendiente, no inferir una plataforma."
);

assert(
  page.includes("gamePlatform: platforms.length ? platforms : undefined"),
  "JSON-LD debe omitir gamePlatform cuando no existe una plataforma publicada."
);

assert(
  (page.match(/<dd>\{platformLabel\}<\/dd>/g) ?? []).length >= 2,
  "Las superficies visibles de Plataforma deben compartir el mismo fallback explícito."
);

assert(
  !/game\.platforms\?\.length[\s\S]{0,120}\[\s*["']PC["']\s*\]/.test(page) &&
    !/game\.platforms\?\.length[\s\S]{0,120}\[\s*["']PC["']\s*\]/.test(presentation) &&
    !/platformLabel[\s\S]{0,120}["']PC["']/.test(presentation),
  "La ficha pública y su presentación compartida no deben volver a asumir PC cuando Compatibilidad no publicó una plataforma."
);

assert(
  downloadPage.includes('game.platforms?.[0] ??\n    "A confirmar"') &&
    !/game\.platforms\?\.\[0\][\s\S]{0,80}["']PC["']/.test(downloadPage),
  "La página pública de descarga debe mostrar A confirmar y nunca asumir PC cuando falta plataforma."
);

assert(
  updatePage.includes('download?.platform ?? game.platforms?.[0] ?? ""') &&
    updatePage.includes('placeholder="A confirmar"') &&
    !updatePage.includes('defaultValue={download?.platform ?? "PC"}'),
  "Nueva versión debe partir de una plataforma publicada/confirmada o quedar vacía; nunca inventar PC."
);

assert(
  requirementsPage.includes('game.platforms?.includes("PC") === true') &&
    requirementsPage.includes("games={pcGames}") &&
    requirementsPage.includes("pcGames.flatMap") &&
    page.includes('platforms.includes("PC") && (') &&
    page.includes('supportsPc={platforms.includes("PC")}') &&
    compatibilityCard.includes("supportsPc: boolean") &&
    compatibilityCard.includes("no tiene PC entre sus plataformas publicadas"),
  "El Finder y la ficha no deben calcular ni presentar FPS de PC para juegos cuya plataforma PC no esté publicada explícitamente."
);

if (failures.length > 0) {
  console.error("\nPlataformas públicas: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Plataformas públicas: OK (ficha, Descargas y Nueva versión sin PC supuesto; UI pendiente y JSON-LD omitido cuando falta el dato)."
  );
}
