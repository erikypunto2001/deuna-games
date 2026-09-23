import { z } from "zod";

import {
  parseEditorialPayload as parseCoreEditorialPayload,
} from "./content-validation-core.ts";
import type {
  EditorialItemType,
  EditorialPayloadByType,
} from "./content-validation-core.ts";

import { normalizeGameMediaMode } from "../media/game-media-mode-policy.ts";

import type { Game } from "@/types/game";

export * from "./content-validation-core.ts";

const bundledImagePattern =
  /^\/images\/[A-Za-z0-9/_.,@+() -]+\.(?:avif|gif|jpe?g|png|webp)$/i;
const editorialMediaPattern =
  /^\/media\/editorial\/[a-z0-9][a-z0-9._-]{0,159}\/[a-f0-9]{64}\.webp$/;

function isSafeLocalImagePath(value: string) {
  if (editorialMediaPattern.test(value)) return true;
  if (
    !bundledImagePattern.test(value) ||
    value.includes("\\") ||
    value.includes("//")
  ) {
    return false;
  }
  return !value
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

const localImageSchema = z
  .string()
  .max(400)
  .refine(isSafeLocalImagePath);

const canonicalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const imageViewportAspectSchema = z.enum([
  "16:9",
  "3:1",
  "3:2",
  "1:1",
  "4:5",
  "9:16",
  "free",
]);

const fixedImageAspectSchema = z.enum([
  "16:9",
  "3:1",
  "3:2",
  "1:1",
  "4:5",
  "9:16",
]);

const fixedImageViewportSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    zoom: z.number().min(1).max(3),
    aspect: fixedImageAspectSchema.optional(),
    source: localImageSchema.optional(),
    confirmed: z.literal(true).optional(),
  })
  .strict();

const galleryImageViewportSchema = fixedImageViewportSchema
  .extend({
    aspect: imageViewportAspectSchema.optional(),
    aspectRatio: z.number().min(0.1).max(10).optional(),
  })
  .strict()
  .superRefine((viewport, context) => {
    if (viewport.aspect === "free" && viewport.aspectRatio === undefined) {
      context.addIssue({
        code: "custom",
        path: ["aspectRatio"],
        message: "Un recorte libre debe conservar su relación exacta.",
      });
    }
    if (viewport.aspect !== "free" && viewport.aspectRatio !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["aspectRatio"],
        message: "La relación numérica sólo corresponde a un recorte libre.",
      });
    }
  });

const galleryImageMediaSchema = z.record(
  z.string().min(1).max(400),
  galleryImageViewportSchema
);

const imageMediaSchema = z
  .object({
    cover: fixedImageViewportSchema.optional(),
    hero: fixedImageViewportSchema.optional(),
    card: fixedImageViewportSchema.optional(),
    detail: fixedImageViewportSchema.optional(),
    background: fixedImageViewportSchema.optional(),
    gallery: galleryImageMediaSchema.optional(),
  })
  .strict();

const coverArtworkSourceSchema = z.enum(["card", "custom"]);

const mediaModeSchema = z.enum([
  "image",
  "video",
  "hover-video",
]);

const mediaModesSchema = z
  .object({
    // Compatibilidad de lectura para snapshots anteriores al contrato image-only.
    cover: mediaModeSchema.optional(),
    hero: mediaModeSchema.optional(),
    card: mediaModeSchema.optional(),
    detail: mediaModeSchema.optional(),
    background: mediaModeSchema.optional(),
  })
  .strict();

const localPreviewClipSchema = z
  .string()
  .max(400)
  .regex(
    /^\/media\/editorial\/[a-z0-9][a-z0-9._-]{0,159}\/[a-f0-9]{64}\.webm$/
  );

const videoViewportSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    zoom: z.number().min(1).max(3),
    aspect: z.enum(["source", "16:9", "3:1", "3:2", "1:1", "4:5", "9:16"]),
    confirmed: z.literal(true).optional(),
  })
  .strict();

const destinationVideoSchema = z
  .object({
    clip: localPreviewClipSchema,
    viewport: videoViewportSchema,
    playback: z.enum(["always", "hover"]).optional(),
  })
  .strict();

const cardVideoSchema = z.union([
  z.object({
    source: z.literal("hero"),
    viewport: videoViewportSchema,
    playback: z.enum(["always", "hover"]).optional(),
  }).strict(),
  z.object({
    source: z.literal("independent"),
    clip: localPreviewClipSchema,
    viewport: videoViewportSchema,
    playback: z.enum(["always", "hover"]).optional(),
  }).strict(),
]);

const videoMediaSchema = z
  .object({
    // Sólo se acepta para poder interpretar historial. Se elimina al normalizar.
    cover: destinationVideoSchema.optional(),
    hero: destinationVideoSchema.optional(),
    card: cardVideoSchema.optional(),
    detail: destinationVideoSchema.optional(),
    background: destinationVideoSchema.optional(),
  })
  .strict()
  .superRefine((media, context) => {
    if (media.card?.source === "hero" && !media.hero) {
      context.addIssue({
        code: "custom",
        path: ["card", "source"],
        message: "La Card sólo puede compartir el video del Hero cuando existe un Hero de video configurado.",
      });
    }
  });

const mediaAccessibilityLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(240);

const galleryAccessibilityItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    src: localImageSchema,
    label: mediaAccessibilityLabelSchema,
  }).strict(),
  z.object({
    kind: z.literal("video"),
    src: localPreviewClipSchema,
    label: mediaAccessibilityLabelSchema,
  }).strict(),
]);

const mediaAccessibilitySchema = z
  .object({
    cover: mediaAccessibilityLabelSchema.optional(),
    hero: mediaAccessibilityLabelSchema.optional(),
    card: mediaAccessibilityLabelSchema.optional(),
    detail: mediaAccessibilityLabelSchema.optional(),
    gallery: z
      .array(galleryAccessibilityItemSchema)
      .max(8)
      .superRefine((items, context) => {
        const seen = new Set<string>();
        items.forEach((item, index) => {
          const key = `${item.kind}:${item.src}`;
          if (seen.has(key)) {
            context.addIssue({
              code: "custom",
              path: [index, "src"],
              message: "Un recurso de Galería no puede repetir su texto accesible.",
            });
          }
          seen.add(key);
        });
      })
      .optional(),
  })
  .strict();

const compatibilityMetadataSchema = z
  .object({
    status: z.enum(["declared", "reviewed", "tested"]).optional(),
    source: z
      .enum(["developer", "publisher", "internal", "community", "external"])
      .optional(),
    verifiedAt: canonicalDateSchema.optional(),
  })
  .strict();

const ageRatingSchema = z
  .object({
    system: z.enum([
      "ESRB",
      "PEGI",
      "IARC",
      "CLASSIND",
      "USK",
      "ACB",
      "GRAC",
      "CERO",
      "OTHER",
    ]),
    rating: z.string().trim().min(1).max(40),
    descriptors: z
      .array(z.string().trim().min(1).max(80))
      .max(8)
      .optional(),
  })
  .strict();

const performanceMetadataSchema = z
  .object({
    source: z
      .enum(["internal", "developer", "publisher", "community", "external"])
      .optional(),
    sourceLabel: z.string().trim().min(1).max(160).optional(),
    measuredAt: canonicalDateSchema.optional(),
    confidence: z.enum(["low", "medium", "high"]).optional(),
  })
  .strict();

const distributionMetadataSchema = z
  .object({
    channel: z.enum(["stable", "beta", "testing"]).optional(),
    checksumSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

const galleryMediaSchema = z
  .array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("image"),
        src: localImageSchema,
      }).strict(),
      z.object({
        kind: z.literal("video"),
        src: localPreviewClipSchema,
        viewport: videoViewportSchema,
      }).strict(),
    ])
  )
  .max(8)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const key = `${item.kind}:${item.src}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index, "src"],
          message: "Un mismo recurso no puede repetirse dentro de la Galería.",
        });
      }
      seen.add(key);
    });
  });

type ParsedMediaAccessibility = z.infer<typeof mediaAccessibilitySchema>;
type ParsedGalleryMedia = z.infer<typeof galleryMediaSchema>;

function resolveMediaAccessibility(
  accessibility: ParsedMediaAccessibility | undefined,
  galleryMedia: ParsedGalleryMedia | undefined,
  screenshots: string[] | undefined
) {
  if (!accessibility) return undefined;

  const allowedGallery = new Set(
    galleryMedia
      ? galleryMedia.map((item) => `${item.kind}:${item.src}`)
      : (screenshots ?? []).map((src) => `image:${src}`)
  );
  const gallery = accessibility.gallery?.filter(
    (item) => allowedGallery.has(`${item.kind}:${item.src}`)
  );
  const resolved = {
    ...(accessibility.cover ? { cover: accessibility.cover } : {}),
    ...(accessibility.hero ? { hero: accessibility.hero } : {}),
    ...(accessibility.card ? { card: accessibility.card } : {}),
    ...(accessibility.detail ? { detail: accessibility.detail } : {}),
    ...(gallery?.length ? { gallery } : {}),
  };

  return Object.keys(resolved).length > 0
    ? resolved
    : undefined;
}

function splitGameCompatibilityPayload(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return {
      core: payload,
      coverArtworkSource: undefined,
      cardImage: undefined,
      detailImage: undefined,
      backgroundImage: undefined,
      galleryMedia: undefined,
      imageMedia: undefined,
      mediaAccessibility: undefined,
      mediaModes: undefined,
      videoMedia: undefined,
      ageRating: undefined,
      compatibilityMetadata: undefined,
      performanceMetadata: undefined,
      distributionMetadata: undefined,
    };
  }

  const clean = {
    ...(payload as Record<string, unknown>),
  };
  const coverArtworkSource = clean.coverArtworkSource === undefined
    ? undefined
    : coverArtworkSourceSchema.parse(clean.coverArtworkSource);
  const cardImage = clean.cardImage === undefined
    ? undefined
    : localImageSchema.parse(clean.cardImage);
  const detailImage = clean.detailImage === undefined
    ? undefined
    : localImageSchema.parse(clean.detailImage);
  const backgroundImage = clean.backgroundImage === undefined
    ? undefined
    : localImageSchema.parse(clean.backgroundImage);
  const galleryMedia = clean.galleryMedia === undefined
    ? undefined
    : galleryMediaSchema.parse(clean.galleryMedia);
  const imageMedia = clean.imageMedia === undefined
    ? undefined
    : imageMediaSchema.parse(clean.imageMedia);
  const mediaAccessibility = clean.mediaAccessibility === undefined
    ? undefined
    : mediaAccessibilitySchema.parse(clean.mediaAccessibility);
  const mediaModes = clean.mediaModes === undefined
    ? undefined
    : mediaModesSchema.parse(clean.mediaModes);
  const videoMedia = clean.videoMedia === undefined
    ? undefined
    : videoMediaSchema.parse(clean.videoMedia);
  const ageRating = clean.ageRating === undefined
    ? undefined
    : ageRatingSchema.parse(clean.ageRating);
  const compatibilityMetadata = clean.compatibilityMetadata === undefined
    ? undefined
    : compatibilityMetadataSchema.parse(clean.compatibilityMetadata);
  const performanceMetadata = clean.performanceMetadata === undefined
    ? undefined
    : performanceMetadataSchema.parse(clean.performanceMetadata);
  const distributionMetadata = clean.distributionMetadata === undefined
    ? undefined
    : distributionMetadataSchema.parse(clean.distributionMetadata);

  delete clean.coverArtworkSource;
  delete clean.cardImage;
  delete clean.detailImage;
  delete clean.backgroundImage;
  delete clean.galleryMedia;
  delete clean.imageMedia;
  delete clean.mediaAccessibility;
  delete clean.mediaModes;
  delete clean.videoMedia;
  delete clean.ageRating;
  delete clean.compatibilityMetadata;
  delete clean.performanceMetadata;
  delete clean.distributionMetadata;

  // Compatibilidad de lectura únicamente. Estas claves pertenecen a las
  // generaciones antiguas de previews externos y ya no forman parte del
  // runtime editorial activo. El único preview publicable es previewClip.
  delete clean.previewMode;
  delete clean.youtubePreview;
  delete clean.directPreview;

  return {
    core: clean,
    coverArtworkSource,
    cardImage,
    detailImage,
    backgroundImage,
    galleryMedia,
    imageMedia,
    mediaAccessibility,
    mediaModes,
    videoMedia,
    ageRating,
    compatibilityMetadata,
    performanceMetadata,
    distributionMetadata,
  };
}

function inferredMode(
  explicit: "image" | "video" | "hover-video" | undefined,
  video: { playback?: "always" | "hover" } | undefined,
  image: string | undefined,
  fallback: "image" | "video" | "hover-video"
) {
  if (explicit) return explicit;
  if (video) return video.playback === "hover" ? "hover-video" : "video";
  if (image) return "image";
  return fallback;
}

function inferredOptionalMode(
  explicit: "image" | "video" | "hover-video" | undefined,
  video: { playback?: "always" | "hover" } | undefined,
  image: string | undefined
) {
  if (explicit) return explicit;
  if (video) return video.playback === "hover" ? "hover-video" : "video";
  if (image) return "image";
  return undefined;
}

export function parseEditorialPayload<
  Type extends EditorialItemType,
>(
  type: Type,
  payload: unknown
): EditorialPayloadByType[Type];

export function parseEditorialPayload(
  type: EditorialItemType,
  payload: unknown
): EditorialPayloadByType[EditorialItemType] {
  if (type !== "game") {
    return parseCoreEditorialPayload(
      type,
      payload
    );
  }

  const {
    core,
    coverArtworkSource,
    cardImage,
    detailImage,
    backgroundImage,
    galleryMedia,
    imageMedia,
    mediaAccessibility,
    mediaModes,
    videoMedia,
    ageRating,
    compatibilityMetadata,
    performanceMetadata,
    distributionMetadata,
  } = splitGameCompatibilityPayload(payload);
  const game = parseCoreEditorialPayload("game", core);

  // Migración compatible: una publicación histórica sin cardImage conserva
  // exactamente su aspecto actual, pero captura la portada de ese snapshot
  // como recurso propio. Cambiar la Portada después ya no cambia la Card.
  const resolvedCardImage = cardImage ?? game.coverImage;
  const resolvedCoverArtworkSource = coverArtworkSource ?? (
    game.coverImage &&
    resolvedCardImage &&
    game.coverImage !== resolvedCardImage
      ? "custom"
      : "card"
  );
  // Una intención explícita/shared es autoridad: a nivel persistido Portada y
  // Card deben apuntar al mismo master. Los snapshots legacy con dos rutas
  // distintas se resolvieron como custom arriba y conservan ambas referencias.
  const resolvedCoverImage = resolvedCoverArtworkSource === "card"
    ? resolvedCardImage
    : game.coverImage;

  // Compatibilidad del Contenedor: antes la ficha reutilizaba directamente el
  // Hero (o Portada). Capturamos esa misma referencia y encuadre como metadata
  // propia, sin copiar bytes, para que desde aquí cambie de forma independiente.
  const resolvedDetailImage = detailImage ?? game.heroImage ?? resolvedCoverImage;
  const legacyDetailMigration = detailImage === undefined && Boolean(resolvedDetailImage);
  const inheritedDetailViewport = game.heroImage && resolvedDetailImage === game.heroImage
    ? imageMedia?.hero
    : imageMedia?.cover;
  const resolvedImageMedia = legacyDetailMigration
    ? {
        ...imageMedia,
        detail: {
          x: inheritedDetailViewport?.x ?? 0.5,
          y: inheritedDetailViewport?.y ?? 0.5,
          zoom: inheritedDetailViewport?.zoom ?? 1,
          ...(resolvedDetailImage ? { source: resolvedDetailImage } : {}),
          confirmed: true as const,
        },
      }
    : imageMedia;
  const resolvedMediaAccessibility = resolveMediaAccessibility(
    mediaAccessibility,
    galleryMedia,
    game.screenshots
  );

  // `cover` se admite en los schemas privados sólo para validar snapshots
  // antiguos. Desde aquí desaparecen su modo y su capa de video.
  const activeVideoMedia = videoMedia
    ? {
        ...(videoMedia.hero ? { hero: videoMedia.hero } : {}),
        ...(videoMedia.card ? { card: videoMedia.card } : {}),
        ...(videoMedia.detail ? { detail: videoMedia.detail } : {}),
        ...(videoMedia.background ? { background: videoMedia.background } : {}),
      }
    : undefined;
  const hasActiveVideoMedia = Boolean(
    activeVideoMedia && Object.keys(activeVideoMedia).length > 0
  );
  const legacyCardPreview =
    !activeVideoMedia?.card && game.previewClip
      ? { playback: "hover" as const }
      : undefined;
  const backgroundMode = inferredOptionalMode(
    mediaModes?.background,
    activeVideoMedia?.background,
    backgroundImage
  );
  const resolvedMediaModes = {
    hero: normalizeGameMediaMode(
      "hero",
      inferredMode(
        mediaModes?.hero,
        activeVideoMedia?.hero,
        game.heroImage,
        "hover-video"
      )
    ),
    card: normalizeGameMediaMode(
      "card",
      inferredMode(
        mediaModes?.card,
        activeVideoMedia?.card ?? legacyCardPreview,
        resolvedCardImage,
        "image"
      )
    ),
    detail: normalizeGameMediaMode(
      "detail",
      inferredMode(
        mediaModes?.detail,
        activeVideoMedia?.detail,
        resolvedDetailImage,
        "image"
      )
    ),
    ...(backgroundMode
      ? {
          background: normalizeGameMediaMode(
            "background",
            backgroundMode
          ),
        }
      : {}),
  };

  const normalizedGame: Game = {
    ...game,
    coverArtworkSource: resolvedCoverArtworkSource,
    ...(resolvedCoverImage ? { coverImage: resolvedCoverImage } : {}),
    ...(resolvedCardImage ? { cardImage: resolvedCardImage } : {}),
    ...(resolvedDetailImage ? { detailImage: resolvedDetailImage } : {}),
    ...(backgroundImage ? { backgroundImage } : {}),
    ...(galleryMedia !== undefined ? { galleryMedia } : {}),
    ...(resolvedImageMedia ? { imageMedia: resolvedImageMedia } : {}),
    ...(resolvedMediaAccessibility ? { mediaAccessibility: resolvedMediaAccessibility } : {}),
    mediaModes: resolvedMediaModes,
    ...(hasActiveVideoMedia ? { videoMedia: activeVideoMedia } : {}),
    ...(ageRating ? { ageRating } : {}),
    ...(compatibilityMetadata ? { compatibilityMetadata } : {}),
    ...(performanceMetadata ? { performanceMetadata } : {}),
    ...(distributionMetadata ? { distributionMetadata } : {}),
  };

  return normalizedGame;
}
