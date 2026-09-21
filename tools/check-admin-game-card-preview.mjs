import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const source = (relativePath) =>
  readFile(path.join(root, relativePath), "utf8");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const has = (text, ...needles) =>
  needles.every((needle) => text.includes(needle));

const [
  previewPage,
  previewCss,
  heroFrame,
  coverRenderer,
  catalog,
] = await Promise.all([
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.module.css"),
  source("src/components/games/GameDetailHeroFrame.tsx"),
  source("src/components/ui/GameCoverMedia.tsx"),
  source("src/components/games/GameCatalogClient.tsx"),
]);

assert(
  has(
    previewPage,
    'import GameDetailHeroFrame from "@/components/games/GameDetailHeroFrame"',
    'import UniversalGameCardBase from "@/components/ui/UniversalGameCardBase"',
    'const game = item.payload',
    '<GameDetailHeroFrame',
    'game={game}',
    '<UniversalGameCardBase',
    'variant="standard"',
    'CARD PÚBLICA · BORRADOR',
    'mismo renderer base que usan las Cards públicas',
    'snapshot publicado'
  ) &&
    has(
      heroFrame,
      'import GameCoverMedia from "@/components/ui/GameCoverMedia"',
      "<GameCoverMedia",
      "game={game}"
    ),
  "La vista previa Admin debe montar el borrador en los renderers canónicos de Hero/Portada y Card y explicar la frontera draft/público."
);

assert(
  !previewPage.includes('src={game.coverImage}\n') &&
    !previewPage.includes("<GameCoverMedia") &&
    has(
      coverRenderer,
      "resolveGameCoverImage(game)",
      'aspectRatio: "4 / 5"',
      "<GameMedia",
      "viewport={game.imageMedia?.cover}"
    ) &&
    has(previewCss, ".cardPreviewFrame"),
  "La Portada de Vista previa debe delegarse al renderer canónico 4:5 sin volver a dibujarse ni duplicar su geometría local."
);

assert(
  has(
    catalog,
    'import UniversalGameCard from "@/components/ui/UniversalGameCard"',
    '<UniversalGameCard',
    'game={game}',
    'variant="standard"'
  ),
  "El catálogo público debe conservar la misma variante estándar que previsualiza el Admin."
);

if (failures.length) {
  console.error("\nAdmin game Card preview: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Admin game Card preview: OK (borrador -> Hero/Portada canónicos + UniversalGameCardBase estándar; crop 4:5 y snapshot público separados)."
);
