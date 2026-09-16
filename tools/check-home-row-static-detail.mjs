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
const has = (text, ...needles) =>
  needles.every((needle) => text.includes(needle));

const [
  contract,
  validation,
  contentEditor,
  contentStyles,
  rowEditor,
  service,
  homePage,
  popular,
  recent,
  lowSpec,
  recommended,
  cardWrapper,
  cardBase,
  staticCss,
  hoverPreview,
  hoverPreviewCss,
  recoveryBrowserSmoke,
  workflowLayoutSmoke,
  visualRuntimeSmoke,
] = await Promise.all([
  source("src/lib/home/card-row-reveal.ts"),
  source("src/lib/admin/content-validation-core.ts"),
  source("src/components/admin/HomeContentEditor.tsx"),
  source("src/components/admin/HomeContentEditor.module.css"),
  source("src/components/admin/HomeRowRevealEditor.tsx"),
  source("src/lib/admin/home-content-service.ts"),
  source("src/app/page.tsx"),
  source("src/components/home/PopularGames.tsx"),
  source("src/components/home/RecentlyAdded.tsx"),
  source("src/components/home/GamesForYourPC.tsx"),
  source("src/components/home/RecommendedGames.tsx"),
  source("src/components/ui/UniversalGameCard.tsx"),
  source("src/components/ui/UniversalGameCardBase.tsx"),
  source("src/components/ui/UniversalGameCardStaticDetail.module.css"),
  source("src/components/ui/HoverPreviewMedia.tsx"),
  source("src/components/ui/HoverPreviewMedia.module.css"),
  source("tools/home-live-recovery-browser-smoke.mjs"),
  source("tools/home-content-workflow-layout-browser-smoke.mjs"),
  source("tools/card-video-visual-runtime-smoke.sh"),
]);

assert(
  has(
    contract,
    '"popular"',
    '"recent"',
    '"lowSpec"',
    '"recommended"',
    '"interaction"',
    '"static-detail"',
    "mergeHomeCardRevealModes"
  ),
  "El contrato de filas debe limitarse a las cuatro filas de juegos y conservar un fallback interaction."
);

assert(
  has(
    validation,
    "cardRevealMode: z.enum(homeCardRevealModes).optional()",
    "!isHomeGameRowSectionId(section.id)",
    "La visualización de Card sólo puede configurarse en filas de juegos."
  ),
  "El schema editorial debe aceptar el modo sólo en filas de juegos y rechazar su inyección en otras secciones."
);

assert(
  has(
    contentEditor,
    'input[name="rowRevealJson"]',
    "mergeRowRevealIntoPresentation",
    "cardRevealMode: rowReveal[section.id]",
    'body.set("presentationJson", mergedPresentation)',
    "<HomeRowRevealEditor",
    "presentationConfig"
  ),
  "Resto de Inicio debe ensamblar el reveal dentro de presentationJson sin crear un segundo guardado editorial."
);

assert(
  has(
    contentEditor,
    "const body = new URLSearchParams()",
    '"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"',
    'credentials: "same-origin"'
  ) && !contentEditor.includes("const body = new FormData()"),
  "El coordinador debe usar el transporte urlencoded aceptado por readTrustedAdminForm; multipart volvería a provocar un 403 sin reforzar seguridad."
);

const structureIndex = contentEditor.indexOf("<HomePresentationEditor");
const curationIndex = contentEditor.indexOf("<HomeCurationEditor");
const cardsIndex = contentEditor.indexOf("<HomeRowRevealEditor");
assert(
  structureIndex >= 0 &&
    curationIndex > structureIndex &&
    cardsIndex > curationIndex &&
    has(
      contentEditor,
      'id="home-content-structure"',
      'id="home-content-curation"',
      'id="home-content-cards"',
      "Estructura y textos",
      "Curaduría de juegos",
      "Visualización de Cards",
      "MutationObserver",
      "Guardar cambios"
    ) &&
    contentStyles.includes("position: sticky") &&
    contentStyles.includes('.root form button[type="submit"]'),
  "Resto de Inicio debe presentarse como un flujo único: estructura/textos → curaduría → Cards, con estado dirty coordinado y una sola acción visible de guardado."
);

assert(
  has(
    contentStyles,
    "grid-template-columns: repeat(3, minmax(0, 1fr))",
    "@media (max-width: 1120px)",
    "@media (max-width: 780px)",
    "white-space: normal",
    "text-overflow: clip",
    "overflow-wrap: anywhere"
  ) &&
    !contentStyles.includes("overflow-x: auto") &&
    !contentStyles.includes("min-width: max-content"),
  "La navegación del flujo debe mantener sus tres pasos dentro del ancho disponible en tablet/mobile, sin carrusel horizontal ni truncamiento por ellipsis."
);

assert(
  has(
    workflowLayoutSmoke,
    'name: "tablet", width: 1024, height: 900',
    'name: "mobile", width: 390, height: 844',
    "linksInside",
    "linksOverlap",
    "labelsClipped",
    "navOverflow",
    "pageOverflow",
    'display === "grid"',
    "sin scroll horizontal ni truncamiento"
  ) &&
    visualRuntimeSmoke.includes(
      "node ./tools/home-content-workflow-layout-browser-smoke.mjs"
    ),
  "El visual smoke debe medir el workflow real en tablet/mobile y fallar ante recorte, solapamiento u overflow horizontal."
);

assert(
  has(
    recoveryBrowserSmoke,
    "deuna:home-row-reveal-draft:latest",
    "testCoordinatedSave",
    "clickCoordinatedSave",
    "Guardar cambios",
    "estado",
    "guardado",
    "initialRevision + 1",
    "initialRevision + 2",
    "smoke guardado coordinado",
    "sin 403"
  ),
  "El smoke real de Admin debe limpiar todos los recoveries y ejercer guardar/restaurar la revisión coordinada desde el navegador autenticado."
);

assert(
  has(
    rowEditor,
    "deuna:home-row-reveal-draft:latest",
    "recoveryMatchesRevision",
    'data-home-editor-dirty={dirty ? "true" : "false"}',
    'name="rowRevealJson"',
    "Detalle visible",
    "sin ampliar, inclinar ni mover"
  ),
  "El editor de filas debe tener recovery por revisión, dirty tracking y explicar el contrato sin expansión."
);

assert(
  has(
    service,
    "mergeHomeCardRevealModes",
    "current.sections,",
    "input.sections",
    "presentation.sections"
  ),
  "Los guardados de Presentación y Resto de Inicio deben preservar modos cuando un cliente anterior no los envía."
);

assert(
  (homePage.match(/revealMode=\{resolveHomeCardRevealMode\(section\)\}/g) ?? [])
    .length === 4,
  "La Home pública debe resolver el modo publicado exactamente para las cuatro filas de UniversalGameCard."
);

for (const [label, component] of [
  ["popular", popular],
  ["recent", recent],
  ["lowSpec", lowSpec],
  ["recommended", recommended],
]) {
  assert(
    component.includes("revealMode") &&
      component.includes("<UniversalGameCard") &&
      component.includes("revealMode={revealMode}"),
    `La fila ${label} debe transportar revealMode al renderer canónico.`
  );
}

assert(
  has(
    cardWrapper,
    "revealMode = \"interaction\"",
    "revealMode={revealMode}"
  ),
  "UniversalGameCard debe conservar interaction como default y delegar el modo al renderer base."
);

assert(
  has(
    cardBase,
    'const staticDetail = revealMode === "static-detail"',
    "const [detailVisible, setDetailVisible] = useState(staticDetail)",
    "const detailPresented = detailVisible || directDetailVisible",
    "STATIC_DETAIL_VIDEO_THRESHOLD = 0.55",
    "new IntersectionObserver",
    "entry.intersectionRatio >= STATIC_DETAIL_VIDEO_THRESHOLD",
    "if (staticDetail) return;",
    "staticDetailInViewport",
    "unscaledVideo={staticDetail}",
    'data-card-reveal-mode={revealMode}'
  ),
  "El renderer debe revelar detalle desde el estado inicial, conservar el contrato touch, bloquear interacción expansiva y limitar video a Cards visibles."
);

assert(
  has(
    staticCss,
    ".staticDetailCard.staticDetailCard",
    "transform: none",
    "box-shadow: none",
    "filter: none !important"
  ),
  "El modo estático debe neutralizar transformaciones, zoom y acabado hover sin modificar la geometría base."
);

assert(
  has(
    hoverPreview,
    "unscaledVideo?: boolean",
    "unscaled={unscaledVideo}",
    "styles.videoUnscaled"
  ) && hoverPreviewCss.includes(".videoUnscaled") &&
    hoverPreviewCss.includes("transform: none"),
  "El video estático debe reutilizar HoverPreviewMedia sin el scale propio del hover."
);

if (failures.length > 0) {
  console.error("Home row static detail: FAIL");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Home row static detail: OK (editorial scope, secure atomic save, coherent responsive Admin flow, browser save/layout regressions, public renderer, visible-only video and no hover geometry)."
  );
}
