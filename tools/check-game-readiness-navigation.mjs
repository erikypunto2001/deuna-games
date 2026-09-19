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

const files = Object.fromEntries(
  await Promise.all(
    Object.entries({
      flow: "src/lib/admin/game-editor-flow.ts",
      readiness: "src/lib/admin/game-publication-readiness.ts",
      health: "src/components/admin/GameEditorHealthOverview.tsx",
      publication: "src/components/admin/GamePublicationWorkspace.tsx",
      assignments: "src/components/admin/GameMediaAssignmentsWorkspace.tsx",
      detail: "src/components/admin/GameDetailMediaEditor.tsx",
      background: "src/components/admin/GameBackgroundMediaEditor.tsx",
      gallery: "src/components/admin/GameGalleryMediaManager.tsx",
      accessibility: "src/components/admin/GameMediaAccessibilityEditor.tsx",
    }).map(async ([key, file]) => [key, await source(file)])
  )
);

for (const anchor of [
  "cover-crop",
  "hero-crop",
  "card-crop",
  "detail-container-media",
  "background-media",
  "gallery-minimum",
  "media-accessibility",
]) {
  assert(
    files.flow.includes(`"${anchor}"`),
    `El destino editorial compartido debe conocer #${anchor}.`
  );
}

assert(
  has(
    files.flow,
    "export function gameEditorReadinessTarget(",
    'section === "multimedia"',
    "multimediaReadinessAnchors.has(readinessId)",
    "encodeURIComponent(slug)"
  ),
  "El editor debe construir los destinos de readiness desde un único helper y añadir hash sólo a controles Multimedia conocidos."
);

assert(
  files.readiness.includes(
    "export type GameReadinessSection = GameEditorSection;"
  ) &&
    files.readiness.includes(
      'from "@/lib/admin/game-editor-flow";'
    ),
  "Readiness y navegación deben compartir el tipo canónico de secciones del editor."
);

for (const [label, file] of [
  ["Estado del juego", files.health],
  ["Publicación", files.publication],
]) {
  assert(
    file.includes("gameEditorReadinessTarget") &&
      file.includes(
        "gameEditorReadinessTarget(slug, item.section, item.id)"
      ),
    `${label} debe enlazar cada control a su destino editorial exacto.`
  );
}

assert(
  has(
    files.assignments,
    'id="cover-crop"',
    'id="hero-crop"',
    'id="card-crop"',
    "useSyncExternalStore",
    "LOCATION_HASH_SYNC_EVENT",
    "window.history.replaceState",
    "clearReadinessHash",
    "onClose={closeEditing}"
  ) &&
    !files.assignments.includes("editingOverride"),
  "Portada/Hero/Card deben aceptar deep-link, abrir el editor y limpiar el hash al cerrar para permitir reabrir el mismo control."
);

assert(
  files.detail.includes('id="detail-container-media"') &&
    files.background.includes('id="background-media"') &&
    files.gallery.includes('id="gallery-minimum"'),
  "Contenedor, Fondo y Galería deben exponer anchors estables para los controles de readiness."
);

const accessibilityAnchors =
  files.accessibility.match(/id="media-accessibility"/g)?.length ?? 0;
assert(
  accessibilityAnchors === 4,
  "Accesibilidad debe conservar el mismo anchor en loading, error, stale y editor listo."
);

if (failures.length > 0) {
  console.error("\nNavegación de readiness: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Navegación de readiness: OK (secciones compartidas, anchors Multimedia completos y recortes reabribles por hash)."
);
