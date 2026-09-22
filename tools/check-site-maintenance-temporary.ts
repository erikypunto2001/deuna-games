import { strict as assert } from "node:assert";
import {
  access,
  mkdir,
  mkdtemp,
  rm,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  purgeSiteTemporaryJunk,
  scanSiteTemporaryJunk,
} from "../src/lib/admin/site-maintenance-temporary.ts";

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const root = await mkdtemp(
  path.join(os.tmpdir(), "deuna-site-temp-check-")
);

try {
  const staging = path.join(root, "deuna-preview-sources");
  await mkdir(staging, { recursive: true });

  const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1_000);
  const oldFile = path.join(staging, "a".repeat(48) + ".video");
  const recentFile = path.join(staging, "b".repeat(48) + ".video");
  const unexpectedFile = path.join(staging, "manual-review.txt");

  await writeFile(oldFile, "old");
  await writeFile(recentFile, "recent");
  await writeFile(unexpectedFile, "manual");
  await utimes(oldFile, oldDate, oldDate);

  const trimDirectory = await mkdtemp(path.join(staging, ".trim-"));
  const trimFile = path.join(trimDirectory, "segment.webm");
  await writeFile(trimFile, "trim");
  await utimes(trimFile, oldDate, oldDate);
  await utimes(trimDirectory, oldDate, oldDate);

  const uploadDirectory = await mkdtemp(
    path.join(root, "deuna-preview-upload-")
  );
  const uploadFile = path.join(uploadDirectory, "source.video");
  await writeFile(uploadFile, "upload");
  await utimes(uploadFile, oldDate, oldDate);
  await utimes(uploadDirectory, oldDate, oldDate);

  const workerDirectory = await mkdtemp(
    path.join(root, "deuna-media-import-worker-")
  );
  const workerFile = path.join(workerDirectory, "source.video");
  await writeFile(workerFile, "worker");
  await utimes(workerFile, oldDate, oldDate);
  await utimes(workerDirectory, oldDate, oldDate);

  const scan = await scanSiteTemporaryJunk(root);
  assert.equal(scan.files, 1);
  assert.equal(scan.directories, 3);
  assert.equal(scan.candidates.length, 4);
  assert.deepEqual(scan.unexpectedEntries, [
    "deuna-preview-sources/manual-review.txt",
  ]);

  const conflict = await purgeSiteTemporaryJunk("0".repeat(64), root);
  assert.equal(conflict.outcome, "conflict");
  assert.equal(await exists(oldFile), true);

  const purged = await purgeSiteTemporaryJunk(scan.fingerprint, root);
  assert.equal(purged.outcome, "purged");
  if (purged.outcome !== "purged") {
    throw new Error("Resultado de purga inesperado.");
  }

  assert.equal(purged.files, 1);
  assert.equal(purged.directories, 3);
  assert.equal(await exists(oldFile), false);
  assert.equal(await exists(trimDirectory), false);
  assert.equal(await exists(uploadDirectory), false);
  assert.equal(await exists(workerDirectory), false);
  assert.equal(await exists(recentFile), true);
  assert.equal(await exists(unexpectedFile), true);

  const final = await scanSiteTemporaryJunk(root);
  assert.equal(final.candidates.length, 0);
  assert.equal(final.unexpectedEntries.length, 1);

  await unlink(recentFile);
  await unlink(unexpectedFile);

  console.log(
    "Mantenimiento temporal: OK (24 h, fingerprint, revalidación y entradas inesperadas preservadas)."
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
