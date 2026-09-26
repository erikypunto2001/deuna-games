import {
  readFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";


const root = process.cwd();
const failures = [];


async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}


function assert(condition, message) {
  if (!condition) failures.push(message);
}


const [
  publicPage,
  publicResolver,
  validation,
  validationCore,
  adminPage,
  heroRoute,
  principlesRoute,
  reasonRoute,
  manifestoRoute,
] = await Promise.all([
  source("src/app/quienes-somos/page.tsx"),
  source("src/lib/about/public-about-config.ts"),
  source("src/lib/admin/content-validation.ts"),
  source("src/lib/admin/content-validation-core.ts"),
  source("src/app/admin/(protected)/paginas/quienes-somos/page.tsx"),
  source("src/app/api/admin/content/about/hero/route.ts"),
  source("src/app/api/admin/content/about/principles/route.ts"),
  source("src/app/api/admin/content/about/reason/route.ts"),
  source("src/app/api/admin/content/about/manifesto/route.ts"),
]);


const completeValidation = `${validation}\n${validationCore}`;


assert(
  publicPage.includes("getPublicAboutConfig") &&
    !publicPage.includes("const principles =") &&
    !publicPage.includes("const ecosystem ="),
  "La página pública debe leer su contenido editorial y no volver a colecciones de texto hardcodeadas."
);


assert(
  publicResolver.includes("published_payload") &&
    publicResolver.includes("public_visible = true") &&
    !publicResolver.includes("draft_payload"),
  "La lectura pública de Quiénes somos debe usar exclusivamente el snapshot publicado."
);


assert(
  completeValidation.includes('"about_config"') &&
    completeValidation.includes("editorialAboutConfigSchema") &&
    completeValidation.includes("signals: z.array(aboutCardSchema).length(3)") &&
    completeValidation.includes("principles:") &&
    completeValidation.includes("ecosystem:"),
  "Quiénes somos debe conservar un esquema estructurado con cardinalidades controladas."
);


assert(
  adminPage.includes("PublicationPanel") &&
    !adminPage.includes("EditorialHistory") &&
    !adminPage.includes('section === "historial"') &&
    !adminPage.includes("restoreActionBase") &&
    !adminPage.includes("/api/admin/content/about-publications") &&
    !adminPage.includes("dangerouslySetInnerHTML"),
  "El editor institucional debe conservar publicación current-only, sin historial ni restauración, y no ofrecer HTML libre."
);


for (const [name, route] of [
  ["hero", heroRoute],
  ["principios", principlesRoute],
  ["propósito", reasonRoute],
  ["manifiesto", manifestoRoute],
]) {
  assert(
    route.includes("authorizeAdminFormRequest") &&
      route.includes("hasExactAdminFormFields") &&
      route.includes("expectedRevision"),
    `El formulario de ${name} debe exigir sesión/origen, campos exactos y control de revisión.`
  );
}


if (failures.length > 0) {
  console.error("\nQuiénes somos editorial: BLOQUEADO\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Quiénes somos editorial: OK (texto estructurado, snapshot público, formularios protegidos y publicación current-only sin historial restaurable)."
  );
}