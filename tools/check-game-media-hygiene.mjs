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
  history,
  publicationHistory,
  hygiene,
  workspace,
  workspaceRoute,
  deleteRoute,
  publishRoute,
  utilityRail,
  publicationWorkspace,
] = await Promise.all([
  source("src/lib/admin/game-media-history.ts"),
  source("src/lib/admin/publication-history.ts"),
  source("src/lib/admin/game-media-hygiene.ts"),
  source("src/lib/admin/game-media-workspace.ts"),
  source("src/app/api/admin/content/games/[slug]/media-workspace/route.ts"),
  source("src/app/api/admin/content/games/[slug]/media-resource-delete/route.ts"),
  source("src/app/api/admin/content/games/[slug]/publish/route.ts"),
  source("src/components/admin/GameMultimediaUtilityRail.tsx"),
  source("src/components/admin/GamePublicationWorkspace.tsx"),
]);

assert(
  has(
    history,
    "editorial_publications",
    "publication.payload",
    "PUBLIC_EXPOSURE_PUBLICATION_SQL",
    "listGameImageReferences",
    "listGameVideoReferences"
  ) &&
    has(
      publicationHistory,
      "publication.action IN ('published', 'rollback', 'baseline')",
      "publication.action = 'bootstrap'",
      "created_item.source_present = false",
      "created_item.source_payload = '{}'::jsonb",
      "NOT EXISTS"
    ),
  "La higiene debe usar la fuente compartida que protege publicaciones/restauraciones y distinguir el bootstrap privado por su origen persistente, sin depender de revisiones históricas compactables."
);

assert(
  has(
    hygiene,
    '"active"',
    '"reserved"',
    '"published-only"',
    '"historical"',
    '"unused"',
    'resource.origin === "editorial"',
    'status === "unused"'
  ) &&
    !hygiene.includes('status === "unused" || status === "published-only"'),
  "La higiene debe distinguir borrador, publicación, historial y huérfanos, bloqueando únicamente masters editoriales sin ninguna referencia."
);

assert(
  has(
    workspace,
    "getHistoricalGameMediaReferences",
    "protectedReferences",
    "reconcileEditorialMediaDeletions",
    "getPublishedGameImageReferences",
    "getPublishedGameVideoReferences",
    "evaluateGameMediaHygiene",
    "evaluateGameMediaRequirements",
    "resolveGameGalleryItems"
  ),
  "El snapshot multimedia debe reunir borrador, publicación, historial, Galería, requisitos e higiene desde una fuente autoritativa del servidor."
);

assert(
  has(
    workspaceRoute,
    "verifyAdminSession",
    "getGameMediaWorkspaceSnapshot",
    '"Cache-Control": "no-store"'
  ),
  "El endpoint del workspace multimedia debe permanecer privado, dinámico y sin caché compartida."
);

assert(
  has(
    deleteRoute,
    "listGameImageReferences",
    "listGameVideoReferences",
    "draftReferences.has(resource)",
    "getHistoricalGameMediaReferences",
    "historicalReferences",
    'redirectPath(slug, "recurso-en-historial")',
    "markEditorialMediaForDeletion",
    "publishedReferences.has(selected.src)"
  ),
  "Eliminar un master debe rechazar referencias del borrador y del historial restaurable, y nunca romper un snapshot recuperable."
);

assert(
  has(
    publishRoute,
    "getGameMediaWorkspaceSnapshot",
    "!mediaWorkspace.hygiene.ready",
    '`${target}?estado=higiene-multimedia`',
    "await getGameMediaWorkspaceSnapshot(slug)"
  ),
  "Publicación debe revalidar higiene en servidor y reconciliar la biblioteca después de publicar."
);

assert(
  has(
    utilityRail,
    "Sin masters editoriales huérfanos",
    "Por resolver ·",
    "Referenciados ·",
    'resource.hygiene?.status !== "unused"',
    "Historial",
    "Protegido",
    "resource.hygiene?.usage",
    'usage={previewResource.hygiene?.usage ?? []}'
  ),
  "Biblioteca debe mostrar huérfanos, recursos protegidos y usos reales, dejando la papelera sólo para masters sin uso."
);

assert(
  has(
    publicationWorkspace,
    "mediaHygiene.ready",
    "Higiene multimedia",
    "publicationEssentialsReady",
    "realmente huérfano",
    'state === "higiene-multimedia"'
  ),
  "La revisión de Publicación debe reflejar y bloquear visualmente la misma higiene huérfano-only que valida el servidor."
);

if (failures.length) {
  console.error("\nHigiene multimedia: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Higiene multimedia: OK (huérfanos reales únicamente · publicación bloqueada · historial restaurable protegido · bootstrap privado excluido · Biblioteca y Publicación coherentes)."
);
