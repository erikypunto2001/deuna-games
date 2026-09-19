import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { Pool } from "pg";

import {
  getAdminDatabaseConfig,
} from "../../src/lib/admin/database-config.ts";
import {
  getEditorialMediaRoot,
} from "../../src/lib/media/editorial-media.ts";
import {
  SITE_BRAND_LOGO_SLUG,
  siteBrandLogoAssetPattern,
} from "../../src/lib/site/logo.ts";

const APPLY_FLAG = "--apply";
const SELF_TEST_FLAG = "--self-test";
const apply = process.argv.includes(APPLY_FLAG);
const selfTest = process.argv.includes(SELF_TEST_FLAG);
const MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1_000;
const TAXONOMY_ICON_SLUG = "taxonomy-icons";
const taxonomyIconAssetPattern =
  /^\/media\/editorial\/taxonomy-icons\/[a-f0-9]{64}\.(?:svg|webp)$/;
const taxonomyFilenamePattern =
  /^[a-f0-9]{64}\.(?:svg|webp)$/;
const siteLogoFilenamePattern =
  /^[a-f0-9]{64}\.(?:svg|png|jpg|webp|gif)$/;

type PayloadRow = {
  payload: unknown;
};

type NamespaceDefinition = {
  slug: string;
  filenamePattern: RegExp;
};

type Candidate = {
  publicPath: string;
  filePath: string;
  bytes: number;
  mtimeMs: number;
};

type ScanResult = {
  orphaned: Candidate[];
  recentUnreferenced: Candidate[];
  unexpected: string[];
};

const namespaces: NamespaceDefinition[] = [
  {
    slug: TAXONOMY_ICON_SLUG,
    filenamePattern: taxonomyFilenamePattern,
  },
  {
    slug: SITE_BRAND_LOGO_SLUG,
    filenamePattern: siteLogoFilenamePattern,
  },
];

function isMissingPathError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function collectProtectedReferences(
  value: unknown,
  references: Set<string>
) {
  if (typeof value === "string") {
    if (
      taxonomyIconAssetPattern.test(value) ||
      siteBrandLogoAssetPattern.test(value)
    ) {
      references.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectProtectedReferences(entry, references);
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const entry of Object.values(value)) {
    collectProtectedReferences(entry, references);
  }
}

async function loadProtectedReferences(pool: Pool) {
  const result = await pool.query<PayloadRow>(
    `WITH managed_items AS (
       SELECT
         item.id,
         item.source_payload,
         item.draft_payload,
         item.published_payload
       FROM deuna_admin.editorial_items AS item
       WHERE
         (item.item_type = 'site_config' AND item.item_key = 'site')
         OR
         (item.item_type = 'game_taxonomy' AND item.item_key = 'games')
     )
     SELECT item.source_payload AS payload
       FROM managed_items AS item
      WHERE item.source_payload IS NOT NULL
     UNION ALL
     SELECT item.draft_payload AS payload
       FROM managed_items AS item
      WHERE item.draft_payload IS NOT NULL
     UNION ALL
     SELECT item.published_payload AS payload
       FROM managed_items AS item
      WHERE item.published_payload IS NOT NULL
     UNION ALL
     SELECT revision.payload
       FROM deuna_admin.editorial_revisions AS revision
       INNER JOIN managed_items AS item
         ON item.id = revision.item_id
     UNION ALL
     SELECT publication.payload
       FROM deuna_admin.editorial_publications AS publication
       INNER JOIN managed_items AS item
         ON item.id = publication.item_id`
  );

  const references = new Set<string>();

  for (const row of result.rows) {
    collectProtectedReferences(row.payload, references);
  }

  return references;
}

async function assertSafeDirectory(directory: string) {
  try {
    const stats = await lstat(directory);

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(
        `La ruta multimedia no es un directorio regular seguro: ${directory}`
      );
    }

    return true;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

async function scanNamespace(
  root: string,
  definition: NamespaceDefinition,
  protectedReferences: Set<string>
): Promise<ScanResult> {
  const directory = path.join(root, definition.slug);
  const exists = await assertSafeDirectory(directory);

  if (!exists) {
    return {
      orphaned: [],
      recentUnreferenced: [],
      unexpected: [],
    };
  }

  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const now = Date.now();
  const orphaned: Candidate[] = [];
  const recentUnreferenced: Candidate[] = [];
  const unexpected: string[] = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);

    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      !definition.filenamePattern.test(entry.name)
    ) {
      unexpected.push(filePath);
      continue;
    }

    const stats = await lstat(filePath);

    if (!stats.isFile() || stats.isSymbolicLink()) {
      unexpected.push(filePath);
      continue;
    }

    const publicPath =
      `/media/editorial/${definition.slug}/${entry.name}`;

    if (protectedReferences.has(publicPath)) {
      continue;
    }

    const candidate = {
      publicPath,
      filePath,
      bytes: stats.size,
      mtimeMs: stats.mtimeMs,
    };

    if (now - stats.mtimeMs < MIN_ORPHAN_AGE_MS) {
      recentUnreferenced.push(candidate);
    } else {
      orphaned.push(candidate);
    }
  }

  return {
    orphaned,
    recentUnreferenced,
    unexpected,
  };
}

function totalBytes(candidates: Candidate[]) {
  return candidates.reduce(
    (total, candidate) => total + candidate.bytes,
    0
  );
}

async function deleteCandidate(
  candidate: Candidate,
  protectedReferences: Set<string>
) {
  if (protectedReferences.has(candidate.publicPath)) {
    return false;
  }

  let stats;

  try {
    stats = await lstat(candidate.filePath);
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }

  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size !== candidate.bytes ||
    stats.mtimeMs !== candidate.mtimeMs ||
    Date.now() - stats.mtimeMs < MIN_ORPHAN_AGE_MS
  ) {
    return false;
  }

  await unlink(candidate.filePath);
  return true;
}

async function runSelfTest() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "deuna-media-purge-")
  );
  const namespace = namespaces[0];
  const directory = path.join(root, namespace.slug);
  const protectedName = `${"a".repeat(64)}.svg`;
  const orphanName = `${"b".repeat(64)}.webp`;
  const recentName = `${"c".repeat(64)}.svg`;
  const protectedPath =
    `/media/editorial/${namespace.slug}/${protectedName}`;
  const orphanPath =
    `/media/editorial/${namespace.slug}/${orphanName}`;

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, protectedName),
      "<svg/>"
    );
    await writeFile(
      path.join(directory, orphanName),
      "orphan"
    );
    await writeFile(
      path.join(directory, recentName),
      "<svg/>"
    );
    await writeFile(
      path.join(directory, "unexpected.txt"),
      "manual"
    );

    const old = new Date(
      Date.now() - MIN_ORPHAN_AGE_MS - 60_000
    );
    await utimes(
      path.join(directory, protectedName),
      old,
      old
    );
    await utimes(
      path.join(directory, orphanName),
      old,
      old
    );

    const references = new Set<string>([
      protectedPath,
    ]);
    const scan = await scanNamespace(
      root,
      namespace,
      references
    );

    if (
      scan.orphaned.length !== 1 ||
      scan.orphaned[0]?.publicPath !== orphanPath ||
      scan.recentUnreferenced.length !== 1 ||
      scan.unexpected.length !== 1
    ) {
      throw new Error(
        "El self-test no clasificó correctamente assets protegidos, huérfanos, recientes e inesperados."
      );
    }

    const candidate = scan.orphaned[0];

    if (
      await deleteCandidate(
        candidate,
        new Set([orphanPath])
      )
    ) {
      throw new Error(
        "El self-test borró un asset que apareció en la segunda lectura de referencias."
      );
    }

    if (
      !(await deleteCandidate(candidate, new Set()))
    ) {
      throw new Error(
        "El self-test no eliminó el huérfano elegible."
      );
    }

    try {
      await lstat(candidate.filePath);
      throw new Error(
        "El self-test dejó el huérfano físico después del borrado."
      );
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }

    const nestedReferences = new Set<string>();
    collectProtectedReferences(
      {
        logo: {
          value:
            `/media/editorial/${SITE_BRAND_LOGO_SLUG}/${"d".repeat(64)}.svg`,
        },
        icon: [protectedPath],
      },
      nestedReferences
    );

    if (
      nestedReferences.size !== 2 ||
      !nestedReferences.has(protectedPath)
    ) {
      throw new Error(
        "El self-test no protegió referencias editoriales anidadas."
      );
    }

    console.log(
      "Higiene multimedia self-test: OK (historial protegido, gracia temporal, entradas inesperadas y segunda lectura antes de borrar)."
    );
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

async function main() {
  if (selfTest) {
    await runSelfTest();
    return;
  }

  const pool = new Pool(
    getAdminDatabaseConfig("runtime")
  );

  try {
    const root = getEditorialMediaRoot();
    const rootExists = await assertSafeDirectory(root);

    if (!rootExists) {
      console.log(
        "Higiene multimedia: OK (el almacén editorial todavía no existe)."
      );
      return;
    }

    const protectedReferences =
      await loadProtectedReferences(pool);
    const scans = await Promise.all(
      namespaces.map((definition) =>
        scanNamespace(
          root,
          definition,
          protectedReferences
        )
      )
    );
    const orphaned = scans.flatMap(
      (scan) => scan.orphaned
    );
    const recentUnreferenced = scans.flatMap(
      (scan) => scan.recentUnreferenced
    );
    const unexpected = scans.flatMap(
      (scan) => scan.unexpected
    );

    console.log(
      `Higiene multimedia: huérfanos=${orphaned.length} (${totalBytes(orphaned)} bytes), recientes_sin_referencia=${recentUnreferenced.length} (${totalBytes(recentUnreferenced)} bytes), entradas_inesperadas=${unexpected.length}.`
    );

    if (unexpected.length > 0) {
      for (const filePath of unexpected) {
        console.error(
          `Entrada inesperada no eliminada automáticamente: ${filePath}`
        );
      }
      process.exitCode = 1;
    }

    if (!apply) {
      if (orphaned.length > 0) {
        console.log(
          "Modo lectura. Usa admin:purge-media-junk para eliminar únicamente assets huérfanos con más de 24 horas."
        );
      }
      return;
    }

    if (orphaned.length === 0) {
      console.log(
        "Purga multimedia: OK (no había assets huérfanos elegibles)."
      );
      return;
    }

    /*
     * Releemos referencias por candidato inmediatamente antes de borrar.
     * El período de gracia evita competir con uploads recientes; esta lectura
     * por archivo reduce además la ventana entre una nueva referencia editorial
     * y el unlink físico del asset.
     */
    let removed = 0;
    let removedBytes = 0;

    for (const candidate of orphaned) {
      const currentReferences =
        await loadProtectedReferences(pool);

      if (
        await deleteCandidate(
          candidate,
          currentReferences
        )
      ) {
        removed += 1;
        removedBytes += candidate.bytes;
      }
    }

    console.log(
      `Purga multimedia: OK (archivos=${removed}, bytes=${removedBytes}).`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "No se pudo completar la higiene multimedia."
  );
  process.exitCode = 1;
});
