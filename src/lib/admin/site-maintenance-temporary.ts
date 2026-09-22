import "server-only";

import { createHash } from "node:crypto";
import { lstat, readdir, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TEMPORARY_JUNK_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_DIRECTORY_ENTRIES = 4_096;
const STAGING_DIRECTORY = "deuna-preview-sources";
const STAGING_FILE_PATTERN =
  /^[a-f0-9]{48}\.(?:json|video|video\.part|proxy\.webm|proxy\.webm\.part)$/;
const STAGING_TRIM_DIRECTORY_PATTERN = /^\.trim-[A-Za-z0-9_-]{6}$/;
const TOP_LEVEL_TEMPORARY_DIRECTORY_PATTERN =
  /^deuna-(?:preview-upload|media-import-worker)-[A-Za-z0-9_-]{6}$/;

export type SiteTemporaryJunkCandidate = {
  kind: "file" | "directory";
  relativePath: string;
  bytes: number;
  mtimeMs: number;
};

export type SiteTemporaryJunkScan = {
  candidates: SiteTemporaryJunkCandidate[];
  files: number;
  directories: number;
  bytes: number;
  unexpectedEntries: string[];
  fingerprint: string;
};

export type SiteTemporaryJunkPurgeResult =
  | { outcome: "conflict"; current: SiteTemporaryJunkScan }
  | {
      outcome: "purged";
      files: number;
      directories: number;
      bytes: number;
      skipped: number;
    };

type DirectoryMeasurement = {
  bytes: number;
  newestMtimeMs: number;
};

function isMissingPath(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function isContainedBy(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function relativeLabel(root: string, candidate: string) {
  return path.relative(root, candidate).split(path.sep).join("/");
}

async function measureDirectory(
  directory: string
): Promise<DirectoryMeasurement | null> {
  let rootStats;
  try {
    rootStats = await lstat(directory);
  } catch (error) {
    if (isMissingPath(error)) return null;
    throw error;
  }

  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    return null;
  }

  let bytes = 0;
  let newestMtimeMs = rootStats.mtimeMs;
  let visited = 0;

  async function walk(current: string): Promise<boolean> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      visited += 1;
      if (visited > MAX_DIRECTORY_ENTRIES) return false;

      const entryPath = path.join(current, entry.name);
      const stats = await lstat(entryPath);
      if (stats.isSymbolicLink()) return false;

      newestMtimeMs = Math.max(newestMtimeMs, stats.mtimeMs);

      if (stats.isFile()) {
        bytes += stats.size;
        continue;
      }
      if (stats.isDirectory()) {
        if (!(await walk(entryPath))) return false;
        continue;
      }
      return false;
    }

    return true;
  }

  if (!(await walk(directory))) return null;
  return { bytes, newestMtimeMs };
}

function isOldEnough(mtimeMs: number) {
  return Date.now() - mtimeMs >= TEMPORARY_JUNK_AGE_MS;
}

function buildFingerprint(
  candidates: readonly SiteTemporaryJunkCandidate[],
  unexpectedEntries: readonly string[]
) {
  return createHash("sha256")
    .update(JSON.stringify({
      candidates: candidates.map((candidate) => [
        candidate.kind,
        candidate.relativePath,
        candidate.bytes,
        candidate.mtimeMs,
      ]),
      unexpected: [...unexpectedEntries].sort(),
    }))
    .digest("hex");
}

export async function scanSiteTemporaryJunk(
  requestedRoot = os.tmpdir()
): Promise<SiteTemporaryJunkScan> {
  const root = path.resolve(requestedRoot);

  if (root === path.parse(root).root) {
    throw new Error(
      "La raíz temporal de mantenimiento no puede ser la raíz del sistema."
    );
  }

  const rootStats = await lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(
      "La raíz temporal de mantenimiento no es un directorio seguro."
    );
  }

  const candidates: SiteTemporaryJunkCandidate[] = [];
  const unexpectedEntries: string[] = [];
  const stagingRoot = path.join(root, STAGING_DIRECTORY);

  try {
    const stagingStats = await lstat(stagingRoot);
    if (!stagingStats.isDirectory() || stagingStats.isSymbolicLink()) {
      unexpectedEntries.push(STAGING_DIRECTORY);
    } else {
      const entries = await readdir(stagingRoot, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(stagingRoot, entry.name);
        const label = relativeLabel(root, entryPath);

        if (
          entry.isFile() &&
          !entry.isSymbolicLink() &&
          STAGING_FILE_PATTERN.test(entry.name)
        ) {
          const stats = await lstat(entryPath);
          if (
            stats.isFile() &&
            !stats.isSymbolicLink() &&
            isOldEnough(stats.mtimeMs)
          ) {
            candidates.push({
              kind: "file",
              relativePath: label,
              bytes: stats.size,
              mtimeMs: stats.mtimeMs,
            });
          }
          continue;
        }

        if (
          entry.isDirectory() &&
          !entry.isSymbolicLink() &&
          STAGING_TRIM_DIRECTORY_PATTERN.test(entry.name)
        ) {
          const measured = await measureDirectory(entryPath);
          if (!measured) {
            unexpectedEntries.push(label);
          } else if (isOldEnough(measured.newestMtimeMs)) {
            candidates.push({
              kind: "directory",
              relativePath: label,
              bytes: measured.bytes,
              mtimeMs: measured.newestMtimeMs,
            });
          }
          continue;
        }

        unexpectedEntries.push(label);
      }
    }
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  const topLevelEntries = await readdir(root, { withFileTypes: true });
  for (const entry of topLevelEntries) {
    if (!TOP_LEVEL_TEMPORARY_DIRECTORY_PATTERN.test(entry.name)) continue;

    const entryPath = path.join(root, entry.name);
    const label = relativeLabel(root, entryPath);

    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      unexpectedEntries.push(label);
      continue;
    }

    const measured = await measureDirectory(entryPath);
    if (!measured) {
      unexpectedEntries.push(label);
      continue;
    }

    if (isOldEnough(measured.newestMtimeMs)) {
      candidates.push({
        kind: "directory",
        relativePath: label,
        bytes: measured.bytes,
        mtimeMs: measured.newestMtimeMs,
      });
    }
  }

  candidates.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  unexpectedEntries.sort();

  const files = candidates.filter(
    (candidate) => candidate.kind === "file"
  ).length;
  const directories = candidates.length - files;
  const bytes = candidates.reduce(
    (total, candidate) => total + candidate.bytes,
    0
  );

  return {
    candidates,
    files,
    directories,
    bytes,
    unexpectedEntries,
    fingerprint: buildFingerprint(candidates, unexpectedEntries),
  };
}

async function candidateStillMatches(
  root: string,
  candidate: SiteTemporaryJunkCandidate
) {
  const candidatePath = path.resolve(root, candidate.relativePath);
  if (!isContainedBy(root, candidatePath)) return false;

  if (candidate.kind === "file") {
    try {
      const stats = await lstat(candidatePath);
      return (
        stats.isFile() &&
        !stats.isSymbolicLink() &&
        stats.size === candidate.bytes &&
        stats.mtimeMs === candidate.mtimeMs &&
        isOldEnough(stats.mtimeMs)
      );
    } catch (error) {
      if (isMissingPath(error)) return false;
      throw error;
    }
  }

  const measured = await measureDirectory(candidatePath);
  return (
    measured !== null &&
    measured.bytes === candidate.bytes &&
    measured.newestMtimeMs === candidate.mtimeMs &&
    isOldEnough(measured.newestMtimeMs)
  );
}

async function removeCandidate(
  root: string,
  candidate: SiteTemporaryJunkCandidate
) {
  const candidatePath = path.resolve(root, candidate.relativePath);
  if (!isContainedBy(root, candidatePath)) return false;

  try {
    if (candidate.kind === "file") {
      await unlink(candidatePath);
    } else {
      await rm(candidatePath, { recursive: true });
    }
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

export async function purgeSiteTemporaryJunk(
  expectedFingerprint: string,
  requestedRoot = os.tmpdir()
): Promise<SiteTemporaryJunkPurgeResult> {
  const root = path.resolve(requestedRoot);
  const initial = await scanSiteTemporaryJunk(root);

  if (initial.fingerprint !== expectedFingerprint) {
    return { outcome: "conflict", current: initial };
  }

  let files = 0;
  let directories = 0;
  let bytes = 0;
  let skipped = 0;

  for (const candidate of initial.candidates) {
    if (!(await candidateStillMatches(root, candidate))) {
      skipped += 1;
      continue;
    }
    if (!(await removeCandidate(root, candidate))) {
      skipped += 1;
      continue;
    }

    if (candidate.kind === "file") files += 1;
    else directories += 1;
    bytes += candidate.bytes;
  }

  return {
    outcome: "purged",
    files,
    directories,
    bytes,
    skipped,
  };
}

export const SITE_TEMPORARY_JUNK_AGE_MS = TEMPORARY_JUNK_AGE_MS;
