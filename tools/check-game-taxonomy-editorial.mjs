import "./check-game-taxonomy-editorial-v2.mjs";

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [selector, selectorCss, publicationPage, publicationNotice] =
  await Promise.all([
    source("src/components/admin/GameTaxonomyMultiSelect.tsx"),
    source("src/components/admin/GameTaxonomyMultiSelect.module.css"),
    source("src/app/admin/(protected)/juegos/[slug]/publicacion/page.tsx"),
    source("src/components/admin/GameTaxonomyPublicationNotice.tsx"),
  ]);

assert(
  selector.includes("termByKey") &&
    selector.includes("Seleccionadas") &&
    selector.includes("No está en Catálogos") &&
    selector.includes("Quitar ${value} de ${label}") &&
    selector.includes("selected.map((value)") &&
    selector.includes("remove(value)"),
  "El selector debe hacer visibles y removibles incluso las taxonomías del borrador que ya no existen en Catálogos."
);

assert(
  selectorCss.includes(".selectedPanel") &&
    selectorCss.includes(".selectedChipMissing") &&
    selectorCss.includes("min-height: 44px") &&
    selectorCss.includes("var(--text-on-brand)"),
  "Las selecciones de taxonomía deben tener jerarquía visual, estado faltante y targets táctiles accesibles."
);

assert(
  publicationPage.includes("inspectPublishedGameTaxonomyIntegrity(item.payload)") &&
    publicationPage.includes("GameTaxonomyPublicationNotice") &&
    publicationPage.includes('requestState === "catalogos-sin-publicar"') &&
    !publicationPage.includes("taxonomyIntegrity={taxonomyIntegrity}"),
  "Publicación debe calcular la integridad real de Catálogos, mostrar el diagnóstico dedicado y evitar duplicar el aviso genérico."
);

assert(
  publicationNotice.includes("missingClassifications") &&
    publicationNotice.includes("missingTags") &&
    publicationNotice.includes("Clasificaciones pendientes") &&
    publicationNotice.includes("Etiquetas pendientes") &&
    publicationNotice.includes("/admin/catalogos?seccion=publicacion"),
  "El aviso de publicación debe nombrar exactamente las clasificaciones y etiquetas ausentes del snapshot público."
);

if (failures.length > 0) {
  console.error("\nClaridad de taxonomía: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Claridad de taxonomía: OK (selecciones visibles; huérfanas removibles; publicación diagnostica términos faltantes)."
  );
}
