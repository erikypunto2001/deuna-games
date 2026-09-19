import "server-only";

import {
  lstat,
  mkdir,
  readFile,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  buildEditorialMediaPublicPath,
  getEditorialMediaRoot,
  isEditorialMediaSlug,
} from "./editorial-media";
import {
  inspectSafeEditorialWebp,
  sanitizeEditorialWebp,
} from "./safe-webp";

export type EditorialMediaUploadResult = {
  publicPath: string;
  digest: string;
  bytes: number;
  reused: boolean;
};

async function assertWritableDirectory(
  directory: string,
  mode: number
) {
  await mkdir(directory, {
    recursive: true,
    mode,
  });

  const stats = await lstat(directory);

  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink()
  ) {
    throw new Error(
      "El almacén multimedia no es un directorio seguro."
    );
  }
}

function isAlreadyExistsError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

export async function storeEditorialWebp(
  slug: string,
  file: File
): Promise<EditorialMediaUploadResult> {
  if (!isEditorialMediaSlug(slug)) {
    throw new Error(
      "La identidad del juego no es válida para multimedia."
    );
  }

  if (file.type.toLowerCase() !== "image/webp") {
    throw new Error(
      "La carga editorial sólo acepta WebP."
    );
  }

  const input = Buffer.from(
    await file.arrayBuffer()
  );
  const buffer = sanitizeEditorialWebp(input);

  if (!buffer) {
    throw new Error(
      "El WebP no pudo normalizarse al formato multimedia seguro."
    );
  }

  const inspection =
    inspectSafeEditorialWebp(buffer);

  if (!inspection) {
    throw new Error(
      "El WebP no cumple el formato multimedia seguro."
    );
  }

  const filename = `${inspection.digest}.webp`;
  const root = getEditorialMediaRoot();
  const gameDirectory = path.join(root, slug);
  const filePath = path.join(
    gameDirectory,
    filename
  );

  await assertWritableDirectory(root, 0o750);
  await assertWritableDirectory(
    gameDirectory,
    0o750
  );

  let reused = false;

  try {
    await writeFile(filePath, buffer, {
      flag: "wx",
      mode: 0o640,
    });
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    const stats = await lstat(filePath);

    if (
      !stats.isFile() ||
      stats.isSymbolicLink()
    ) {
      throw new Error(
        "La ruta multimedia existente no es un archivo seguro."
      );
    }

    const existing = await readFile(filePath);
    const existingInspection =
      inspectSafeEditorialWebp(existing);

    if (
      !existingInspection ||
      existingInspection.digest !==
        inspection.digest
    ) {
      throw new Error(
        "El archivo multimedia existente no coincide con su hash."
      );
    }

    if (slug === "site-backgrounds") {
      const now = new Date();
      await utimes(filePath, now, now);
    }

    reused = true;
  }

  return {
    publicPath: buildEditorialMediaPublicPath(
      slug,
      filename
    ),
    digest: inspection.digest,
    bytes: inspection.bytes,
    reused,
  };
}
