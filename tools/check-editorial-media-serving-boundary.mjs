import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) failures.push(message); };
const has = (text, ...needles) => needles.every((needle) => text.includes(needle));

const [packageJson, serving, route, publicationService, gameMediaIntegrity, publishRoute, lifecycleSmoke, migration] = await Promise.all([
  source("package.json"),
  source("src/lib/media/editorial-media-serving.ts"),
  source("src/app/media/editorial/[slug]/[filename]/route.ts"),
  source("src/lib/admin/publication-service.ts"),
  source("src/lib/admin/game-media-integrity.ts"),
  source("src/app/api/admin/content/games/[slug]/publish/route.ts"),
  source("tools/editorial-media-serving-lifecycle-smoke.mjs"),
  source("database/migrations/020_retire_editorial_history.sql"),
]);

assert(
  has(
    serving,
    '"game"',
    '"game_taxonomy"',
    '"site_config"',
    "published_payload",
    "public_visible",
    "parseEditorialPayload",
    "listGameImageReferences",
    "listGameVideoReferences",
    "taxonomy.classifications",
    "taxonomy.tags",
    "site.logoAsset"
  ) &&
    !serving.includes("editorial_publications") &&
    !serving.includes("editorial_revisions"),
  "La decisión pública debe derivarse exclusivamente de la publicación vigente, sin tablas históricas."
);

assert(
  has(
    serving,
    "publishedReferenceCache",
    "published_checksum",
    "cached.publicVisible === item.public_visible",
    "cached.publishedChecksum === item.published_checksum",
    "safePublicationReferences(owner, item.published_payload)"
  ),
  "La caché de serving debe revalidar la firma del estado editorial vigente antes de reutilizar referencias."
);

assert(
  has(
    migration,
    "DROP TABLE IF EXISTS deuna_admin.editorial_revisions",
    "DROP TABLE IF EXISTS deuna_admin.editorial_publications",
    "DROP FUNCTION IF EXISTS deuna_admin.compact_editorial_history",
    "DROP FUNCTION IF EXISTS deuna_admin.compact_editorial_item_history"
  ),
  "La migración current-only debe retirar físicamente tablas y funciones de historial restaurable."
);

assert(
  has(
    gameMediaIntegrity,
    "EDITORIAL_MEDIA_PUBLIC_PREFIX",
    "listInvalidGameMediaOwnership",
    "ownedPrefix",
    "game.slug",
    "invalidOwnership.length === 0"
  ) && publishRoute.includes("inspectGameMediaIntegrity") && !publicationService.includes("restoreEditorialPublication"),
  "Publicar debe conservar el guard de ownership y no debe existir un servicio de restauración editorial."
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
  "La ruta física debe aplicar 404 anónimo, no-store privado y cache inmutable únicamente a referencias vigentes publicadas."
);

const physicalCheck = route.indexOf("const stats = await lstat(resolved.filePath)");
const accessDecision = route.indexOf("const servingAccess =");
const cacheHeaders = route.indexOf("const sharedHeaders =");
assert(
  physicalCheck >= 0 && accessDecision > physicalCheck && cacheHeaders > accessDecision,
  "La ruta debe descartar paths inexistentes antes de consultar publicación y decidir acceso antes de construir headers cacheables."
);

assert(
  !lifecycleSmoke.includes("/api/admin/content/publications/") &&
    !lifecycleSmoke.includes("/history/publications/reset") &&
    !lifecycleSmoke.includes("/history/reset") &&
    has(
      lifecycleSmoke,
      "assertAnonymousPrivate",
      "assertPrivatePreview",
      "assertPublicImmutable",
      "evaluateGamePublicationReadiness",
      "/media-upload",
      "/media-library",
      "/publish",
      '"publicado"',
      "/hide",
      '"oculto"',
      "current-only-history-retired",
      "hard-delete=pending+retry+physical-clean"
    ),
  "El smoke debe cubrir el lifecycle multimedia completo bajo el modelo current-only, sin restauración ni compactación histórica."
);

const gameLifecycleIndex = packageJson.indexOf("game-publication-lifecycle-smoke.mjs");
const servingLifecycleIndex = packageJson.indexOf("editorial-media-serving-lifecycle-smoke.mjs");
assert(
  gameLifecycleIndex >= 0 && servingLifecycleIndex > gameLifecycleIndex,
  "El lifecycle de serving debe ejecutarse después del lifecycle de juego que prepara el fixture."
);

assert(
  packageJson.includes("check-editorial-media-serving-boundary.mjs") &&
    packageJson.includes("editorial-media-serving-lifecycle-smoke.mjs"),
  "La barrera estática y el lifecycle real deben permanecer conectados a los comandos canónicos."
);

if (failures.length > 0) {
  console.error("\nFrontera de serving multimedia editorial: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Frontera de serving multimedia editorial: OK (estado publicado actual como única fuente pública; sin historial restaurable; ownership por slug; cache incremental; draft/biblioteca privados)."
);
