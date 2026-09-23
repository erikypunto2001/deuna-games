import "server-only";

import { createHash } from "node:crypto";
import { lstat, readdir, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TEMPORARY_JUNK_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_DIRECTORY_ENTRIES = 4_096;
const STAGING_DIRECTORY = "deuna-preview-sources";
const STAGING_FILE_PATTERN =
  /^([a-f0-9]{48})\.(?:json|video|video\.part|proxy\.webm|proxy\.webm\.part)$/;
const STAGING_TRIM_DIRECTORY_PATTERN = /^\.trim-[A-Za-z0-9_-]{6}$/;
const PREVIEW_UPLOAD_DIRECTORY_PATTERN =
  /^deuna-preview-upload-[A-Za-z0-9_-]{6}$/;
const MEDIA_IMPORT_WORKER_DIRECTORY_PATTERN =
  /^deuna-media-import-worker-[A-Za-z0-9_-]{6}$/;

type SiteTemporaryJunkMember = {
  name: string;
  bytes: number;
  mtimeMs: number;
};

export type SiteTemporaryJunkCandidate =
  | {
      kind: "staging-group";
      relativePath: string;
      bytes: number;
      mtimeMs: number;
      files: number;
      members: SiteTemporaryJunkMember[];
    }
  | {
      kind: "directory";
      relativePath: string;
      bytes: number;
      mtimeMs: number;
      files: 0;
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

type StagingGroupMeasurement = {
  bytes: number;
  newestMtimeMs: number;
  members: SiteTemporaryJunkMember[];
};

type CandidateRemovalResult = {
  files: number;
  directories: number;
  bytes: number;
  skipped: number;
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

async function measureStagingGroup(
  stagingRoot: string,
  token: string
): Promise<StagingGroupMeasurement | null> {
  const entries = await readdir(stagingRoot, { withFileTypes: true });
  const members: SiteTemporaryJunkMember[] = [];

  for (const entry of entries) {
    if (!entry.name.startsWith(token + ".")) continue;

    const match = STAGING_FILE_PATTERN.exec(entry.name);
    if (
      !match ||
      match[1] !== token ||
      !entry.isFile() ||
      entry.isSymbolicLink()
    ) {
      return null;
    }

    const entryPath = path.join(stagingRoot, entry.name);
    const stats = await lstat(entryPath);
    if (!stats.isFile() || stats.isSymbolicLink()) return null;

    members.push({
      name: entry.name,
      bytes: stats.size,
      mtimeMs: stats.mtimeMs,
    });
  }

  if (members.length === 0) return null;

  members.sort((left, right) => left.name.localeCompare(right.name));

  return {
    bytes: members.reduce((total, member) => total + member.bytes, 0),
    newestMtimeMs: Math.max(...members.map((member) => member.mtimeMs)),
    members,
  };
}

function sameMembers(
  left: readonly SiteTemporaryJunkMember[],
  right: readonly SiteTemporaryJunkMember[]
) {
  if (left.length !== right.length) return false;

  return left.every((member, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      member.name === other.name &&
      member.bytes === other.bytes &&
      member.mtimeMs === other.mtimeMs
    );
  });
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
        candidate.files,
        candidate.kind === "staging-group"
          ? candidate.members.map((member) => [
              member.name,
              member.bytes,
              member.mtimeMs,
            ])
          : [],
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
      const stagingTokens = new Set<string>();

      for (const entry of entries) {
        const entryPath = path.join(stagingRoot, entry.name);
        const label = relativeLabel(root, entryPath);
        const match = STAGING_FILE_PATTERN.exec(entry.name);

        if (
          match &&
          entry.isFile() &&
          !entry.isSymbolicLink()
        ) {
          const stats = await lstat(entryPath);
          if (!stats.isFile() || stats.isSymbolicLink()) {
            unexpectedEntries.push(label);
            continue;
          }
          stagingTokens.add(match[1]!);
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
              files: 0,
            });
          }
          continue;
        }

        unexpectedEntries.push(label);
      }

      for (const token of stagingTokens) {
        const measured = await measureStagingGroup(stagingRoot, token);
        if (!measured) {
          unexpectedEntries.push(
            relativeLabel(root, path.join(stagingRoot, token))
          );
          continue;
        }

        if (isOldEnough(measured.newestMtimeMs)) {
          candidates.push({
            kind: "staging-group",
            relativePath: relativeLabel(
              root,
              path.join(stagingRoot, token)
            ),
            bytes: measured.bytes,
            mtimeMs: measured.newestMtimeMs,
            files: measured.members.length,
            members: measured.members,
          });
        }
      }
    }
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  const topLevelEntries = await readdir(root, { withFileTypes: true });
  for (const entry of topLevelEntries) {
    if (
      !PREVIEW_UPLOAD_DIRECTORY_PATTERN.test(entry.name) &&
      !MEDIA_IMPORT_WORKER_DIRECTORY_PATTERN.test(entry.name)
    ) {
      continue;
    }

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
        files: 0,
      });
    }
  }

  candidates.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  unexpectedEntries.sort();

  const files = candidates.reduce(
    (total, candidate) => total + candidate.files,
    0
  );
  const directories = candidates.filter(
    (candidate) => candidate.kind === "directory"
  ).length;
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
  if (candidate.kind === "staging-group") {
    const stagingRoot = path.join(root, STAGING_DIRECTORY);
    const token = path.basename(candidate.relativePath);
    const measured = await measureStagingGroup(stagingRoot, token);

    return (
      measured !== null &&
      measured.bytes === candidate.bytes &&
      measured.newestMtimeMs === candidate.mtimeMs &&
      sameMembers(measured.members, candidate.members) &&
      isOldEnough(measured.newestMtimeMs)
    );
  }

  const candidatePath = path.resolve(root, candidate.relativePath);
  if (!isContainedBy(root, candidatePath)) return false;

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
): Promise<CandidateRemovalResult> {
  if (candidate.kind === "staging-group") {
    const stagingRoot = path.join(root, STAGING_DIRECTORY);

    for (const member of candidate.members) {
      const memberPath = path.join(stagingRoot, member.name);
      if (!isContainedBy(stagingRoot, memberPath)) {
        return { files: 0, directories: 0, bytes: 0, skipped: 1 };
      }

      try {
        const stats = await lstat(memberPath);
        if (
          !stats.isFile() ||
          stats.isSymbolicLink() ||
          stats.size !== member.bytes ||
          stats.mtimeMs !== member.mtimeMs ||
          !isOldEnough(stats.mtimeMs)
        ) {
          return { files: 0, directories: 0, bytes: 0, skipped: 1 };
        }
      } catch (error) {
        if (isMissingPath(error)) {
          return { files: 0, directories: 0, bytes: 0, skipped: 1 };
        }
        throw error;
      }
    }

    let files = 0;
    let bytes = 0;
    let skipped = 0;

    for (const member of candidate.members) {
      try {
        await unlink(path.join(stagingRoot, member.name));
        files += 1;
        bytes += member.bytes;
      } catch (error) {
        skipped += 1;
        if (!isMissingPath(error)) continue;
      }
    }

    return { files, directories: 0, bytes, skipped };
  }

  const candidatePath = path.resolve(root, candidate.relativePath);
  if (!isContainedBy(root, candidatePath)) {
    return { files: 0, directories: 0, bytes: 0, skipped: 1 };
  }

  try {
    const stats = await lstat(candidatePath);
    if (
      !stats.isDirectory() ||
      stats.isSymbolicLink() ||
      stats.mtimeMs !== candidate.mtimeMs
    ) {
      return { files: 0, directories: 0, bytes: 0, skipped: 1 };
    }

    await rm(candidatePath, { recursive: true });
    return {
      files: 0,
      directories: 1,
      bytes: candidate.bytes,
      skipped: 0,
    };
  } catch (error) {
    if (isMissingPath(error)) {
      return { files: 0, directories: 0, bytes: 0, skipped: 1 };
    }
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
    try {
      if (!(await candidateStillMatches(root, candidate))) {
        skipped += 1;
        continue;
      }

      const removed = await removeCandidate(root, candidate);
      files += removed.files;
      directories += removed.directories;
      bytes += removed.bytes;
      skipped += removed.skipped;
    } catch {
      skipped += 1;
    }
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
