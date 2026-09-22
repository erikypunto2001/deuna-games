import {
  readFile,
} from "node:fs/promises";
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
  packageJson,
  serving,
  route,
  publicationHistory,
  gameMediaHistory,
  gameMediaIntegrity,
  publishRoute,
  restoreRoute,
  lifecycleSmoke,
  cardVideoLegacyHistoryFixture,
] = await Promise.all([
  source("package.json"),
  source("src/lib/media/editorial-media-serving.ts"),
  source("src/app/media/editorial/[slug]/[filename]/route.ts"),
  source("src/lib/admin/publication-history.ts"),
  source("src/lib/admin/game-media-history.ts"),
  source("src/lib/admin/game-media-integrity.ts"),
  source("src/app/api/admin/content/games/[slug]/publish/route.ts"),
  source("src/app/api/admin/content/publications/[publicationId]/restore/route.ts"),
  source("tools/editorial-media-serving-lifecycle-smoke.mjs"),
  source("tools/card-video-legacy-history-fixture.ts"),
]);

assert(
  has(
    serving,
    '"game"',
    '"game_taxonomy"',
    '"site_config"',
    "editorial_publications",
    "publication_number",
    "published_payload",
    "public_visible",
    "parseEditorialPayload",
    "listGameImageReferences",
    "listGameVideoReferences",
    "taxonomy.classifications",
    "taxonomy.tags",
    "site.logoAsset"
  ),
  "La decisión pública debe derivarse de snapshots publicados reales para juegos, taxonomía y logo, sin leer borradores."
);

assert(
  has(
    serving,
    "if (item.public_visible)",
    "safePublicationReferences(",
    "item.published_payload",
    "references.add(reference)"
  ) &&
    has(
      cardVideoLegacyHistoryFixture,
      "DELETE FROM deuna_admin.editorial_publications",
      "publication_number = $2",
      "snapshot público preservado"
    ),
  "El snapshot público actual debe autorizar sus propios recursos aunque falte su fila histórica, y el smoke visual debe reproducir exactamente ese gap legacy."
);

assert(
  has(
    publicationHistory,
    "PUBLIC_EXPOSURE_PUBLICATION_SQL",
    "publication.action IN ('published', 'rollback', 'baseline')",
    "publication.action = 'bootstrap'",
    "created_item.source_present = false",
    "created_item.source_payload = '{}'::jsonb",
    "ON DELETE SET NULL"
  ) &&
    serving.includes("PUBLIC_EXPOSURE_PUBLICATION_SQL") &&
    gameMediaHistory.includes("PUBLIC_EXPOSURE_PUBLICATION_SQL"),
  "Serving y retención histórica deben compartir una única definición de exposición pública basada en origen persistente y no en actor_user_id ni en una revisión histórica concreta."
);

assert(
  has(
    serving,
    "publishedReferenceCache",
    "cached?.references.has(publicPath)",
    "cached.publicationNumber",
    "item.publication_number",
    "cached.publicationNumber < item.publication_number",
    "publication.publication_number > $2",
    "reusable?.references ?? []"
  ),
  "La ruta debe cachear sólo referencias positivas e incorporar únicamente publicaciones nuevas cuando avanza publication_number."
);

assert(
  has(
    gameMediaIntegrity,
    "EDITORIAL_MEDIA_PUBLIC_PREFIX",
    "listInvalidGameMediaOwnership",
    "ownedPrefix",
    "game.slug",
    "invalidOwnership.length === 0"
  ) &&
    publishRoute.includes("inspectGameMediaIntegrity") &&
    restoreRoute.includes("inspectGameMediaIntegrity"),
  "Publicar y restaurar un juego deben conservar el guard común que rechaza multimedia editorial de otro namespace."
);

assert(
  has(
    serving,
    "isAdminEnabled()",
    "readAdminSessionToken()",
    "resolveAdminSession",
    'return "public"',
    "return (await hasAdminMediaAccess())",
    '? "admin"',
    ": null"
  ),
  "Un asset no publicado sólo puede degradar a preview Admin autenticado; el tráfico anónimo debe fallar cerrado."
);

assert(
  has(
    route,
    "resolveEditorialMediaServingAccess",
    "if (!servingAccess)",
    'servingAccess === "admin"',
    '"private, no-store, max-age=0"',
    '"public, max-age=31536000, immutable"',
    'servingAccess === "public"',
    "ETag"
  ),
  "La ruta física debe aplicar 404 anónimo, no-store privado y cache inmutable únicamente a referencias publicadas."
);

const physicalCheck = route.indexOf(
  "const stats = await lstat(resolved.filePath)"
);
const accessDecision = route.indexOf(
  "const servingAccess ="
);
const cacheHeaders = route.indexOf(
  "const sharedHeaders ="
);
assert(
  physicalCheck >= 0 &&
    accessDecision > physicalCheck &&
    cacheHeaders > accessDecision,
  "La ruta debe descartar paths inexistentes antes de consultar publicación y decidir acceso antes de construir headers cacheables."
);

assert(
  has(
    lifecycleSmoke,
    'kind="kind"'
  ) === false &&
    has(
      lifecycleSmoke,
      'name="kind"',
      "library",
      "assertAnonymousPrivate",
      "assertPrivatePreview",
      "assertPublicImmutable",
      "redirectState",
      "expectedState",
      "visual-lifecycle-%",
      "public_visible = false",
      "evaluateGamePublicationReadiness",
      "readiness.essentialsReady",
      "croppedReadiness.essentialsReady",
      "/media-upload",
      "/media",
      "/image-layout",
      'target: "cover"',
      'viewportAspect: "4:5"',
      '"imagen-encuadre-guardado"',
      "/publish",
      '"publicado"',
      "/restore",
      '"publicacion-restaurada"',
      "/hide",
      '"oculto"',
      "crop=confirmed-private",
      "historical-public",
      "cleanup=hidden"
    ),
  "El smoke debe reutilizar sólo el fixture sintético oculto y publication-ready, cubrir upload/borrador/crop/publicación/restauración y volver a ocultarlo validando cada redirect crítico."
);

const gameLifecycleIndex = packageJson.indexOf(
  "game-publication-lifecycle-smoke.mjs"
);
const servingLifecycleIndex = packageJson.indexOf(
  "editorial-media-serving-lifecycle-smoke.mjs"
);
assert(
  gameLifecycleIndex >= 0 &&
    servingLifecycleIndex > gameLifecycleIndex,
  "El lifecycle de serving debe ejecutarse después del lifecycle de juego que crea y deja oculto su fixture publication-ready."
);

assert(
  packageJson.includes("check-editorial-media-serving-boundary.mjs") &&
    packageJson.includes("editorial-media-serving-lifecycle-smoke.mjs"),
  "La barrera estática y el lifecycle real deben permanecer conectados a los comandos canónicos."
);

if (failures.length > 0) {
  console.error("\nFrontera de serving multimedia editorial: ERROR\n");
  failures.forEach((failure) =>
    console.error(`- ${failure}`)
  );
  process.exit(1);
}

console.log(
  "Frontera de serving multimedia editorial: OK (snapshot público actual autoritativo; historial público compartido; ownership por slug; cache incremental; fixture publication-ready; draft/biblioteca privados; cleanup oculto)."
);
