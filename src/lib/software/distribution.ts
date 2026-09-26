import type {
  GameDownloadSource,
} from "@/types/game";
import type {
  SoftwarePackage,
} from "@/types/software";

export type ResolvedSoftwarePackage = {
  id: string;
  platformId: string;
  kind: SoftwarePackage["kind"];
  label: string;
  sizeGb?: number;
  checksumSha256?: string;
  sources: GameDownloadSource[];
};

export function resolveSoftwarePackages(
  packages:
    | SoftwarePackage[]
    | undefined
): ResolvedSoftwarePackage[] {
  return (packages ?? [])
    .filter(
      (item) =>
        item.enabled !== false
    )
    .map((item) => ({
      id: item.id,
      platformId:
        item.platformId,
      kind: item.kind,
      label:
        item.label?.trim() ||
        "Descargar",
      sizeGb: item.sizeGb,
      checksumSha256:
        item.checksumSha256,
      sources: (
        item.sources ?? []
      ).filter(
        (source) =>
          source.enabled !==
            false
      ),
    }))
    .filter(
      (item) =>
        item.sources.length > 0
    );
}

export function softwareHasDownload(
  packages:
    | SoftwarePackage[]
    | undefined
) {
  return resolveSoftwarePackages(
    packages
  ).some(
    (item) =>
      item.sources.some(
        (source) =>
          (
            source.status ??
            "available"
          ) ===
          "available"
      )
  );
}
