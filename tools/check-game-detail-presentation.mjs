import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

const source = (relativePath) =>
  readFile(path.join(root, relativePath), "utf8");

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const [
  presentation,
  publicPage,
  previewPage,
  previewCss,
  gameHeroDestinationPreview,
  homeHeroLivePreview,
  homeHeroRenderer,
  gameFinder,
] = await Promise.all([
  source("src/lib/games/game-detail-presentation.ts"),
  source("src/app/juegos/[slug]/page.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.module.css"),
  source("src/components/admin/GameHeroDestinationPreview.tsx"),
  source("src/components/admin/HomeHeroLivePreview.tsx"),
  source("src/components/home/HeroSection.tsx"),
  source("src/features/game-finder/GameFinderClient.tsx"),
]);

assert(
  presentation.includes("resolveGameDownload(game)") &&
    presentation.includes("requirements?.minimum ??") &&
    presentation.includes("requirements?.recommended") &&
    presentation.includes('label: "Sistema operativo"') &&
    presentation.includes('label: "Procesador"') &&
    presentation.includes('label: "Memoria RAM"') &&
    presentation.includes('label: "Gráficos"') &&
    presentation.includes('label: "Almacenamiento"') &&
    presentation.includes(".slice(0, 2)") &&
    presentation.includes(".filter((tag) => tag !== game.category)") &&
    presentation.includes('system === "CLASSIND"') &&
    presentation.includes('system === "OTHER"') &&
    presentation.includes("resolveGameReleases(game)") &&
    presentation.includes("releases.find(") &&
    presentation.includes("game.version ??") &&
    presentation.includes("recommended?.storage"),
  "La presentación compartida debe resolver descarga, requisitos, taxonomía, clasificación etaria, versión y almacenamiento."
);

for (const [label, page] of [
  ["ficha pública", publicPage],
  ["Vista previa", previewPage],
]) {
  assert(
    page.includes(
      'resolveGameDetailPresentation'
    ) &&
      page.includes(
        "resolveGameDetailPresentation(game)"
      ) &&
      !page.includes("function buildRequirementRows(") &&
      !page.includes("function legacyRequirements(") &&
      !page.includes("function legacyMinimum(") &&
      !page.includes("resolveGameDownload(game)"),
    `${label} debe consumir la presentación compartida sin reconstruir requisitos ni descargas.`
  );
}

assert(
  previewPage.includes(
    'import GameHeroDestinationPreview from "@/components/admin/GameHeroDestinationPreview"'
  ) &&
    previewPage.includes("buildHomeGameCollections") &&
    previewPage.includes("getPublicHomeConfig") &&
    previewPage.includes('data-game-hero-public-preview="true"') &&
    previewPage.includes("<GameHeroDestinationPreview") &&
    !previewPage.includes("<HomeHeroLivePreview") &&
    gameHeroDestinationPreview.includes(
      'import HomeHeroLivePreview from "@/components/admin/HomeHeroLivePreview"'
    ) &&
    gameHeroDestinationPreview.includes("useSyncExternalStore") &&
    gameHeroDestinationPreview.includes("homeHeroDeviceForWidth") &&
    gameHeroDestinationPreview.includes(
      '{ value: "desktop", label: "Escritorio" }'
    ) &&
    gameHeroDestinationPreview.includes(
      '{ value: "tablet", label: "Tableta" }'
    ) &&
    gameHeroDestinationPreview.includes(
      '{ value: "mobile", label: "Móvil" }'
    ) &&
    gameHeroDestinationPreview.includes(
      'data-game-hero-responsive-preview="true"'
    ) &&
    gameHeroDestinationPreview.includes(
      "data-hero-preview-device-option={option.value}"
    ) &&
    gameHeroDestinationPreview.includes(
      "data-hero-preview-device={device}"
    ) &&
    gameHeroDestinationPreview.includes("<HomeHeroLivePreview") &&
    gameHeroDestinationPreview.includes("playing={false}") &&
    gameHeroDestinationPreview.includes("showToolbar={false}") &&
    homeHeroLivePreview.includes(
      'import HeroSection from "@/components/home/HeroSection"'
    ) &&
    homeHeroLivePreview.includes("<HeroSection") &&
    homeHeroLivePreview.includes("showToolbar = true") &&
    homeHeroRenderer.includes(
      'resolveGameDestinationMediaMode(activeGame, "hero")'
    ) &&
    homeHeroRenderer.includes("<HeroVideoLayer"),
  "Vista previa debe validar Hero 3:1 con el renderer público real y un selector compacto que conserve escritorio, tableta y móvil sin duplicar su lógica."
);

assert(
  gameFinder.includes('resolveGameDetailPresentation') &&
    gameFinder.includes('resolveGameDetailPresentation(selectedGame).sizeLabel') &&
    gameFinder.includes('<dt>Espacio requerido</dt>') &&
    !gameFinder.includes("getPerformanceProfile(") &&
    gameFinder.includes("game.performance !== undefined"),
  "Finder debe mostrar almacenamiento desde la misma presentación editorial publicada y no desde perfiles FPS históricos."
);

assert(
  publicPage.includes("<dd>{genreSummaryLabel}</dd>") &&
    publicPage.includes("<dd>{versionLabel}</dd>") &&
    publicPage.includes("<dd>{sizeLabel}</dd>") &&
    publicPage.includes("contentRating: ageRatingLabel ?? undefined"),
  "La ficha pública debe usar las etiquetas canónicas también en resumen y metadata."
);

const factStart = previewPage.indexOf(
  'className={styles.factGrid}'
);
const factEnd = factStart >= 0
  ? previewPage.indexOf("</dl>", factStart)
  : -1;
const factBlock =
  factStart >= 0 && factEnd >= 0
    ? previewPage.slice(factStart, factEnd)
    : "";

assert(
  previewPage.includes(
    '<dl\n        className={styles.factGrid}'
  ) &&
    factBlock.includes("<span>Género</span>") &&
    factBlock.includes("<span>Plataforma</span>") &&
    factBlock.includes("<span>Versión</span>") &&
    factBlock.includes("<span>Almacenamiento</span>") &&
    !factBlock.includes("Fuentes visibles") &&
    !factBlock.includes("<dt>Canal</dt>") &&
    previewPage.includes(
      '{ageRatingLabel ?? "Sin definir"}'
    ),
  "Vista previa debe reflejar los cuatro datos públicos canónicos y la misma clasificación etaria."
);

assert(
  previewCss.includes(".factGrid > div") &&
    previewCss.includes(".factGrid dt") &&
    previewCss.includes(".factGrid dt span") &&
    previewCss.includes(".factGrid dd") &&
    !previewCss.includes(".factGrid article"),
  "El resumen de Vista previa debe conservar semántica dl/dt/dd sin estilos heredados de tarjetas article."
);

if (failures.length) {
  console.error(
    "\nPresentación compartida de ficha: REGRESIÓN\n"
  );
  failures.forEach((failure) =>
    console.error(`- ${failure}`)
  );
  process.exit(1);
}

console.log(
  "Presentación compartida de ficha: OK (Preview y web comparten presentación; Hero 3:1 usa el renderer público real con selector de escritorio, tableta y móvil)."
);
