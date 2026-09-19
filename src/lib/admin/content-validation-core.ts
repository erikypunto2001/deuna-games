import { z } from "zod";

import { homeHeroPresentationInputSchema } from "../home/hero-schema.ts";
import {
  homeCardRevealModes,
  isHomeGameRowSectionId,
} from "../home/card-row-reveal.ts";
import {
  taxonomyIconAssetPattern,
} from "../media/taxonomy-icon-policy.ts";
import {
  siteBrandLogoAssetPattern,
  siteLogoColorModes,
} from "../site/logo.ts";

import type { Game } from "@/types/game";
import type {
  GameTaxonomy,
  GameTaxonomyTerm,
} from "@/types/game-taxonomy";
import type { GameUpdate } from "@/types/update";

const taxonomyIconKeys = [
  "gamepad",
  "zap",
  "compass",
  "sword",
  "car",
  "puzzle",
  "box",
  "sparkles",
  "shield",
  "target",
  "crosshair",
  "ghost",
  "skull",
  "crown",
  "rocket",
  "plane",
  "ship",
  "bike",
  "trophy",
  "castle",
  "dices",
  "users",
  "hammer",
  "brain",
] as const;

const taxonomyToneKeys = [
  "brand",
  "purple",
  "violet",
  "blue",
  "green",
  "orange",
  "cyan",
  "gold",
  "red",
] as const;

const homeSectionIds = [
  "hero",
  "popular",
  "finder",
  "classifications",
  "recent",
  "updates",
  "lowSpec",
  "recommended",
  "trust",
] as const;

export const editorialItemTypes = [
  "game",
  "game_update",
  "site_config",
  "home_config",
  "about_config",
  "game_taxonomy",
  "public_pages_config",
] as const;

export type EditorialItemType =
  (typeof editorialItemTypes)[number];

const identifierSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

const shortText = z.string().trim().max(240);
const optionalShortText = shortText.optional();
const bundledImagePattern =
  /^\/images\/[A-Za-z0-9/_.,@+() -]+\.(?:avif|gif|jpe?g|png|webp)$/i;
const editorialMediaPattern =
  /^\/media\/editorial\/[a-z0-9][a-z0-9._-]{0,159}\/[a-f0-9]{64}\.webp$/;
const editorialPreviewPattern =
  /^\/media\/editorial\/[a-z0-9][a-z0-9._-]{0,159}\/[a-f0-9]{64}\.webm$/;
const taxonomyIconAssetSchema = z
  .string()
  .max(400)
  .regex(taxonomyIconAssetPattern);

function isSafeLocalImagePath(value: string) {
  if (editorialMediaPattern.test(value)) {
    return true;
  }

  if (
    !bundledImagePattern.test(value) ||
    value.includes("\\") ||
    value.includes("//")
  ) {
    return false;
  }

  return !value
    .split("/")
    .some((segment) =>
      segment === "." || segment === ".."
    );
}

const localImageSchema = z
  .string()
  .max(400)
  .refine(isSafeLocalImagePath);

const localPreviewClipSchema = z
  .string()
  .max(400)
  .regex(editorialPreviewPattern);

const videoViewportSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    zoom: z.number().min(1).max(3),
    aspect: z.enum(["source", "16:9", "1:1", "4:5", "9:16"]),
  })
  .strict();

const heroVideoSchema = z
  .object({
    clip: localPreviewClipSchema,
    viewport: videoViewportSchema,
    playback: z.enum(["always", "hover"]).optional(),
  })
  .strict();

const cardHeroVideoSchema = z
  .object({
    source: z.literal("hero"),
    viewport: videoViewportSchema,
  })
  .strict();

const cardIndependentVideoSchema = z
  .object({
    source: z.literal("independent"),
    clip: localPreviewClipSchema,
    viewport: videoViewportSchema,
  })
  .strict();

const gameVideoMediaSchema = z
  .object({
    hero: heroVideoSchema.optional(),
    card: z
      .union([cardHeroVideoSchema, cardIndependentVideoSchema])
      .optional(),
  })
  .strict()
  .superRefine((media, context) => {
    if (media.card?.source === "hero" && !media.hero) {
      context.addIssue({
        code: "custom",
        path: ["card", "source"],
        message:
          "La Card sólo puede compartir el video del Hero cuando existe un Hero de video configurado.",
      });
    }
  });

const pageBackgroundAssetSchema = z
  .object({
    id: identifierSchema,
    name: z.string().trim().min(1).max(80),
    image: localImageSchema,
  })
  .strict();

const pageBackgroundSettingSchema = z
  .object({
    assetId: identifierSchema.nullable(),
    colorMode: z.enum(["brand", "custom"]),
    customColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    tintOpacity: z.number().int().min(0).max(100),
    imageOpacity: z.number().int().min(20).max(100).optional(),
    brightness: z.number().int().min(40).max(220).optional(),
    saturation: z.number().int().min(0).max(200).optional(),
    contrast: z.number().int().min(70).max(160).optional(),
    blur: z.number().int().min(0).max(30).optional(),
    shadeOpacity: z.number().int().min(0).max(100).optional(),
  })
  .strict();

const pageBackgroundsSchema = z
  .object({
    home: pageBackgroundSettingSchema.optional(),
    games: pageBackgroundSettingSchema.optional(),
    updates: pageBackgroundSettingSchema.optional(),
    finder: pageBackgroundSettingSchema.optional(),
    about: pageBackgroundSettingSchema.optional(),
  })
  .strict();

// Unknown legacy keys are intentionally stripped here so saved configurations
// from before the ambient Hero layer was removed keep loading without reviving it.
const heroImageTuningSchema = z.object({
  brightness: z.number().int().min(50).max(220),
  saturation: z.number().int().min(0).max(200),
  contrast: z.number().int().min(70).max(160),
  overlayStrength: z.number().int().min(0).max(100),
});

const downloadHrefSchema = z
  .string()
  .max(2_048)
  .refine((value) => {
    if (value.startsWith("/")) {
      return (
        !value.startsWith("//") &&
        !value.includes("\\")
      );
    }

    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });

const hardwareRequirementsSchema = z
  .object({
    ram: optionalShortText,
    graphics: optionalShortText,
    processor: optionalShortText,
    storage: optionalShortText,
    system: optionalShortText,
  })
  .strict();

const requirementsSchema = hardwareRequirementsSchema
  .extend({
    minimum: hardwareRequirementsSchema.optional(),
    recommended:
      hardwareRequirementsSchema.optional(),
  })
  .strict();

const performanceCalibrationSchema = z
  .object({
    referenceFps: z.number().positive().max(1_000),
    ramGb: z.number().positive().max(512),
    fpsCap: z.number().positive().max(1_000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.fpsCap === undefined ||
      value.referenceFps <= value.fpsCap,
    {
      message:
        "Los FPS de referencia no pueden superar el límite configurado.",
      path: ["fpsCap"],
    }
  );

const downloadSourceStatusSchema = z.enum([
  "available",
  "down",
  "maintenance",
]);

const editorialDownloadSourceSchema = z
  .object({
    id: identifierSchema,
    name: z.string().trim().min(1).max(100),
    href: downloadHrefSchema,
    label: optionalShortText,
    enabled: z.boolean().optional(),
    status: downloadSourceStatusSchema.optional(),
  })
  .strict();

const downloadSchema = z
  .object({
    href: downloadHrefSchema.optional(),
    label: optionalShortText,
    sources: z
      .array(editorialDownloadSourceSchema)
      .max(12)
      .optional(),
    sizeGb: z.number().positive().max(100_000).optional(),
    fileCount: z.number().int().positive().max(10_000).optional(),
    platform: optionalShortText,
  })
  .strict();

function uniqueIdentifiers(maximum: number) {
  return z
    .array(identifierSchema)
    .max(maximum)
    .superRefine((values, context) => {
      const seen = new Set<string>();

      values.forEach((value, index) => {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [index],
            message: "Un juego no puede repetirse dentro de la misma colección.",
          });
        }
        seen.add(value);
      });
    });
}

function normalizeTaxonomyLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

const taxonomyTermSchema = z
  .object({
    key: identifierSchema,
    label: z.string().trim().min(1).max(80),
    active: z.boolean(),
    icon: z.enum(taxonomyIconKeys).optional(),
    iconAsset: taxonomyIconAssetSchema.optional(),
    tone: z.enum(taxonomyToneKeys).optional(),
  })
  .strict();

function taxonomyTerms(maximum: number) {
  return z
    .array(taxonomyTermSchema)
    .max(maximum)
    .superRefine((terms, context) => {
      const keys = new Set<string>();
      const labels = new Set<string>();

      terms.forEach((term, index) => {
        if (keys.has(term.key)) {
          context.addIssue({
            code: "custom",
            path: [index, "key"],
            message: "Los identificadores del catálogo no pueden repetirse.",
          });
        }
        keys.add(term.key);

        const label = normalizeTaxonomyLabel(term.label);
        if (labels.has(label)) {
          context.addIssue({
            code: "custom",
            path: [index, "label"],
            message: "El catálogo no admite nombres duplicados o equivalentes.",
          });
        }
        labels.add(label);
      });
    });
}

function mergeLegacyTaxonomyTerms(
  categories: GameTaxonomyTerm[],
  genres: GameTaxonomyTerm[]
) {
  const merged: GameTaxonomyTerm[] = [];
  const positions = new Map<string, number>();

  for (const term of [...categories, ...genres]) {
    const normalized = normalizeTaxonomyLabel(term.label);
    const existingIndex = positions.get(normalized);

    if (existingIndex === undefined) {
      positions.set(normalized, merged.length);
      merged.push(term);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      active: existing.active || term.active,
      icon: existing.icon ?? term.icon,
      iconAsset: existing.iconAsset ?? term.iconAsset,
      tone: existing.tone ?? term.tone,
    };
  }

  return merged;
}

const aboutTitle = z.string().trim().min(1).max(180);
const aboutText = z.string().trim().min(1).max(700);
const aboutEyebrow = z.string().trim().min(1).max(60);
const aboutCardSchema = z
  .object({
    title: aboutTitle,
    text: aboutText,
  })
  .strict();

const editorialHeading = z.string().trim().min(1).max(180);
const editorialLabel = z.string().trim().min(1).max(100);
const editorialParagraph = z.string().trim().min(1).max(900);
const editorialCardSchema = z
  .object({
    title: editorialHeading,
    text: editorialParagraph,
  })
  .strict();

const homeSectionSchema = z
  .object({
    id: z.enum(homeSectionIds),
    visible: z.boolean(),
    cardRevealMode: z.enum(homeCardRevealModes).optional(),
  })
  .strict()
  .superRefine((section, context) => {
    if (
      section.cardRevealMode !== undefined &&
      !isHomeGameRowSectionId(section.id)
    ) {
      context.addIssue({
        code: "custom",
        path: ["cardRevealMode"],
        message:
          "La visualización de Card sólo puede configurarse en filas de juegos.",
      });
    }
  });

const homeSectionsSchema = z
  .array(homeSectionSchema)
  .max(homeSectionIds.length)
  .superRefine((sections, context) => {
    const seen = new Set<string>();

    sections.forEach((section, index) => {
      if (seen.has(section.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Una sección de portada no puede repetirse.",
        });
      }
      seen.add(section.id);
    });
  });

const homeCurationModeSchema = z.enum([
  "manual",
  "automatic",
  "hybrid",
]);

const homeCurationCollectionSchema = z
  .object({
    mode: homeCurationModeSchema,
  })
  .strict();

const homeCurationSchema = z
  .object({
    hero: homeCurationCollectionSchema,
    popular: homeCurationCollectionSchema,
    lowSpec: homeCurationCollectionSchema,
    recommended: homeCurationCollectionSchema,
  })
  .strict();

const homeHeroPresentationSchema = homeHeroPresentationInputSchema;

const homeCopySchema = z
  .object({
    hero: z
      .object({
        accessibleTitle: editorialHeading,
        primaryCta: editorialLabel,
        secondaryCta: editorialLabel,
      })
      .strict(),
    popular: z
      .object({
        title: editorialHeading,
        highlight: editorialHeading,
        linkLabel: editorialLabel,
      })
      .strict(),
    finder: z
      .object({
        eyebrow: editorialLabel,
        title: editorialHeading,
        highlight: editorialHeading,
        text: editorialParagraph,
        features: z.tuple([
          editorialLabel,
          editorialLabel,
          editorialLabel,
        ]),
        cta: editorialLabel,
      })
      .strict(),
    classifications: z
      .object({
        title: editorialHeading,
        highlight: editorialHeading,
        linkLabel: editorialLabel,
      })
      .strict(),
    recent: z
      .object({
        title: editorialHeading,
        highlight: editorialHeading,
        linkLabel: editorialLabel,
      })
      .strict(),
    updates: z
      .object({
        title: editorialHeading,
        highlight: editorialHeading,
        linkLabel: editorialLabel,
        badgeLabel: editorialLabel,
        detailsLabel: editorialLabel,
      })
      .strict(),
    lowSpec: z
      .object({
        eyebrow: editorialLabel,
        title: editorialHeading,
        highlight: editorialHeading,
        text: editorialParagraph,
        features: z.tuple([
          editorialLabel,
          editorialLabel,
          editorialLabel,
        ]).optional(),
        cta: editorialLabel,
        optionTitles: z.tuple([
          editorialHeading,
          editorialHeading,
          editorialHeading,
          editorialHeading,
        ]),
        optionSubtitles: z.tuple([
          editorialParagraph,
          editorialParagraph,
          editorialParagraph,
          editorialParagraph,
        ]),
        listTitle: editorialHeading,
        listHighlight: editorialHeading,
        listLinkLabel: editorialLabel,
      })
      .strict(),
    recommended: z
      .object({
        eyebrow: editorialLabel,
        title: editorialHeading,
        highlight: editorialHeading,
        text: editorialParagraph,
        linkLabel: editorialLabel,
      })
      .strict(),
    trust: z
      .object({
        items: z.tuple([
          editorialCardSchema,
          editorialCardSchema,
          editorialCardSchema,
          editorialCardSchema,
        ]),
      })
      .strict(),
  })
  .strict();

export const editorialGameSchema: z.ZodType<Game> = z
  .object({
    id: identifierSchema,
    slug: identifierSchema,
    title: z.string().trim().min(1).max(140),
    shortTitle: optionalShortText,
    highlightedTitle: optionalShortText,
    description: z.string().trim().min(1).max(2_500),
    category: z.string().trim().min(1).max(80),
    genres: z.array(shortText).max(20).optional(),
    tags: z.array(shortText).max(30).optional(),
    platforms: z
      .array(
        z.enum([
          "PC",
          "PlayStation",
          "Xbox",
          "Nintendo Switch",
        ])
      )
      .max(4)
      .optional(),
    badge: optionalShortText,
    rating: z.number().min(0).max(5).optional(),
    reviews: z
      .string()
      .trim()
      .max(30)
      .regex(/^\d+(?:\.\d+)?[KM]?$/i)
      .optional(),
    version: optionalShortText,
    addedAt: optionalShortText,
    releaseDate: optionalShortText,
    developer: optionalShortText,
    publisher: optionalShortText,
    coverImage: localImageSchema.optional(),
    heroImage: localImageSchema.optional(),
    screenshots: z
      .array(localImageSchema)
      .max(20)
      .optional(),
    videoMedia: gameVideoMediaSchema.optional(),
    previewClip: localPreviewClipSchema.optional(),
    imageAlt: z.string().trim().min(1).max(240),
    requirements: requirementsSchema.optional(),
    performance: performanceCalibrationSchema.optional(),
    download: downloadSchema.optional(),
  })
  .strict()
  .superRefine((game, context) => {
    if (game.id !== game.slug) {
      context.addIssue({
        code: "custom",
        path: ["slug"],
        message: "El ID y el slug del juego deben coincidir.",
      });
    }

  });

export const editorialUpdateSchema: z.ZodType<GameUpdate> = z
  .object({
    id: identifierSchema,
    gameSlug: identifierSchema,
    version: z.string().trim().min(1).max(80),
    publishedAt: z
      .string()
      .datetime({ offset: true }),
    type: z.enum([
      "update",
      "content",
      "fix",
      "improvement",
    ]),
    summary: z.string().trim().min(1).max(1_500),
    featured: z.boolean().optional(),
  })
  .strict();

export const editorialSiteConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    shortName: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
    language: z.literal("es"),
    themeColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    brandColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    logoAsset: z
      .string()
      .max(400)
      .regex(siteBrandLogoAssetPattern)
      .optional(),
    logoScale: z.number().int().min(50).max(200).optional(),
    logoColorMode: z.enum(siteLogoColorModes).optional(),
    logoCustomColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    footerTagline: z.string().trim().min(1).max(180).optional(),
    backgroundLibrary: z
      .array(pageBackgroundAssetSchema)
      .max(40)
      .optional(),
    pageBackgrounds: pageBackgroundsSchema.optional(),
    heroImageEffect: z.boolean().optional(),
    heroImageTuning: heroImageTuningSchema.optional(),
  })
  .strict()
  .superRefine((config, context) => {
    if (
      config.logoColorMode === "custom" &&
      !config.logoCustomColor
    ) {
      context.addIssue({
        code: "custom",
        path: ["logoCustomColor"],
        message:
          "El logo con color personalizado requiere un color válido.",
      });
    }
  });

export const editorialHomeConfigSchema = z
  .object({
    heroSlugs: uniqueIdentifiers(8),
    popularSlugs: uniqueIdentifiers(24),
    lowSpecSlugs: uniqueIdentifiers(24),
    recommendedSlugs: uniqueIdentifiers(24),
    curation: homeCurationSchema.optional(),
    heroPresentation: homeHeroPresentationSchema.optional(),
    sections: homeSectionsSchema.optional(),
    copy: homeCopySchema.optional(),
  })
  .strict();

export const editorialAboutConfigSchema = z
  .object({
    hero: z
      .object({
        title: aboutTitle,
        highlight: aboutTitle,
        text: aboutText,
        signals: z.array(aboutCardSchema).length(3),
      })
      .strict(),
    intro: z
      .object({
        title: aboutTitle,
        highlight: aboutTitle,
        paragraphs: z.array(aboutText).length(2),
      })
      .strict(),
    principles: z
      .array(
        z
          .object({
            eyebrow: aboutEyebrow,
            title: aboutTitle,
            text: aboutText,
          })
          .strict()
      )
      .length(3),
    reason: z
      .object({
        title: aboutTitle,
        highlight: aboutTitle,
        paragraphs: z.array(aboutText).length(2),
      })
      .strict(),
    ecosystem: z.array(aboutCardSchema).length(3),
    manifesto: z
      .object({
        title: aboutTitle,
        highlight: aboutTitle,
        text: aboutText,
      })
      .strict(),
    ctaTitle: aboutTitle,
  })
  .strict();

const unifiedGameTaxonomySchema = z
  .object({
    classifications: taxonomyTerms(280),
    tags: taxonomyTerms(500),
  })
  .strict();

const legacyGameTaxonomySchema = z
  .object({
    categories: taxonomyTerms(80),
    genres: taxonomyTerms(200),
    tags: taxonomyTerms(500),
  })
  .strict();

export const editorialGameTaxonomySchema: z.ZodType<GameTaxonomy> = z
  .union([
    unifiedGameTaxonomySchema,
    legacyGameTaxonomySchema,
  ])
  .transform((value): GameTaxonomy => {
    if ("classifications" in value) {
      return value;
    }

    return {
      classifications: mergeLegacyTaxonomyTerms(
        value.categories,
        value.genres
      ),
      tags: value.tags,
    };
  });

export const editorialPublicPagesConfigSchema = z
  .object({
    games: z
      .object({
        eyebrow: editorialLabel,
        title: editorialHeading,
        description: editorialParagraph,
        platformLabel: editorialLabel,
        heroImage: localImageSchema.optional(),
      })
      .strict(),
    updates: z
      .object({
        eyebrow: editorialLabel,
        title: editorialHeading,
        highlight: editorialHeading,
        description: editorialParagraph,
        infoCards: z.tuple([
          editorialCardSchema,
          editorialCardSchema,
          editorialCardSchema,
        ]),
      })
      .strict(),
    finder: z
      .object({
        eyebrow: editorialLabel,
        title: editorialHeading,
        highlight: editorialHeading,
        description: editorialParagraph,
        flow: z.tuple([
          editorialLabel,
          editorialLabel,
          editorialLabel,
        ]),
        trustText: editorialParagraph,
      })
      .strict(),
  })
  .strict();

export type EditorialSiteConfig = z.infer<
  typeof editorialSiteConfigSchema
>;

export type EditorialHomeConfig = z.infer<
  typeof editorialHomeConfigSchema
>;

export type EditorialAboutConfig = z.infer<
  typeof editorialAboutConfigSchema
>;

export type EditorialPublicPagesConfig = z.infer<
  typeof editorialPublicPagesConfigSchema
>;

export type EditorialPayloadByType = {
  game: Game;
  game_update: GameUpdate;
  site_config: EditorialSiteConfig;
  home_config: EditorialHomeConfig;
  about_config: EditorialAboutConfig;
  game_taxonomy: GameTaxonomy;
  public_pages_config: EditorialPublicPagesConfig;
};

export function parseEditorialPayload<
  Type extends EditorialItemType,
>(type: Type, payload: unknown): EditorialPayloadByType[Type] {
  const schema =
    type === "game"
      ? editorialGameSchema
      : type === "game_update"
        ? editorialUpdateSchema
        : type === "site_config"
          ? editorialSiteConfigSchema
          : type === "home_config"
            ? editorialHomeConfigSchema
            : type === "about_config"
              ? editorialAboutConfigSchema
              : type === "game_taxonomy"
                ? editorialGameTaxonomySchema
                : editorialPublicPagesConfigSchema;

  return schema.parse(payload) as EditorialPayloadByType[Type];
}
