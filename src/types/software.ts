import type {
  DistributionPackage,
} from "./game";

export type SoftwareKind =
  | "emulator"
  | "utility"
  | "upscaler"
  | "launcher"
  | "runtime"
  | "other";

export type SoftwarePackage =
  DistributionPackage & {
    platformId: string;
  };

export type Software = {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string;
  description: string;
  kind: SoftwareKind;
  version?: string;
  developer?: string;
  website?: string;
  runsOnPlatformIds: string[];
  emulatesPlatformIds?: string[];
  packages?: SoftwarePackage[];
  /* Compatibilidad con payloads previos; la UI actual no publica portada propia. */
  coverImage?: string;
  imageAlt?: string;
  featured?: boolean;
};
