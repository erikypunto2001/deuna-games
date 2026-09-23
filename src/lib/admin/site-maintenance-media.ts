import "server-only";

import {
  createHash,
} from "node:crypto";
import {
  lstat,
  readdir,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  adminQuery,
} from "@/lib/admin/database";
import {
  deleteEditorialMediaResourceByPublicPath,
} from "@/lib/media/editorial-media-library";
import {
  buildEditorialMediaPublicPath,
  getEditorialMediaRoot,
  parseEditorialMediaPublicPath,
} from "@/lib/media/editorial-media";
import {
  TAXONOMY_ICON_SLUG,
  taxonomyIconAssetPattern,
} from "@/lib/media/taxonomy-icon-policy";
import {
  SITE_BACKGROUND_MEDIA_SLUG,
  siteBackgroundAssetPattern,
} from "@/lib/site/backgrounds";
import {
  SITE_BRAND_LOGO_SLUG,
  siteBrandLogoAssetPattern,
} from "@/lib/site/logo";

const MIN_ORPHAN_AGE_MS =
  24 * 60 * 60 * 1_000;
const GAME_MEDIA_FILENAME =
  /^[a-f0-9]{64}\.(?:webp|webm)$/;
const GAME_DELETE_MARKER =
  /^\.delete-([a-f0-9]{64}\.(?:webp|webm))$/;

type PayloadRow = {
  payload: unknown;
};

type GameSlugRow = {
  item_key: string;
};

export type SiteMediaJunkCandidate = {
  scope: "game" | "global";
  slug: string;
  filename: string;
  publicPath: string;
  bytes: number;
  mtimeMs: number;
};

export type SiteMediaStaleMarker = {
  slug: string;
  filename: string;
  mtimeMs: number;
};

export type SiteMediaUnexpectedEntry = {
  namespace: string;
  name: string;
};

export type SiteMediaJunkScan = {
  orphaned: SiteMediaJunkCandidate[];
  recentUnreferenced: SiteMediaJunkCandidate[];
  staleMarkers: SiteMediaStaleMarker[];
  emptyNamespaces: string[];
  unknownNamespaces: string[];
  unexpectedEntries: SiteMediaUnexpectedEntry[];
  protectedReferences: number;
  activeGames: number;
  fingerprint: string;
};

export type SiteMediaPurgeResult =
  | {
      outcome: "conflict";
      current: SiteMediaJunkScan;
    }
  | {
      outcome: "purged";
      files: number;
      bytes: number;
      markers: number;
      directories: number;
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

async function assertSafeDirectory(
  directory: string
) {
  try {
    const stats = await lstat(directory);
    if (
      !stats.isDirectory() ||
      stats.isSymbolicLink()
    ) {
      throw new Error(
        "El almacén multimedia no es un directorio regular seguro."
      );
    }
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

function collectMediaReferences(
  value: unknown,
  references: Set<string>
) {
  if (typeof value === "string") {
    if (parseEditorialMediaPublicPath(value)) {
      references.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectMediaReferences(entry, references);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const entry of Object.values(value)) {
    collectMediaReferences(entry, references);
  }
}

async function loadProtectedReferences() {
  const result = await adminQuery<PayloadRow>(
    `WITH payloads AS (
       SELECT source_payload AS payload
         FROM deuna_admin.editorial_items
        WHERE source_payload IS NOT NULL
       UNION ALL
       SELECT draft_payload
         FROM deuna_admin.editorial_items
        WHERE draft_payload IS NOT NULL
       UNION ALL
       SELECT published_payload
         FROM deuna_admin.editorial_items
        WHERE published_payload IS NOT NULL
       UNION ALL
       SELECT revision.payload
         FROM deuna_admin.editorial_revisions AS revision
       UNION ALL
       SELECT publication.payload
         FROM deuna_admin.editorial_publications AS publication
     )
     SELECT payload
       FROM payloads`
  );
  const references = new Set<string>();

  for (const row of result.rows) {
    collectMediaReferences(
      row.payload,
      references
    );
  }

  return references;
}

async function loadActiveGameSlugs() {
  const result = await adminQuery<GameSlugRow>(
    `SELECT item_key
       FROM deuna_admin.editorial_items
      WHERE item_type = 'game'
      ORDER BY item_key`
  );

  return new Set(
    result.rows.map((row) => row.item_key)
  );
}

function isKnownGlobalNamespace(
  slug: string
) {
  return (
    slug === TAXONOMY_ICON_SLUG ||
    slug === SITE_BRAND_LOGO_SLUG ||
    slug === SITE_BACKGROUND_MEDIA_SLUG
  );
}

function isAllowedGlobalAsset(
  slug: string,
  publicPath: string
) {
  if (slug === TAXONOMY_ICON_SLUG) {
    return taxonomyIconAssetPattern.test(
      publicPath
    );
  }

  if (slug === SITE_BRAND_LOGO_SLUG) {
    return siteBrandLogoAssetPattern.test(
      publicPath
    );
  }

  if (slug === SITE_BACKGROUND_MEDIA_SLUG) {
    return siteBackgroundAssetPattern.test(
      publicPath
    );
  }

  return false;
}

function scanFingerprint(
  scan: Omit<SiteMediaJunkScan, "fingerprint">,
  pendingSlugs: readonly string[]
) {
  const stable = {
    orphaned: scan.orphaned
      .map((candidate) => [
        candidate.scope,
        candidate.slug,
        candidate.filename,
        candidate.bytes,
        candidate.mtimeMs,
      ])
      .sort(),
    recent: scan.recentUnreferenced
      .map((candidate) => [
        candidate.scope,
        candidate.slug,
        candidate.filename,
        candidate.bytes,
        candidate.mtimeMs,
      ])
      .sort(),
    markers: scan.staleMarkers
      .map((marker) => [
        marker.slug,
        marker.filename,
        marker.mtimeMs,
      ])
      .sort(),
    empty: [...scan.emptyNamespaces].sort(),
    unknown: [...scan.unknownNamespaces].sort(),
    unexpected: scan.unexpectedEntries
      .map((entry) => [
        entry.namespace,
        entry.name,
      ])
      .sort(),
    protectedReferences:
      scan.protectedReferences,
    activeGames: scan.activeGames,
    pending: [...pendingSlugs].sort(),
  };

  return createHash("sha256")
    .update(JSON.stringify(stable))
    .digest("hex");
}

export async function scanSiteMediaJunk(
  pendingSlugs: readonly string[]
): Promise<SiteMediaJunkScan> {
  const root = getEditorialMediaRoot();
  const rootExists =
    await assertSafeDirectory(root);
  const [
    protectedReferences,
    activeGames,
  ] = await Promise.all([
    loadProtectedReferences(),
    loadActiveGameSlugs(),
  ]);
  const pending = new Set(pendingSlugs);
  const orphaned: SiteMediaJunkCandidate[] = [];
  const recentUnreferenced: SiteMediaJunkCandidate[] = [];
  const staleMarkers: SiteMediaStaleMarker[] = [];
  const emptyNamespaces: string[] = [];
  const unknownNamespaces: string[] = [];
  const unexpectedEntries: SiteMediaUnexpectedEntry[] = [];

  if (!rootExists) {
    const base = {
      orphaned,
      recentUnreferenced,
      staleMarkers,
      emptyNamespaces,
      unknownNamespaces,
      unexpectedEntries,
      protectedReferences:
        protectedReferences.size,
      activeGames: activeGames.size,
    };

    return {
      ...base,
      fingerprint: scanFingerprint(
        base,
        pendingSlugs
      ),
    };
  }

  const namespaces = await readdir(root, {
    withFileTypes: true,
  });
  const now = Date.now();

  for (const namespace of namespaces) {
    if (
      !namespace.isDirectory() ||
      namespace.isSymbolicLink()
    ) {
      unexpectedEntries.push({
        namespace: "<raíz>",
        name: namespace.name,
      });
      continue;
    }

    const slug = namespace.name;

    if (pending.has(slug)) {
      continue;
    }

    const scope = isKnownGlobalNamespace(slug)
      ? "global"
      : activeGames.has(slug)
        ? "game"
        : null;

    if (!scope) {
      unknownNamespaces.push(slug);
      continue;
    }

    if (
      scope === "global" &&
      activeGames.has(slug)
    ) {
      unexpectedEntries.push({
        namespace: slug,
        name:
          "colisión entre namespace global y slug de juego",
      });
      continue;
    }

    const directory = path.join(root, slug);

    if (!(await assertSafeDirectory(directory))) {
      continue;
    }

    const entries = await readdir(directory, {
      withFileTypes: true,
    });

    if (entries.length === 0) {
      emptyNamespaces.push(slug);
      continue;
    }

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        entry.isSymbolicLink()
      ) {
        unexpectedEntries.push({
          namespace: slug,
          name: entry.name,
        });
        continue;
      }

      const filePath = path.join(
        directory,
        entry.name
      );

      if (scope === "game") {
        const markerMatch =
          GAME_DELETE_MARKER.exec(entry.name);

        if (markerMatch) {
          const targetPath = path.join(
            directory,
            markerMatch[1]!
          );
          try {
            await lstat(targetPath);
          } catch (error) {
            if (!isMissingPath(error)) {
              throw error;
            }
            const stats = await lstat(filePath);
            staleMarkers.push({
              slug,
              filename: entry.name,
              mtimeMs: stats.mtimeMs,
            });
          }
          continue;
        }
      }

      const gameAllowed =
        scope === "game" &&
        GAME_MEDIA_FILENAME.test(
          entry.name
        );
      const rawPublicPath =
        `/media/editorial/${slug}/${entry.name}`;
      const globalAllowed =
        scope === "global" &&
        isAllowedGlobalAsset(
          slug,
          rawPublicPath
        );

      if (!gameAllowed && !globalAllowed) {
        unexpectedEntries.push({
          namespace: slug,
          name: entry.name,
        });
        continue;
      }

      const publicPath =
        buildEditorialMediaPublicPath(
          slug,
          entry.name
        );

      if (
        protectedReferences.has(publicPath)
      ) {
        continue;
      }

      const stats = await lstat(filePath);

      if (
        !stats.isFile() ||
        stats.isSymbolicLink()
      ) {
        unexpectedEntries.push({
          namespace: slug,
          name: entry.name,
        });
        continue;
      }

      const candidate: SiteMediaJunkCandidate = {
        scope,
        slug,
        filename: entry.name,
        publicPath,
        bytes: stats.size,
        mtimeMs: stats.mtimeMs,
      };

      if (
        now - stats.mtimeMs <
        MIN_ORPHAN_AGE_MS
      ) {
        recentUnreferenced.push(candidate);
      } else {
        orphaned.push(candidate);
      }
    }
  }

  orphaned.sort((a, b) =>
    a.publicPath.localeCompare(b.publicPath)
  );
  recentUnreferenced.sort((a, b) =>
    a.publicPath.localeCompare(b.publicPath)
  );
  staleMarkers.sort((a, b) =>
    `${a.slug}/${a.filename}`.localeCompare(
      `${b.slug}/${b.filename}`
    )
  );
  emptyNamespaces.sort();
  unknownNamespaces.sort();
  unexpectedEntries.sort((a, b) =>
    `${a.namespace}/${a.name}`.localeCompare(
      `${b.namespace}/${b.name}`
    )
  );

  const base = {
    orphaned,
    recentUnreferenced,
    staleMarkers,
    emptyNamespaces,
    unknownNamespaces,
    unexpectedEntries,
    protectedReferences:
      protectedReferences.size,
    activeGames: activeGames.size,
  };

  return {
    ...base,
    fingerprint: scanFingerprint(
      base,
      pendingSlugs
    ),
  };
}

async function currentFileMatches(
  candidate: SiteMediaJunkCandidate
) {
  const root = getEditorialMediaRoot();
  const filePath = path.join(
    root,
    candidate.slug,
    candidate.filename
  );

  try {
    const stats = await lstat(filePath);
    return (
      stats.isFile() &&
      !stats.isSymbolicLink() &&
      stats.size === candidate.bytes &&
      stats.mtimeMs === candidate.mtimeMs &&
      Date.now() - stats.mtimeMs >=
        MIN_ORPHAN_AGE_MS
    );
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

async function deleteGlobalCandidate(
  candidate: SiteMediaJunkCandidate
) {
  const root = getEditorialMediaRoot();
  const filePath = path.join(
    root,
    candidate.slug,
    candidate.filename
  );

  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

async function deleteStaleMarker(
  marker: SiteMediaStaleMarker
) {
  const root = getEditorialMediaRoot();
  const directory = path.join(
    root,
    marker.slug
  );
  const filePath = path.join(
    directory,
    marker.filename
  );
  const match =
    GAME_DELETE_MARKER.exec(marker.filename);

  if (!match) return false;

  try {
    await lstat(
      path.join(directory, match[1]!)
    );
    return false;
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  try {
    const stats = await lstat(filePath);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.mtimeMs !== marker.mtimeMs
    ) {
      return false;
    }
    await unlink(filePath);
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

async function removeKnownEmptyNamespace(
  slug: string,
  pendingSlugs: ReadonlySet<string>
) {
  if (pendingSlugs.has(slug)) return false;

  const root = getEditorialMediaRoot();
  const directory = path.join(root, slug);

  try {
    const entries = await readdir(directory);
    if (entries.length !== 0) return false;
    await rmdir(directory);
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    return false;
  }
}

export async function purgeSiteMediaJunk(
  expectedFingerprint: string,
  pendingSlugs: readonly string[]
): Promise<SiteMediaPurgeResult> {
  const initial =
    await scanSiteMediaJunk(pendingSlugs);

  if (
    initial.fingerprint !==
    expectedFingerprint
  ) {
    return {
      outcome: "conflict",
      current: initial,
    };
  }

  let files = 0;
  let bytes = 0;
  let markers = 0;
  let directories = 0;
  let skipped = 0;

  for (const candidate of initial.orphaned) {
    const currentReferences =
      await loadProtectedReferences();

    if (
      currentReferences.has(
        candidate.publicPath
      )
    ) {
      skipped += 1;
      continue;
    }

    try {
      if (
        !(await currentFileMatches(candidate))
      ) {
        skipped += 1;
        continue;
      }

      if (candidate.scope === "game") {
        await deleteEditorialMediaResourceByPublicPath(
          candidate.slug,
          candidate.publicPath
        );
        files += 1;
        bytes += candidate.bytes;
        continue;
      }

      if (
        await deleteGlobalCandidate(candidate)
      ) {
        files += 1;
        bytes += candidate.bytes;
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  for (const marker of initial.staleMarkers) {
    try {
      if (await deleteStaleMarker(marker)) {
        markers += 1;
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  const pending =
    new Set(pendingSlugs);
  const namespaces = new Set([
    ...initial.emptyNamespaces,
    ...initial.orphaned.map(
      (candidate) => candidate.slug
    ),
    ...initial.staleMarkers.map(
      (marker) => marker.slug
    ),
  ]);

  for (const slug of namespaces) {
    if (
      await removeKnownEmptyNamespace(
        slug,
        pending
      )
    ) {
      directories += 1;
    }
  }

  return {
    outcome: "purged",
    files,
    bytes,
    markers,
    directories,
    skipped,
  };
}
