import { readFile } from "node:fs/promises";
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

const [layout, shell, shellUx, touchContract, publicationCss, publicationPanelCss, informationArchitectureCss, adminCss, professionalCss, professionalDetailsCss, gamePreviewCss, mediaPreviewCss, mediaThumbnailCss, contextualDialogCss, backgroundMediaCss, multimediaRailCss] = await Promise.all([
  source("src/app/admin/(protected)/layout.tsx"),
  source("src/components/admin/AdminShell.tsx"),
  source("src/components/admin/AdminShellUx.module.css"),
  source("src/app/admin/admin-touch-contract.css"),
  source("src/components/admin/GamePublicationWorkspace.module.css"),
  source("src/components/admin/PublicationPanel.module.css"),
  source("src/components/admin/AdminInformationArchitecture.module.css"),
  source("src/app/admin/admin.module.css"),
  source("src/app/admin/admin-professional.css"),
  source("src/app/admin/admin-professional-details.css"),
  source("src/app/admin/(protected)/juegos/[slug]/vista-previa/page.module.css"),
  source("src/components/admin/AdminMediaLibraryPreview.module.css"),
  source("src/components/admin/AdminMediaThumbnail.module.css"),
  source("src/components/admin/ContextualMediaDialog.module.css"),
  source("src/components/admin/GameBackgroundMediaEditor.module.css"),
  source("src/components/admin/GameMultimediaUtilityRail.module.css"),
]);

assert(
  layout.includes('import "../admin-touch-contract.css"'),
  "El layout protegido debe cargar el contrato táctil después del contrato visual del Admin.",
);

assert(
  shell.includes('data-admin-shell="true"'),
  "El shell debe exponer un scope estable para el contrato táctil global.",
);

assert(
  shellUx.includes(".main :where(form button)") &&
    shellUx.includes("min-height: 44px") &&
    !shellUx.includes(".main form button"),
  "El baseline de botones del shell debe ser 44px y de baja especificidad para no reducir controles mayores de cada editor.",
);

assert(
  publicationCss.includes(".historyAction button") &&
    /\.historyAction button\s*\{[^}]*min-height:\s*44px;/s.test(publicationCss) &&
    !/\.historyAction button\s*\{[^}]*min-height:\s*(?:[0-3]\d|4[0-3])px;/s.test(publicationCss),
  "Restaurar y publicar en el historial debe conservar un target táctil mínimo de 44px también en desktop.",
);

assert(
  /\.restoreButton\s*\{[^}]*min-height:\s*44px;/s.test(publicationPanelCss) &&
    !/\.restoreButton\s*\{[^}]*min-height:\s*(?:[0-3]\d|4[0-3])px;/s.test(publicationPanelCss),
  "El botón Restaurar del panel genérico de Publicación debe conservar un target táctil mínimo de 44px también en desktop.",
);

assert(
  /\.contextSecondary a\s*\{[^}]*min-height:\s*44px;/s.test(informationArchitectureCss) &&
    /\.dashboardHeaderActions a\s*\{[^}]*min-height:\s*44px;/s.test(informationArchitectureCss) &&
    /\.publicPageActions a\s*\{[^}]*min-height:\s*44px;/s.test(informationArchitectureCss) &&
    /\.rowActions > a,[\s\S]*?min-height:\s*44px;/s.test(informationArchitectureCss) &&
    /\.mobileNavPanel a,[\s\S]*?min-height:\s*44px;/s.test(informationArchitectureCss) &&
    !/min-height:\s*(?:3[0-9]|4[0-3])px;/.test(informationArchitectureCss),
  "Dashboard, navegación contextual y acciones de filas/páginas deben conservar targets táctiles de al menos 44px también fuera del override móvil.",
);

assert(
  /\.ownerBlock button\s*\{[^}]*min-height:\s*44px;/s.test(adminCss) &&
    /\.tableAction\s*\{[^}]*min-height:\s*44px;/s.test(adminCss) &&
    /\.historyList button\s*\{[^}]*min-height:\s*44px;/s.test(adminCss) &&
    /\.admin-professional \.admin-table-action\s*\{[^}]*min-height:\s*44px;/s.test(professionalCss) &&
    /input\[type="file"\]::file-selector-button\s*\{[^}]*min-height:\s*44px;/s.test(professionalDetailsCss) &&
    /\.admin-professional \.admin-history-action\s*\{[^}]*min-height:\s*44px;/s.test(professionalDetailsCss),
  "Las acciones compartidas de ownership, tablas, historial y archivos deben conservar targets táctiles de al menos 44px en desktop.",
);

assert(
  /\.backLink,\s*\n\.publicLink\s*\{[^}]*min-height:\s*44px;/s.test(gamePreviewCss) &&
    !gamePreviewCss.includes(".publishGate button"),
  "Vista previa debe conservar navegación de 44px y no CSS legacy para un botón de Publicación que ya no se renderiza.",
);

assert(
  /\.videoControls button\s*\{[^}]*min-height:\s*44px;/s.test(mediaPreviewCss) &&
    /\.errorState button\s*\{[^}]*min-height:\s*44px;/s.test(mediaThumbnailCss) &&
    /\.closeButton\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s.test(contextualDialogCss) &&
    !/\.(?:actions|primary|secondary)\b/.test(contextualDialogCss) &&
    /\.libraryLink,\s*\n\.globalButton\s*\{[^}]*min-height:\s*44px;/s.test(backgroundMediaCss) &&
    /\.libraryFilters button\s*\{[^}]*min-height:\s*44px;/s.test(multimediaRailCss),
  "Los controles multimedia compartidos deben conservar targets táctiles de 44px y el diálogo no debe reintroducir acciones legacy sin consumidor.",
);

assert(
  touchContract.includes("@media (max-width: 760px)") &&
    touchContract.includes('[data-admin-shell="true"][data-admin-shell="true"] :is(a, button, summary)') &&
    touchContract.includes("min-height: var(--control-md)") &&
    touchContract.includes(".skip-link"),
  "En móvil, links, botones, summaries y skip-link del Admin deben conservar el piso táctil canónico --control-md.",
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Admin touch contract: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    "Admin touch contract: OK (baseline de baja especificidad + piso móvil canónico de 44px).",
  );
}
