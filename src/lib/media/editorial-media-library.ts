import "server-only";

import {
  lstat,
  readFile,
  readdir,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  buildEditorialMediaPublicPath,
  getEditorialMediaRoot,
  isEditorialMediaSlug,
  resolveEditorialMediaDiskPath,
} from "./editorial-media";
import {
  inspectSafeEditorialWebm,
  MAX_EDITORIAL_PREVIEW_BYTES,
} from "./safe-webm";
import {
  inspectSafeEditorialWebp,
  MAX_EDITORIAL_IMAGE_BYTES,
} from "./safe-webp";

export type EditorialMediaLibraryImage = {
  kind: "image";
  origin: "editorial" | "bundled";
  src: string;
  digest: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
};

export type EditorialMediaLibraryVideo = {
  kind: "video";
  origin: "editorial";
  src: string;
  digest: string;
  bytes: number;
};

export type EditorialMediaLibraryResource =
  | EditorialMediaLibraryImage
  | EditorialMediaLibraryVideo;

type EditorialDeletableResource = EditorialMediaLibraryResource;

const MEDIA_FILENAME = /^([a-f0-9]{64})\.(webp|webm)$/;
const DELETE_MARKER = /^\.delete-([a-f0-9]{64}\.(?:webp|webm))$/;
const BUNDLED_IMAGE_PATTERN =
  /^\/images\/[A-Za-z0-9/_.,@+() -]+\.(?:avif|gif|jpe?g|png|webp)$/i;
const MAX_LIBRARY_RESOURCES = 80;

function hasErrorCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function isMissingPath(error: unknown) {
  return hasErrorCode(error, "ENOENT");
}

function isContainedBy(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    )
  );
}

function resolveBundledImagePath(publicPath: string) {
  if (
    !BUNDLED_IMAGE_PATTERN.test(publicPath) ||
    publicPath.includes("\\") ||
    publicPath.includes("//") ||
    publicPath
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  const publicRoot = path.resolve(process.cwd(), "public");
  const imagesRoot = path.resolve(publicRoot, "images");
  const filePath = path.resolve(publicRoot, `.${publicPath}`);

  return isContainedBy(imagesRoot, filePath)
    ? filePath
    : null;
}

function resolveEditorialResource(
  slug: string,
  resource: EditorialMediaLibraryResource
) {
  if (
    !isEditorialMediaSlug(slug) ||
    resource.origin !== "editorial" ||
    typeof resource.digest !== "string"
  ) {
    return null;
  }

  const extension = resource.kind === "image" ? "webp" : "webm";
  const resolved = resolveEditorialMediaDiskPath(resource.src);
  if (
    !resolved ||
    resolved.slug !== slug ||
    resolved.filename !== `${resource.digest}.${extension}` ||
    buildEditorialMediaPublicPath(slug, resolved.filename) !== resource.src
  ) {
    return null;
  }

  return resolved;
}

function deletionMarkerPath(
  gameDirectory: string,
  filename: string
) {
  return path.join(
    gameDirectory,
    `.delete-${filename}`
  );
}

async function isSafeDeletionMarker(markerPath: string) {
  try {
    const stats = await lstat(markerPath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

async function removeDeletionMarker(markerPath: string) {
  if (!(await isSafeDeletionMarker(markerPath))) return;

  try {
    await unlink(markerPath);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }
}

async function inspectEditorialResourceFile(
  filePath: string,
  expectedDigest: string,
  kind: "image" | "video"
) {
  let stats;

  try {
    stats = await lstat(filePath);
  } catch (error) {
    if (isMissingPath(error)) return null;
    throw error;
  }

  const maximumBytes = kind === "image"
    ? MAX_EDITORIAL_IMAGE_BYTES
    : MAX_EDITORIAL_PREVIEW_BYTES;
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size <= 0 ||
    stats.size > maximumBytes
  ) {
    throw new Error(
      "El recurso editorial no supera la validación previa a su eliminación."
    );
  }

  const buffer = await readFile(filePath);
  const inspection = kind === "image"
    ? inspectSafeEditorialWebp(buffer)
    : inspectSafeEditorialWebm(buffer);

  if (!inspection || inspection.digest !== expectedDigest) {
    throw new Error(
      `El ${kind === "image" ? "WebP" : "WebM"} editorial cambió desde que fue validado por la biblioteca.`
    );
  }

  return inspection;
}

async function deleteValidatedEditorialResource(
  slug: string,
  filename: string
) {
  const match = MEDIA_FILENAME.exec(filename);
  if (!match) {
    throw new Error("Nombre editorial no válido para eliminación.");
  }

  const digest = match[1]!;
  const kind = match[2] === "webp" ? "image" : "video";
  const publicPath = buildEditorialMediaPublicPath(slug, filename);
  const resolved = resolveEditorialMediaDiskPath(publicPath);

  if (
    !resolved ||
    resolved.slug !== slug ||
    resolved.filename !== filename
  ) {
    throw new Error("Ruta editorial no válida para eliminación.");
  }

  const markerPath = deletionMarkerPath(
    resolved.gameDirectory,
    resolved.filename
  );
  const inspection = await inspectEditorialResourceFile(
    resolved.filePath,
    digest,
    kind
  );

  if (inspection) {
    try {
      await unlink(resolved.filePath);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
    }
  }

  await removeDeletionMarker(markerPath);
}

export async function clearEditorialMediaDeletionMarker(
  slug: string,
  publicPath: string
) {
  if (!isEditorialMediaSlug(slug)) return;

  const resolved = resolveEditorialMediaDiskPath(publicPath);
  if (
    !resolved ||
    resolved.slug !== slug ||
    !MEDIA_FILENAME.test(resolved.filename)
  ) {
    return;
  }

  await removeDeletionMarker(
    deletionMarkerPath(
      resolved.gameDirectory,
      resolved.filename
    )
  );
}

export async function reconcileEditorialMediaDeletions(
  slug: string,
  draftReferences: readonly string[],
  publishedReferences: readonly string[]
) {
  if (!isEditorialMediaSlug(slug)) {
    throw new Error("La identidad del juego no es válida para multimedia.");
  }

  const draft = new Set(draftReferences);
  const published = new Set(publishedReferences);

  for (const publicPath of draft) {
    await clearEditorialMediaDeletionMarker(slug, publicPath);
  }

  const directory = path.join(getEditorialMediaRoot(), slug);
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) return;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = DELETE_MARKER.exec(entry.name);
    if (!match) continue;

    const filename = match[1]!;
    const publicPath = buildEditorialMediaPublicPath(slug, filename);
    const markerPath = path.join(directory, entry.name);

    if (!(await isSafeDeletionMarker(markerPath))) continue;

    if (draft.has(publicPath)) {
      await removeDeletionMarker(markerPath);
      continue;
    }

    if (published.has(publicPath)) continue;

    await deleteValidatedEditorialResource(slug, filename);
  }
}

export async function markEditorialMediaForDeletion(
  slug: string,
  resource: EditorialMediaLibraryResource
) {
  const resolved = resolveEditorialResource(slug, resource);
  if (!resolved || !resource.digest) {
    throw new Error("El recurso no pertenece al almacén editorial del juego.");
  }

  const inspection = await inspectEditorialResourceFile(
    resolved.filePath,
    resource.digest,
    resource.kind
  );
  if (!inspection) return "missing" as const;

  const markerPath = deletionMarkerPath(
    resolved.gameDirectory,
    resolved.filename
  );

  if (await isSafeDeletionMarker(markerPath)) {
    return "marked" as const;
  }

  try {
    await writeFile(
      markerPath,
      `${resource.digest}\n`,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      }
    );
  } catch (error) {
    if (
      hasErrorCode(error, "EEXIST") &&
      await isSafeDeletionMarker(markerPath)
    ) {
      return "marked" as const;
    }
    throw error;
  }

  return "marked" as const;
}

export async function deleteEditorialMediaResource(
  slug: string,
  resource: EditorialMediaLibraryResource
) {
  const resolved = resolveEditorialResource(slug, resource);
  if (!resolved || !resource.digest) {
    throw new Error("El recurso no pertenece al almacén editorial del juego.");
  }

  await deleteValidatedEditorialResource(
    slug,
    resolved.filename
  );

  return "deleted" as const;
}


export type EditorialMediaDeletionInventory = {
  resources: number;
  unrecognizedEntries: number;
};

export async function inspectEditorialMediaDeletionInventory(
  slug: string
): Promise<EditorialMediaDeletionInventory> {
  if (!isEditorialMediaSlug(slug)) {
    throw new Error("La identidad del juego no es válida para multimedia.");
  }

  const directory = path.join(getEditorialMediaRoot(), slug);
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) {
      return { resources: 0, unrecognizedEntries: 0 };
    }
    throw error;
  }

  let resources = 0;
  let unrecognizedEntries = 0;

  for (const entry of entries) {
    if (entry.isFile() && MEDIA_FILENAME.test(entry.name)) {
      resources += 1;
      continue;
    }

    if (entry.isFile() && DELETE_MARKER.test(entry.name)) {
      continue;
    }

    unrecognizedEntries += 1;
  }

  return { resources, unrecognizedEntries };
}

export async function deleteAllEditorialMediaResources(
  slug: string
) {
  const inventory =
    await inspectEditorialMediaDeletionInventory(slug);

  if (inventory.unrecognizedEntries > 0) {
    throw new Error(
      "El namespace multimedia contiene entradas no reconocidas y no puede limpiarse automáticamente."
    );
  }

  const directory = path.join(getEditorialMediaRoot(), slug);
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) return 0;
    throw error;
  }

  const filenames = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        MEDIA_FILENAME.test(entry.name)
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  let deleted = 0;

  for (const filename of filenames) {
    await deleteValidatedEditorialResource(
      slug,
      filename
    );
    deleted += 1;
  }

  for (const entry of entries) {
    if (
      entry.isFile() &&
      DELETE_MARKER.test(entry.name)
    ) {
      await removeDeletionMarker(
        path.join(directory, entry.name)
      );
    }
  }

  const remaining = await readdir(directory, {
    withFileTypes: true,
  });

  if (remaining.length !== 0) {
    throw new Error(
      "El namespace multimedia no quedó vacío después de la limpieza exhaustiva."
    );
  }

  try {
    await rmdir(directory);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  return deleted;
}

// Alias de compatibilidad para rutas y checkers que todavía expresan la
// operación en términos de imagen. Toda la seguridad física vive arriba.
export async function clearEditorialImageDeletionMarker(
  slug: string,
  publicPath: string
) {
  const resolved = resolveEditorialMediaDiskPath(publicPath);
  if (!resolved?.filename.endsWith(".webp")) return;
  await clearEditorialMediaDeletionMarker(slug, publicPath);
}

export async function reconcileEditorialImageDeletions(
  slug: string,
  draftReferences: readonly string[],
  publishedReferences: readonly string[]
) {
  await reconcileEditorialMediaDeletions(
    slug,
    draftReferences,
    publishedReferences
  );
}

export async function markEditorialImageForDeletion(
  slug: string,
  resource: EditorialMediaLibraryImage
) {
  if (resource.origin !== "editorial") {
    throw new Error("La imagen no pertenece al almacén editorial del juego.");
  }
  return markEditorialMediaForDeletion(slug, resource as EditorialDeletableResource);
}

export async function deleteEditorialImageResource(
  slug: string,
  resource: EditorialMediaLibraryImage
) {
  if (resource.origin !== "editorial") {
    throw new Error("La imagen no pertenece al almacén editorial del juego.");
  }
  return deleteEditorialMediaResource(slug, resource as EditorialDeletableResource);
}

export async function listEditorialMediaLibrary(
  slug: string
): Promise<EditorialMediaLibraryResource[]> {
  if (!isEditorialMediaSlug(slug)) {
    throw new Error("La identidad del juego no es válida para multimedia.");
  }

  const directory = path.join(getEditorialMediaRoot(), slug);
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) return [];
    throw error;
  }

  const candidates = entries
    .filter((entry) => entry.isFile() && MEDIA_FILENAME.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_LIBRARY_RESOURCES);
  const resources: EditorialMediaLibraryResource[] = [];

  for (const entry of candidates) {
    const match = MEDIA_FILENAME.exec(entry.name);
    if (!match) continue;

    const filePath = path.join(directory, entry.name);
    const stats = await lstat(filePath);
    const maximumBytes =
      match[2] === "webp"
        ? MAX_EDITORIAL_IMAGE_BYTES
        : MAX_EDITORIAL_PREVIEW_BYTES;
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.size <= 0 ||
      stats.size > maximumBytes
    ) {
      continue;
    }

    if (
      await isSafeDeletionMarker(
        deletionMarkerPath(directory, entry.name)
      )
    ) {
      continue;
    }

    const buffer = await readFile(filePath);
    const publicPath = buildEditorialMediaPublicPath(slug, entry.name);

    if (match[2] === "webp") {
      const inspection = inspectSafeEditorialWebp(buffer);
      if (!inspection || inspection.digest !== match[1]) continue;
      resources.push({
        kind: "image",
        origin: "editorial",
        src: publicPath,
        digest: inspection.digest,
        bytes: inspection.bytes,
        width: inspection.width,
        height: inspection.height,
      });
      continue;
    }

    const inspection = inspectSafeEditorialWebm(buffer);
    if (!inspection || inspection.digest !== match[1]) continue;
    resources.push({
      kind: "video",
      origin: "editorial",
      src: publicPath,
      digest: inspection.digest,
      bytes: inspection.bytes,
    });
  }

  return resources;
}

export async function listAssignedBundledImageResources(
  mediaPaths: readonly (string | null | undefined)[]
): Promise<EditorialMediaLibraryImage[]> {
  const resources: EditorialMediaLibraryImage[] = [];

  for (const publicPath of new Set(mediaPaths.filter(
    (value): value is string => Boolean(value)
  ))) {
    const filePath = resolveBundledImagePath(publicPath);
    if (!filePath) continue;

    try {
      const stats = await lstat(filePath);
      if (
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        stats.size <= 0
      ) {
        continue;
      }

      resources.push({
        kind: "image",
        origin: "bundled",
        src: publicPath,
        digest: null,
        bytes: stats.size,
        width: null,
        height: null,
      });
    } catch {
      // Un asset histórico faltante no debe romper Multimedia: la publicación
      // conserva su propia validación de integridad y aquí simplemente no se
      // ofrece como recurso reutilizable.
    }
  }

  return resources;
}

export function mergeEditorialMediaResources(
  ...groups: readonly (readonly EditorialMediaLibraryResource[])[]
) {
  const resources = new Map<string, EditorialMediaLibraryResource>();

  for (const group of groups) {
    for (const resource of group) {
      if (!resources.has(resource.src)) {
        resources.set(resource.src, resource);
      }
    }
  }

  return [...resources.values()];
}

export function findEditorialMediaResource(
  resources: readonly EditorialMediaLibraryResource[],
  src: string,
  kind?: EditorialMediaLibraryResource["kind"]
) {
  return resources.find(
    (resource) => resource.src === src && (!kind || resource.kind === kind)
  );
}
