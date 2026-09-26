export type PlatformKind =
  | "pc"
  | "console"
  | "handheld";

export type PlatformFamily = {
  id: string;
  name: string;
  order: number;
  active: boolean;
};

export type PlatformDefinition = {
  id: string;
  familyId: string;
  name: string;
  shortName?: string;
  kind: PlatformKind;
  order: number;
  active: boolean;
};

export type PlatformCatalog = {
  families: PlatformFamily[];
  platforms: PlatformDefinition[];
};
