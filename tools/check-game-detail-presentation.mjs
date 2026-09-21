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
  homeHeroLivePreview,
  homeHeroRenderer,
] = await Promise.all([
  source("src/lib/games/game-detail-presentation.ts"),
  source("src/app/juegos/[slug]/page.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.tsx"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.module.css"),
  source("src/components/admin/HomeHeroLivePreview.tsx"),
  source("src/components/home/HeroSection.tsx"),
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
    presentation.includes('versionLabel: game.version ?? "A confirmar"') &&
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
      !page.includes('from "@/lib/games/download"'),
    `${label} debe consumir la presentación compartida sin reconstruir requisitos ni descargas.`
  );
}

assert(
  previewPage.includes(
    'import HomeHeroLivePreview from "@/components/admin/HomeHeroLivePreview"'
  ) &&
    previewPage.includes("buildHomeGameCollections") &&
    previewPage.includes("getPublicHomeConfig") &&
    previewPage.includes('data-game-hero-public-preview="true"') &&
    (previewPage.match(/<HomeHeroLivePreview/g) ?? []).length === 3 &&
    previewPage.includes('device="desktop"') &&
    previewPage.includes('device="tablet"') &&
    previewPage.includes('device="mobile"') &&
    previewPage.includes("playing={false}") &&
    previewPage.includes("showToolbar={false}") &&
    homeHeroLivePreview.includes(
      'import HeroSection from "@/components/home/HeroSection"'
    ) &&
    homeHeroLivePreview.includes("<HeroSection") &&
    homeHeroLivePreview.includes("showToolbar = true") &&
    homeHeroRenderer.includes(
      'resolveGameDestinationMediaMode(activeGame, "hero")'
    ) &&
    homeHeroRenderer.includes("<HeroVideoLayer"),
  "Vista previa debe validar Hero 3:1 con el renderer público real, el contexto público efectivo y los tres viewports sin duplicar su lógica."
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
  "Presentación compartida de ficha: OK (Preview y web comparten presentación; Hero 3:1 usa el renderer público real en escritorio, tableta y móvil)."
);
