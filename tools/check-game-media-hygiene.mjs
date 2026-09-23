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
  hygiene,
  workspace,
  workspaceRoute,
  deleteRoute,
  publishRoute,
  utilityRail,
  publicationWorkspace,
] = await Promise.all([
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
    hygiene,
    '"active"',
    '"reserved"',
    '"published-only"',
    '"unused"',
    'resource.origin === "editorial"',
    'status === "unused"',
    "Los juegos no conservan historial restaurable"
  ) &&
    !hygiene.includes('"historical"'),
  "La higiene de juegos debe distinguir borrador, publicación actual y huérfanos sin conservar una categoría histórica."
);

assert(
  has(
    workspace,
    "draftReferences",
    "publishedReferences",
    "reconcileEditorialMediaDeletions",
    "getPublishedGameImageReferences",
    "getPublishedGameVideoReferences",
    "evaluateGameMediaHygiene",
    "evaluateGameMediaRequirements",
    "resolveGameGalleryItems"
  ) &&
    !workspace.includes("getHistoricalGameMediaReferences"),
  "El snapshot multimedia debe proteger sólo borrador y publicación actuales, además de Galería, requisitos e higiene."
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
    "markEditorialMediaForDeletion",
    "publishedReferences.has(selected.src)"
  ) &&
    !deleteRoute.includes("getHistoricalGameMediaReferences") &&
    !deleteRoute.includes("recurso-en-historial"),
  "Eliminar un master debe rechazar referencias del borrador o de la publicación actual sin depender de historial de juegos."
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
    'status === "published-only"',
    "Protegido",
    "resource.hygiene?.usage",
    'usage={previewResource.hygiene?.usage ?? []}'
  ) &&
    !utilityRail.includes("Historial"),
  "Biblioteca debe mostrar huérfanos, recursos protegidos por borrador/publicación actual y usos reales, sin historial de juegos."
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
  "Higiene multimedia: OK (huérfanos reales únicamente · publicación bloqueada · borrador/publicación actual protegidos · sin historial de juegos · Biblioteca y Publicación coherentes)."
);
