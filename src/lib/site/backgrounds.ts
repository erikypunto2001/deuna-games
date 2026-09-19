export const SITE_BACKGROUND_MEDIA_SLUG = "site-backgrounds";

export const siteBackgroundAssetPattern =
  /^\/media\/editorial\/site-backgrounds\/[a-f0-9]{64}\.webp$/;

export function isSiteBackgroundAsset(value: string) {
  return siteBackgroundAssetPattern.test(value);
}

export const siteBackgroundPages = [
  "home",
  "games",
  "updates",
  "finder",
  "about",
] as const;

export type SiteBackgroundPage =
  (typeof siteBackgroundPages)[number];

export type SiteBackgroundAsset = {
  id: string;
  name: string;
  image: string;
};

export type SiteBackgroundSetting = {
  assetId: string | null;
  colorMode: "brand" | "custom";
  customColor: string;
  tintOpacity: number;
  imageOpacity?: number;
  brightness?: number;
  saturation?: number;
  contrast?: number;
  blur?: number;
  shadeOpacity?: number;
};

export type ResolvedSiteBackgroundSetting = {
  assetId: string | null;
  colorMode: "brand" | "custom";
  customColor: string;
  tintOpacity: number;
  imageOpacity: number;
  brightness: number;
  saturation: number;
  contrast: number;
  blur: number;
  shadeOpacity: number;
};

export type SiteBackgroundMap = Partial<
  Record<SiteBackgroundPage, SiteBackgroundSetting>
>;

export const siteBackgroundPageOptions: ReadonlyArray<{
  key: SiteBackgroundPage;
  label: string;
}> = [
  { key: "home", label: "Inicio" },
  { key: "games", label: "Juegos" },
  { key: "updates", label: "Actualizaciones" },
  { key: "finder", label: "Requisitos" },
  { key: "about", label: "Quiénes somos" },
];

export const bundledSiteBackgrounds: ReadonlyArray<SiteBackgroundAsset> = [
  {
    id: "aurora-nocturna",
    name: "Aurora Nocturna",
    image: "/images/backgrounds/aurora-nocturna.webp",
  },
  {
    id: "nebulosa-profunda",
    name: "Nebulosa Profunda",
    image: "/images/backgrounds/nebulosa-profunda.webp",
  },
  {
    id: "ondas-sinteticas",
    name: "Ondas Sintéticas",
    image: "/images/backgrounds/ondas-sinteticas.webp",
  },
  {
    id: "bosque-sombrio",
    name: "Bosque Sombrío",
    image: "/images/backgrounds/bosque-sombrio.webp",
  },
  {
    id: "hexagonos-tech",
    name: "Hexágonos Tech",
    image: "/images/backgrounds/hexagonos-tech.webp",
  },
  {
    id: "espacio-minimal",
    name: "Espacio Minimal",
    image: "/images/backgrounds/espacio-minimal.jpg",
  },
];

function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function createDefaultBackgroundSetting(
  brandColor: string
): ResolvedSiteBackgroundSetting {
  return {
    assetId: null,
    colorMode: "brand",
    customColor: brandColor,
    tintOpacity: 35,
    imageOpacity: 72,
    brightness: 100,
    saturation: 90,
    contrast: 104,
    blur: 0,
    shadeOpacity: 100,
  };
}

export function resolveBackgroundSetting(
  setting: SiteBackgroundSetting | undefined,
  brandColor: string
): ResolvedSiteBackgroundSetting {
  const fallback = createDefaultBackgroundSetting(brandColor);

  if (!setting) return fallback;

  return {
    assetId: setting.assetId,
    colorMode: setting.colorMode,
    customColor: setting.customColor,
    tintOpacity: clamp(setting.tintOpacity, 0, 100, fallback.tintOpacity),
    imageOpacity: clamp(setting.imageOpacity, 20, 100, fallback.imageOpacity),
    brightness: clamp(setting.brightness, 40, 220, fallback.brightness),
    saturation: clamp(setting.saturation, 0, 200, fallback.saturation),
    contrast: clamp(setting.contrast, 70, 160, fallback.contrast),
    blur: clamp(setting.blur, 0, 30, fallback.blur),
    shadeOpacity: clamp(setting.shadeOpacity, 0, 100, fallback.shadeOpacity),
  };
}

export function getSiteBackgroundAssets(
  customAssets: ReadonlyArray<SiteBackgroundAsset> = []
) {
  const byId = new Map<string, SiteBackgroundAsset>();

  for (const asset of bundledSiteBackgrounds) {
    byId.set(asset.id, asset);
  }

  for (const asset of customAssets) {
    byId.set(asset.id, asset);
  }

  return Array.from(byId.values());
}

export function resolveBackgroundPage(
  pathname: string
): SiteBackgroundPage | null {
  if (pathname === "/") return "home";
  if (pathname === "/juegos" || pathname.startsWith("/juegos/")) {
    return "games";
  }
  if (
    pathname === "/actualizaciones" ||
    pathname.startsWith("/actualizaciones/")
  ) {
    return "updates";
  }
  if (pathname === "/requisitos" || pathname.startsWith("/requisitos/")) {
    return "finder";
  }
  if (
    pathname === "/quienes-somos" ||
    pathname.startsWith("/quienes-somos/")
  ) {
    return "about";
  }

  return null;
}
