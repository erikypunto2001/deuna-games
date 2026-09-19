import { access, readFile } from "node:fs/promises";
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
  policy,
  editorialVideo,
  videoEditor,
  trimEditor,
  uploadRoute,
  importRoute,
  multimediaPage,
  multimediaEditor,
  assignmentsWorkspace,
  galleryManager,
  utilityRail,
  multimediaShellCss,
] = await Promise.all([
  source("src/lib/media/preview-video-policy.ts"),
  source("src/lib/media/editorial-video.ts"),
  source("src/components/admin/GameVideoLibraryEditor.tsx"),
  source("src/components/admin/VideoTrimEditor.tsx"),
  source("src/app/api/admin/content/games/[slug]/preview-upload/route.ts"),
  source("src/app/api/admin/content/games/[slug]/preview-import/route.ts"),
  source("src/app/admin/(protected)/juegos/[slug]/page.tsx"),
  source("src/components/admin/GameMultimediaEditor.tsx"),
  source("src/components/admin/GameMediaAssignmentsWorkspace.tsx"),
  source("src/components/admin/GameGalleryMediaManager.tsx"),
  source("src/components/admin/GameMultimediaUtilityRail.tsx"),
  source("src/components/admin/GameMultimediaShell.module.css"),
]);

assert(
  has(
    policy,
    'PREVIEW_QUALITY_IDS = ["720p", "1080p"]',
    'DEFAULT_PREVIEW_QUALITY: PreviewQualityId = "1080p"',
    "PREVIEW_FPS_OPTIONS = [24, 25, 30, 50, 60]",
    "DEFAULT_PREVIEW_FPS: PreviewFps = 50",
    "MAX_PREVIEW_FPS: PreviewFps = 60",
    "parsePreviewFps"
  ) && !policy.includes('"performance",\n  "balanced",\n  "high"'),
  "La política activa debe ser 720p/1080p con 1080p50 por defecto y máximo 60 FPS."
);

assert(
  has(
    editorialVideo,
    '"720p"',
    '"1080p"',
    "probeSourceFps",
    "Math.min(requestedFps, sourceFps)",
    "effectiveFps",
    "profile.compression",
    "MAX_EDITORIAL_PREVIEW_BYTES"
  ) &&
    !editorialVideo.includes("cardQualityProfiles") &&
    !editorialVideo.includes("heroQualityProfiles"),
  "El master debe conservar resolución/FPS elegidos, no inventar cuadros y variar sólo compresión antes de fallar."
);

assert(
  has(
    videoEditor,
    "DEFAULT_PREVIEW_FPS",
    'const [fps, setFps] = useState<PreviewFps>(DEFAULT_PREVIEW_FPS)',
    '"X-Deuna-Preview-Fps": String(fps)',
    'fps: String(fps)',
    "fps={fps}",
    "onFpsChange={setFps}",
    "${fps} FPS solicitados",
    "${fps} FPS`"
  ) &&
    !videoEditor.includes("Fotogramas por segundo · máximo 60") &&
    !videoEditor.includes("setFps(Number(event.target.value) as PreviewFps)") &&
    !videoEditor.includes('"X-Deuna-Viewport-X"') &&
    !videoEditor.includes("viewportX: String(DEFAULT_PREVIEW_VIEWPORT.x)"),
  "GameVideoLibraryEditor debe tener una sola fuente de verdad para FPS y crear masters library-only sin enviar encuadres de destino."
);

const millisecondSteps = trimEditor.match(/step="0\.001"/g)?.length ?? 0;
assert(
  has(
    trimEditor,
    "PREVIEW_FPS_OPTIONS",
    "DEFAULT_PREVIEW_FPS",
    "fps: PreviewFps",
    "onFpsChange: (fps: PreviewFps) => void",
    'name="preview-fps"',
    "checked={fps === option}",
    "onChange={() => onFpsChange(option)}",
    "Resolución del master y FPS son ajustes independientes.",
    "Salida seleccionada:",
    "{quality} · {fps} FPS"
  ) &&
    millisecondSteps === 2 &&
    !trimEditor.includes("hasta {option.targetFps} FPS") &&
    !trimEditor.includes('step="0.1"\n            value={startSeconds}') &&
    !trimEditor.includes('step="0.1"\n            value={endSeconds}'),
  "VideoTrimEditor debe controlar FPS junto a resolución, no insinuarlos desde la calidad, y aceptar la precisión temporal de 1 ms que genera el propio editor."
);

assert(
  has(
    uploadRoute,
    "parsePreviewFps",
    "x-deuna-preview-fps",
    'target !== "library"',
    "legacyViewportHeadersPresent",
    "preview-fps-invalido"
  ) &&
    !uploadRoute.includes("saveGameMediaDraft") &&
    !uploadRoute.includes("withSavedGameVideoClip") &&
    has(
      importRoute,
      "parsePreviewFps",
      'target !== "library"',
      "hasExactAdminFormFields",
      "preview-fps-invalido"
    ) &&
    !importRoute.includes("saveGameMediaDraft") &&
    !importRoute.includes("withSavedGameVideoClip") &&
    !importRoute.includes("legacyFields") &&
    !importRoute.includes("targetViewportFpsFields"),
  "Crear un master debe terminar sólo en Biblioteca: upload/import no pueden asignar Hero/Card ni aceptar contratos legacy."
);

assert(
  !multimediaPage.includes("GamePreviewClipUploadForm") &&
    !multimediaPage.includes("mediaAction") &&
    !multimediaEditor.includes("mediaAction") &&
    has(
      multimediaEditor,
      "GameMediaAssignmentsWorkspace",
      "GameGalleryMediaManager",
      "GameMediaAccessibilityEditor",
      "GameMultimediaUtilityRail"
    ) &&
    !multimediaEditor.includes("GameMultimediaWorkspaceContextual"),
  "La pantalla multimedia debe usar la arquitectura dividida vigente sin wrapper/plumbing temporales."
);

assert(
  has(
    galleryManager,
    'operation: "gallery-add" | "gallery-remove" | "gallery-move"',
    'action={`/api/admin/content/games/${encodeURIComponent(slug)}/gallery-media`}',
    "Editar recorte",
    "Confirmar recorte",
    'operation === "gallery-remove"',
    "Quitar"
  ) &&
    !galleryManager.includes("media-resource-delete") &&
    !galleryManager.includes('value="image-delete"') &&
    !galleryManager.includes('value="video-delete"'),
  "Galería debe limitarse a agregar/reordenar/quitar asignaciones y editar crops, sin borrado físico."
);

assert(
  multimediaEditor.includes("shellStyles.assignmentHost") &&
    !multimediaEditor.includes("GameMultimediaLayoutRefinements.module.css") &&
    !multimediaEditor.includes("legacyWorkspaceHost") &&
    multimediaShellCss.includes(".assignmentHost") &&
    !multimediaShellCss.includes("legacyWorkspaceHost") &&
    !multimediaShellCss.includes("shared-library-heading") &&
    !multimediaShellCss.includes('class*="summaryGrid"') &&
    !multimediaShellCss.includes('class*="mainGrid"'),
  "El shell Multimedia no debe depender de ocultación o layout legacy por substrings de CSS Modules."
);

assert(
  multimediaShellCss.includes("min-height: 44px") &&
    /\.libraryDeleteButton\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s.test(multimediaShellCss) &&
    /\.galleryIconButton\s*\{[^}]*width:\s*44px;[^}]*min-height:\s*44px;/s.test(multimediaShellCss) &&
    /\.galleryDangerButton\s*\{[^}]*min-height:\s*44px;/s.test(multimediaShellCss) &&
    /\.galleryEditButton\s*\{[^}]*min-height:\s*44px;/s.test(multimediaShellCss),
  "Biblioteca, Galería y tabs de Multimedia deben conservar targets interactivos reales de al menos 44px."
);

assert(
  has(
    utilityRail,
    'resource.hygiene?.status !== "unused"',
    'action={`/api/admin/content/games/${encodeURIComponent(slug)}/media-resource-delete`}',
    'value={resource.kind === "image" ? "image-delete" : "video-delete"}',
    "Protegido",
    "Eliminar master sin uso"
  ),
  "El borrado destructivo debe permanecer en Biblioteca y sólo exponerse a masters realmente huérfanos."
);

assert(
  has(
    assignmentsWorkspace,
    "Card conserva siempre una imagen base 3:2",
    "Comparte el master, no el recorte",
    'target="card-image"',
    'target="card-video"',
    'target="cover-image"'
  ),
  "Asignaciones debe mantener master único reutilizable con crops independientes y Card 3:2 estable."
);

try {
  await access(path.join(root, "src/app/api/admin/content/games/[slug]/media/route.ts"));
  failures.push(
    "La mutación bulk multimedia legacy /games/[slug]/media volvió a aparecer aunque Biblioteca/Galería/crops son las rutas canónicas."
  );
} catch {}

try {
  await access(path.join(root, "src/app/api/admin/content/games/[slug]/preview-remove/route.ts"));
  failures.push(
    "La desasignación preview-remove legacy volvió a aparecer: las asignaciones de video deben gestionarse sólo desde Biblioteca."
  );
} catch {}

try {
  await access(path.join(root, "src/components/admin/GamePreviewClipUploadForm.tsx"));
  failures.push(
    "GamePreviewClipUploadForm.tsx volvió a aparecer aunque el editor ya usa GameVideoLibraryEditor directamente."
  );
} catch {}

try {
  await access(path.join(root, "src/components/admin/GameMultimediaWorkspaceContextual.tsx"));
  failures.push(
    "GameMultimediaWorkspaceContextual.tsx volvió a aparecer aunque la arquitectura vigente separa asignaciones, Galería y Biblioteca."
  );
} catch {}

if (failures.length) {
  console.error("\nMultimedia hardening: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Multimedia hardening: OK (1080p50 default · 60 FPS seleccionable con estado único · precisión temporal 1 ms · masters library-only · Galería no destructiva · Biblioteca con borrado seguro · mutaciones bulk/preview-remove y workspace legacy retirados)."
);
