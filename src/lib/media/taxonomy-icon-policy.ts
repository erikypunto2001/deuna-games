export const TAXONOMY_ICON_SLUG = "taxonomy-icons";

export const taxonomyIconAssetPattern =
  /^\/media\/editorial\/taxonomy-icons\/[a-f0-9]{64}\.(?:svg|webp)$/;

export function isTaxonomyIconAsset(value: string) {
  return taxonomyIconAssetPattern.test(value);
}
