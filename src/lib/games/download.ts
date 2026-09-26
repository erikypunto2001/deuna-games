import type {
  DistributionPackage,
  Game,
  GameDistributionChannel,
  GameDownloadSource,
  GameDownloadSourceStatus,
  GameRelease,
} from "@/types/game";
import {
  resolveGameReleases,
} from "@/lib/games/releases";

export type ResolvedDownloadSource = {
  id: string;
  name: string;
  href: string;
  label: string;
  external: boolean;
  status: GameDownloadSourceStatus;
};

export type ResolvedDownload = {
  href: string;
  label: string;
  external: boolean;
  sources: ResolvedDownloadSource[];
  sizeGb?: number;
  fileCount?: number;
  platform?: string;
  platformId?: string;
  releaseId?: string;
  packageId?: string;
  packageKind?: DistributionPackage["kind"];
  channel?: GameDistributionChannel;
  checksumSha256?: string;
};

const internalBase =
  "https://deuna-internal.invalid";

function resolveInternalHref(
  rawHref: string
) {
  if (
    !rawHref.startsWith("/") ||
    rawHref.startsWith("//") ||
    rawHref.includes("\\")
  ) {
    return null;
  }

  try {
    const url = new URL(
      rawHref,
      internalBase
    );

    if (
      url.origin !== internalBase
    ) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function resolveHref(
  rawHref: string
) {
  const href = rawHref.trim();

  if (!href) {
    return null;
  }

  if (href.startsWith("/")) {
    const internalHref =
      resolveInternalHref(href);

    if (!internalHref) {
      return null;
    }

    return {
      href: internalHref,
      external: false,
    };
  }

  try {
    const url = new URL(href);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return {
      href: url.toString(),
      external: true,
    };
  } catch {
    return null;
  }
}

function resolveStatus(
  status: GameDownloadSourceStatus | undefined
): GameDownloadSourceStatus {
  return status === "down" ||
    status === "maintenance"
    ? status
    : "available";
}

function resolveSource(
  source: GameDownloadSource
): ResolvedDownloadSource | null {
  if (source.enabled === false) {
    return null;
  }

  const resolved =
    resolveHref(source.href);

  if (!resolved) {
    return null;
  }

  const name = source.name.trim();
  const id = source.id.trim();

  if (!name || !id) {
    return null;
  }

  return {
    id,
    name,
    href: resolved.href,
    external: resolved.external,
    status: resolveStatus(source.status),
    label:
      source.label?.trim() ||
      `Abrir ${name}`,
  };
}

function resolvePackageDownload(
  release: GameRelease,
  item: DistributionPackage
): ResolvedDownload | null {
  if (item.enabled === false) {
    return null;
  }

  const sources: ResolvedDownloadSource[] = [];
  const seenHrefs = new Set<string>();

  for (const source of item.sources ?? []) {
    const resolved = resolveSource(source);

    if (
      !resolved ||
      seenHrefs.has(resolved.href)
    ) {
      continue;
    }

    seenHrefs.add(resolved.href);
    sources.push(resolved);
  }

  const primary =
    sources.find(
      (source) =>
        source.status === "available"
    ) ?? sources[0];

  if (!primary) {
    return null;
  }

  const checksumSha256 =
    item.checksumSha256
      ?.trim()
      .toLowerCase();

  return {
    href: primary.href,
    label:
      item.label?.trim() ||
      primary.label,
    external: primary.external,
    sources,
    sizeGb:
      typeof item.sizeGb === "number" &&
      Number.isFinite(item.sizeGb) &&
      item.sizeGb > 0
        ? item.sizeGb
        : undefined,
    fileCount:
      typeof item.fileCount === "number" &&
      Number.isInteger(item.fileCount) &&
      item.fileCount > 0
        ? item.fileCount
        : undefined,
    platformId: release.platformId,
    releaseId: release.id,
    packageId: item.id,
    packageKind: item.kind,
    channel: item.channel,
    checksumSha256:
      checksumSha256 &&
      /^[a-f0-9]{64}$/.test(checksumSha256)
        ? checksumSha256
        : undefined,
  };
}

export function resolveGameReleaseDownloads(
  game: Game,
  releaseId: string
) {
  const release =
    resolveGameReleases(game).find(
      (item) =>
        item.id === releaseId
    );

  if (!release) {
    return [];
  }

  return (release.packages ?? [])
    .map((item) =>
      resolvePackageDownload(
        release,
        item
      )
    )
    .filter(
      (
        item
      ): item is ResolvedDownload =>
        item !== null
    );
}

export function resolveGameReleaseDownload(
  game: Game,
  releaseId: string,
  packageId?: string
): ResolvedDownload | null {
  const downloads =
    resolveGameReleaseDownloads(
      game,
      releaseId
    );

  if (packageId) {
    return (
      downloads.find(
        (item) =>
          item.packageId ===
          packageId
      ) ?? null
    );
  }

  return (
    downloads.find(
      (item) =>
        item.sources.some(
          (source) =>
            source.status ===
            "available"
        )
    ) ??
    downloads[0] ??
    null
  );
}

export function resolveGameDownload(
  game: Game
): ResolvedDownload | null {
  const releases =
    resolveGameReleases(game);

  for (const release of releases) {
    const resolved =
      resolveGameReleaseDownload(
        game,
        release.id
      );

    if (resolved) {
      return resolved;
    }
  }

  const config = game.download;

  if (!config) {
    return null;
  }

  const sources: ResolvedDownloadSource[] = [];
  const seenHrefs = new Set<string>();

  for (const source of config.sources ?? []) {
    const resolved = resolveSource(source);

    if (
      !resolved ||
      seenHrefs.has(resolved.href)
    ) {
      continue;
    }

    seenHrefs.add(resolved.href);
    sources.push(resolved);
  }

  if (config.href) {
    const resolved =
      resolveHref(config.href);

    if (
      resolved &&
      !seenHrefs.has(resolved.href)
    ) {
      sources.unshift({
        id: "primary",
        name: "Descarga principal",
        href: resolved.href,
        external: resolved.external,
        status: "available",
        label:
          config.label?.trim() ||
          "Descargar versión actual",
      });
    }
  }

  const primary =
    sources.find(
      (source) => source.status === "available"
    ) ?? sources[0];

  if (!primary) {
    return null;
  }

  const checksumSha256 =
    game.distributionMetadata?.checksumSha256?.trim().toLowerCase();

  return {
    href: primary.href,
    label: primary.label,
    external: primary.external,
    sources,
    sizeGb:
      typeof config.sizeGb === "number" &&
      Number.isFinite(config.sizeGb) &&
      config.sizeGb > 0
        ? config.sizeGb
        : undefined,
    fileCount:
      typeof config.fileCount === "number" &&
      Number.isInteger(config.fileCount) &&
      config.fileCount > 0
        ? config.fileCount
        : undefined,
    platform:
      config.platform?.trim() ||
      undefined,
    channel: game.distributionMetadata?.channel,
    checksumSha256:
      checksumSha256 && /^[a-f0-9]{64}$/.test(checksumSha256)
        ? checksumSha256
        : undefined,
  };
}
