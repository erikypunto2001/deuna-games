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
  publicationService,
  gameMediaIntegrity,
  publishRoute,
  lifecycleSmoke,
  cardVideoNoHistoryFixture,
] = await Promise.all([
  source("package.json"),
  source("src/lib/media/editorial-media-serving.ts"),
  source("src/app/media/editorial/[slug]/[filename]/route.ts"),
  source("src/lib/admin/publication-history.ts"),
  source("src/lib/admin/publication-service.ts"),
  source("src/lib/admin/game-media-integrity.ts"),
  source("src/app/api/admin/content/games/[slug]/publish/route.ts"),
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
    "published_payload",
    "public_visible",
    "parseEditorialPayload",
    "listGameImageReferences",
    "listGameVideoReferences",
    "taxonomy.classifications",
    "taxonomy.tags",
    "site.logoAsset"
  ),
  "La decisión pública debe derivarse de snapshots editoriales reales para juegos, taxonomía y logo, sin leer borradores."
);

assert(
  has(
    serving,
    "if (item.public_visible)",
    "safePublicationReferences(",
    "item.published_payload",
    "references.add(reference)",
    'owner.type === "game"',
    "? []",
    "historicalPublicationRows"
  ) &&
    has(
      cardVideoNoHistoryFixture,
      "item.revisions !== 0 || item.publications !== 0",
      "snapshot público actual",
      "revisiones históricas=0",
      "publicaciones históricas=0"
    ),
  "Los juegos deben servir multimedia sólo desde su snapshot público actual y el fixture visual debe exigir cero filas históricas."
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
    serving.includes('owner.type === "game"') &&
    serving.includes("historicalPublicationRows"),
  "Las superficies que conservan historial deben compartir la definición de exposición pública; los juegos deben excluir explícitamente esas filas."
);

assert(
  has(
    serving,
    "publishedReferenceCache",
    "publication_row_count",
    "publication_max_id",
    "published_checksum",
    "cached.publicationRowCount === item.publication_row_count",
    "cached.publicationMaxId === item.publication_max_id",
    "cached.publicVisible === item.public_visible",
    "cached.publishedChecksum === item.published_checksum"
  ) &&
    !serving.includes("cached?.references.has(publicPath)"),
  "La caché de serving debe revalidar la firma del estado editorial antes de reutilizar referencias positivas."
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
    publicationService.includes('if (type === "game")') &&
    publicationService.includes('return { outcome: "not_found" };'),
  "Publicar debe conservar el guard de ownership y el servicio genérico de restore debe rechazar juegos sin historial restaurable."
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
  !lifecycleSmoke.includes("/api/admin/content/publications/") &&
    !lifecycleSmoke.includes("/history/publications/reset") &&
    !lifecycleSmoke.includes("/history/reset") &&
    has(
      lifecycleSmoke,
      'name="kind"',
      "library",
      "assertAnonymousPrivate",
      "assertPrivatePreview",
      "assertPublicImmutable",
      "visual-lifecycle-%",
      "public_visible = false",
      "evaluateGamePublicationReadiness",
      "readiness.essentialsReady",
      "croppedReadiness.essentialsReady",
      "/media-upload",
      "/media-library",
      "/image-layout",
      'target: "cover"',
      'viewportAspect: "4:5"',
      'target: "cover-source"',
      'resource: "card"',
      "/publish",
      '"publicado"',
      "/hide",
      '"oculto"',
      "revisions !== 0 ||",
      "publications !== 0",
      "recurso-en-uso",
      "recurso-eliminado",
      "no-game-history",
      "hard-delete=pending+retry+physical-clean"
    ),
  "El smoke debe cubrir upload, borrador, crop, publicación actual, ocultamiento, protección draft/current-only, huérfano eliminable, cero historial de juegos y recuperación física del hard-delete."
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
  "Frontera de serving multimedia editorial: OK (juegos=current-only sin historial; historial no-juego preservado; ownership por slug; cache incremental; draft/biblioteca privados; cleanup oculto)."
);
