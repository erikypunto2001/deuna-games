import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const has = (text, ...needles) => needles.every((needle) => text.includes(needle));

const [
  packageJson,
  library,
  libraryRoute,
  mediaWorkspaceRoute,
  mediaResourceDeleteRoute,
  publishedVideoReferences,
  imageUploadRoute,
  imageUploadForm,
  assignmentsWorkspace,
  galleryManager,
  accessibilityEditor,
  utilityRail,
  multimediaEditor,
  workspaceProvider,
  mediaPreview,
  mediaPreviewCss,
  contextualDialog,
  contextualDialogCss,
  mediaViewportEditor,
  videoViewportEditor,
  imageViewportEditor,
  mediaIntegrity,
  publicationLifecycle,
] = await Promise.all([
  source("package.json"),
  source("src/lib/media/editorial-media-library.ts"),
  source("src/app/api/admin/content/games/[slug]/media-library/route.ts"),
  source("src/app/api/admin/content/games/[slug]/media-workspace/route.ts"),
  source("src/app/api/admin/content/games/[slug]/media-resource-delete/route.ts"),
  source("src/lib/admin/published-game-video-references.ts"),
  source("src/app/api/admin/content/games/[slug]/media-upload/route.ts"),
  source("src/components/admin/GameMediaUploadForm.tsx"),
  source("src/components/admin/GameMediaAssignmentsWorkspace.tsx"),
  source("src/components/admin/GameGalleryMediaManager.tsx"),
  source("src/components/admin/GameMediaAccessibilityEditor.tsx"),
  source("src/components/admin/GameMultimediaUtilityRail.tsx"),
  source("src/components/admin/GameMultimediaEditor.tsx"),
  source("src/components/admin/GameMultimediaWorkspaceProvider.tsx"),
  source("src/components/admin/AdminMediaLibraryPreview.tsx"),
  source("src/components/admin/AdminMediaLibraryPreview.module.css"),
  source("src/components/admin/ContextualMediaDialog.tsx"),
  source("src/components/admin/ContextualMediaDialog.module.css"),
  source("src/components/admin/MediaViewportEditor.tsx"),
  source("src/components/admin/GameVideoViewportEditor.tsx"),
  source("src/components/admin/ImageViewportEditor.tsx"),
  source("src/lib/admin/game-media-integrity.ts"),
  source("tools/game-publication-lifecycle-smoke.mjs"),
]);

assert(
  packageJson.includes("check-shared-media-library.mjs"),
  "El checker de biblioteca compartida debe seguir dentro del pipeline principal."
);

assert(
  has(
    library,
    "MEDIA_FILENAME",
    "DELETE_MARKER",
    "[a-f0-9]{64}",
    "MAX_EDITORIAL_IMAGE_BYTES",
    "MAX_EDITORIAL_PREVIEW_BYTES",
    "inspectSafeEditorialWebp",
    "inspectSafeEditorialWebm",
    "stats.isSymbolicLink()",
    "MAX_LIBRARY_RESOURCES",
    "listAssignedBundledImageResources",
    "mergeEditorialMediaResources"
  ),
  "La biblioteca debe enumerar sólo recursos WebP/WebM seguros, hash-nombrados, acotados y no simbólicos."
);

assert(
  has(
    library,
    "markEditorialMediaForDeletion",
    "deleteEditorialMediaResource",
    "reconcileEditorialMediaDeletions",
    "clearEditorialMediaDeletionMarker",
    "resolveEditorialMediaDiskPath",
    "inspectEditorialResourceFile",
    "inspection.digest !== expectedDigest",
    "unlink(",
    "writeFile(",
    'flag: "wx"'
  ),
  "La eliminación física debe revalidar ruta, hash y formato antes de borrar bytes."
);

assert(
  has(
    libraryRoute,
    "authorizeAdminFormRequest",
    "hasExactAdminFormFields",
    "findEditorialMediaResource",
    "resourcesForGame",
    "protectedReferencesForGame",
    "listGameImageReferences",
    "listGameVideoReferences",
    "getPublishedGameImageReferences",
    "getPublishedGameVideoReferences",
    "reconcileEditorialMediaDeletions",
    "saveGameMediaDraft"
  ) &&
    !libraryRoute.includes("export async function GET") &&
    has(
      mediaWorkspaceRoute,
      "export async function GET",
      "verifyAdminSession",
      "getGameMediaWorkspaceSnapshot",
      '"Cache-Control": "no-store"'
    ) &&
    !libraryRoute.includes('"image-delete"') &&
    !libraryRoute.includes('"video-delete"') &&
    !libraryRoute.includes("markEditorialMediaForDeletion") &&
    !libraryRoute.includes("deleteEditorialMediaResource") &&
    !libraryRoute.includes("withoutImageResource") &&
    !libraryRoute.includes("withoutVideoResource") &&
    !libraryRoute.includes("spawn(") &&
    !libraryRoute.includes("writeFile(") &&
    !libraryRoute.includes("unlink(") &&
    !libraryRoute.includes("getHistoricalGameMediaReferences"),
  "media-workspace debe ser la única lectura autenticada; media-library debe limitarse a asignación, proteger borrador/publicación actual y no contener borrado físico ni historial de juegos."
);

assert(
  !libraryRoute.includes('"gallery-image"') &&
    !libraryRoute.includes('"gallery-remove"') &&
    !libraryRoute.includes("resolveGameGalleryItems") &&
    !libraryRoute.includes("withGalleryItem") &&
    !libraryRoute.includes("withoutGalleryItem") &&
    has(
      galleryManager,
      'action={`/api/admin/content/games/${encodeURIComponent(slug)}/gallery-media`}',
      '"gallery-add"',
      '"gallery-remove"',
      '"gallery-move"'
    ),
  "Galería debe tener una única superficie de escritura en gallery-media; media-library sólo asigna destinos fijos."
);

const lifecycleMediaSnapshot = publicationLifecycle.match(
  /async function mediaSnapshot\([\s\S]*?\n\}/
)?.[0] ?? "";

assert(
  lifecycleMediaSnapshot.includes("/media-workspace") &&
    !lifecycleMediaSnapshot.includes("/media-library"),
  "El lifecycle E2E debe leer el snapshot multimedia únicamente desde media-workspace; media-library queda reservado a mutaciones POST."
);

assert(
  has(
    mediaResourceDeleteRoute,
    "authorizeAdminFormRequest",
    "hasExactAdminFormFields",
    "draftReferences.has(resource)",
    "getPublishedGameImageReferences",
    "getPublishedGameVideoReferences",
    "publishedReferences.has(selected.src)",
    "markEditorialMediaForDeletion",
    "deleteEditorialMediaResource"
  ) &&
    !mediaResourceDeleteRoute.includes("saveGameMediaDraft") &&
    !mediaResourceDeleteRoute.includes("getHistoricalGameMediaReferences") &&
    !mediaResourceDeleteRoute.includes("recurso-en-historial"),
  "El borrado destructivo debe vivir sólo en su ruta dedicada y rechazar referencias del borrador o de la publicación actual."
);

assert(
  has(
    publishedVideoReferences,
    "published_payload",
    "public_visible",
    "parseEditorialPayload",
    "listGameVideoReferences",
    "verifyAdminSession"
  ),
  "Los WebM publicados deben seguir siendo detectables por la capa de publicación."
);

assert(
  has(
    mediaIntegrity,
    "listGameImageReferences",
    "listGameVideoReferences",
    "game.cardImage",
    "game.videoMedia?.background?.clip",
    "game.previewClip"
  ),
  "La integridad debe cubrir todas las referencias de imagen y video del juego."
);

assert(
  has(
    imageUploadForm,
    "const submitLock = useRef(false)",
    "if (submitLock.current) return",
    "submitLock.current = true",
    "submitLock.current = false"
  ) &&
    !imageUploadForm.includes("if (busy) return"),
  "La carga de imágenes de Biblioteca debe serializarse con un lock síncrono; busy queda sólo como estado visual."
);

assert(
  has(
    imageUploadRoute,
    'kind !== "library"',
    "storeEditorialWebp",
    "clearEditorialImageDeletionMarker",
    "recurso-subido"
  ) &&
    !imageUploadRoute.includes("saveGameMediaDraft") &&
    !imageUploadRoute.includes("reconcileGameImageMedia") &&
    has(
      imageUploadForm,
      'name="kind" value="library"',
      "Preparar y guardar en biblioteca"
    ) &&
    !imageUploadForm.includes("libraryOnly") &&
    !imageUploadForm.includes("screenshotCount") &&
    !imageUploadForm.includes('value="cover"') &&
    !imageUploadForm.includes('value="screenshot"'),
  "Subir una imagen debe crear únicamente un master reutilizable de Biblioteca; destinos y Galería se asignan después por sus rutas canónicas."
);

assert(
  has(
    multimediaEditor,
    "GameMultimediaWorkspaceProvider",
    'key={`${slug}:${revision}`}',
    "GameMediaAssignmentsWorkspace",
    "GameGalleryMediaManager",
    "GameMediaAccessibilityEditor",
    "GameMultimediaUtilityRail"
  ) &&
    has(
      workspaceProvider,
      "createContext",
      "useGameMultimediaWorkspace",
      "/media-workspace",
      "currentRevision",
      "stale",
      "openLibrary",
      "closeLibrary"
    ) &&
    assignmentsWorkspace.includes("onAddResource={openLibrary}") &&
    utilityRail.includes("libraryOpen") &&
    utilityRail.includes("openLibrary") &&
    utilityRail.includes("closeLibrary") &&
    !assignmentsWorkspace.includes("document.querySelector") &&
    !assignmentsWorkspace.includes("data-multimedia-library-open") &&
    !assignmentsWorkspace.includes("/media-workspace") &&
    !galleryManager.includes("/media-workspace") &&
    !accessibilityEditor.includes("/media-workspace") &&
    !utilityRail.includes("/media-workspace") &&
    !multimediaEditor.includes("GameMultimediaWorkspaceContextual"),
  "El editor multimedia debe cargar media-workspace una sola vez y compartir exactamente el mismo snapshot/revisión entre Asignaciones, Galería, Accesibilidad y rail."
);

for (const label of [
  "ASIGNACIÓN DE DESTINOS",
  "Card es la presentación principal del juego",
  "Misma imagen que Card",
  "Imagen diferente",
  "Portada inicial",
  "Vista informativa",
  "Hero de inicio",
  "Biblioteca compartida:",
]) {
  assert(
    assignmentsWorkspace.includes(label),
    `Asignaciones multimedia debe conservar la jerarquía o acción: ${label}.`
  );
}

assert(
  has(
    assignmentsWorkspace,
    'target="cover-image"',
    'target="card-image"',
    'target="card-video"',
    'target="hero-image"',
    'target="hero-video"',
    "ImageViewportEditor",
    "GameVideoViewportEditor",
    "Comparte el master, no el recorte",
    "Card conserva siempre una imagen base 3:2"
  ),
  "Asignaciones debe reutilizar masters por referencia y conservar crops independientes por destino."
);

assert(
  has(
    galleryManager,
    "Galería del juego",
    "gallery-add",
    "gallery-remove",
    "gallery-move",
    "ImageViewportEditor",
    "GameGalleryVideoViewportEditor",
    "Agregar imagen nueva",
    "Agregar video nuevo"
  ),
  "Galería debe administrar orden/asignación por referencia y editar crops sin duplicar masters."
);

assert(
  has(
    utilityRail,
    "Biblioteca multimedia compartida",
    "media-resource-delete",
    'resource.hygiene?.status !== "unused"',
    "Protegido",
    "Por resolver ·",
    "AdminMediaLibraryPreview",
    'renderLibraryGroup("IMÁGENES", "image", filteredImages)',
    'renderLibraryGroup("VIDEOS", "video", filteredVideos)',
    "setPreviewResource(resource)"
  ) &&
    !utilityRail.includes("Historial"),
  "El rail debe centralizar biblioteca/higiene y ofrecer borrado sólo a masters realmente huérfanos, sin una categoría histórica para juegos."
);

assert(
  has(
    mediaPreview,
    "ContextualMediaDialog",
    "VideoPreview",
    "Retroceder 10 segundos",
    "Avanzar 10 segundos",
    "Pantalla completa",
    'type="range"',
    "muted",
    "playsInline",
    'preload="metadata"'
  ) &&
    !mediaPreview.includes("volume") &&
    has(
      mediaPreviewCss,
      ".imageStage",
      ".videoStage",
      ".videoControls",
      "object-fit: contain"
    ),
  "La vista grande debe ampliar imágenes y reproducir videos con controles básicos sin interfaz de audio."
);

assert(
  has(
    contextualDialog,
    "createPortal",
    "document.body",
    'event.key === "Escape"',
    'aria-modal="true"',
    'document.body.style.overflow = "hidden"'
  ) && has(contextualDialogCss, ".dialogWide", "1380px", "100dvh"),
  "Previews y editores deben reutilizar el overlay accesible existente."
);

assert(
  has(
    mediaViewportEditor,
    'type MediaKind = "image" | "video"',
    "resolvePreviewViewportCrop",
    "Posición X",
    "Posición Y",
    "Zoom",
    "Resultado final",
    'objectFit: "contain"'
  ) &&
    has(imageViewportEditor, "MediaViewportEditor", 'kind="image"', "image-layout") &&
    has(videoViewportEditor, "MediaViewportEditor", 'kind="video"', "preview-layout"),
  "Los crops de destino deben usar el motor común y persistir sólo metadata."
);

if (failures.length > 0) {
  console.error("\nBiblioteca multimedia compartida: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Biblioteca multimedia compartida: OK (WebP/WebM seguros · asignación por referencia · borrado dedicado con borrador/publicación protegidos · sin historial de juegos · workspace dividido vigente · preview grande · crops independientes)."
);
