import { z } from "zod";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || undefined);

const bundledImagePattern =
  /^\/images\/[A-Za-z0-9/_.,@+() -]+\.(?:avif|gif|jpe?g|png|webp)$/i;
const editorialMediaPattern =
  /^\/media\/editorial\/[a-z0-9][a-z0-9._-]{0,159}\/[a-f0-9]{64}\.webp$/;

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

const optionalLocalImage = z
  .string()
  .trim()
  .max(400)
  .refine(
    (value) =>
      value === "" || isSafeLocalImagePath(value)
  )
  .transform((value) => value || undefined);

const screenshotsTextSchema = z
  .string()
  .max(3_500)
  .transform((value) =>
    value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
  )
  .pipe(
    z
      .array(
        z
          .string()
          .max(400)
          .refine(isSafeLocalImagePath)
      )
      .max(8)
      .superRefine((screenshots, context) => {
        const seen = new Set<string>();

        screenshots.forEach((screenshot, index) => {
          if (seen.has(screenshot)) {
            context.addIssue({
              code: "custom",
              path: [index],
              message: "Una captura no puede repetirse.",
            });
          }
          seen.add(screenshot);
        });
      })
  )
  .transform((value) =>
    value.length > 0 ? value : undefined
  );

const downloadSourceStatusSchema = z.enum([
  "available",
  "down",
  "maintenance",
]);

const downloadSourceFormSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    name: z.string().trim().min(1).max(100),
    href: z
      .string()
      .trim()
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
      }),
    label: optionalText(240),
    enabled: z.boolean().optional(),
    status: downloadSourceStatusSchema.optional(),
  })
  .strict();

const optionalDistributionChannelSchema = z
  .enum(["", "stable", "beta", "testing"])
  .transform((value) => value || undefined);

const optionalSha256Schema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^[a-f0-9]{64}$/i.test(value),
    "El SHA-256 debe contener exactamente 64 caracteres hexadecimales."
  )
  .transform((value) => value ? value.toLowerCase() : undefined);

const optionalPositiveNumber = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      /^\d{1,6}(?:\.\d{1,2})?$/.test(value)
  )
  .transform((value) =>
    value === "" ? undefined : Number(value)
  )
  .refine(
    (value) =>
      value === undefined ||
      (Number.isFinite(value) && value > 0 && value <= 100_000)
  );

function optionalCalibrationNumber(maximum: number) {
  return z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        /^\d{1,4}(?:\.\d{1,2})?$/.test(value)
    )
    .transform((value) =>
      value === "" ? undefined : Number(value)
    )
    .refine(
      (value) =>
        value === undefined ||
        (Number.isFinite(value) && value > 0 && value <= maximum)
    );
}

const optionalBenchmarkSourceSchema = z
  .enum(["", "internal", "developer", "publisher", "community", "external"])
  .transform((value) => value || undefined);

const optionalBenchmarkConfidenceSchema = z
  .enum(["", "low", "medium", "high"])
  .transform((value) => value || undefined);

const optionalCanonicalDateSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (value === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  })
  .transform((value) => value || undefined);

const optionalPositiveInteger = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" || /^\d{1,5}$/.test(value)
  )
  .transform((value) =>
    value === "" ? undefined : Number(value)
  )
  .refine(
    (value) =>
      value === undefined ||
      (Number.isInteger(value) && value > 0 && value <= 10_000)
  );

const downloadSourcesJsonSchema = z
  .string()
  .max(5_500)
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({
        code: "custom",
        message: "La lista de fuentes no contiene JSON válido.",
      });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(downloadSourceFormSchema)
      .max(6)
      .superRefine((sources, context) => {
        const ids = new Set<string>();
        const hrefs = new Set<string>();

        sources.forEach((source, index) => {
          if (ids.has(source.id)) {
            context.addIssue({
              code: "custom",
              path: [index, "id"],
              message: "Los identificadores de las fuentes deben ser únicos.",
            });
          }
          ids.add(source.id);

          if (hrefs.has(source.href)) {
            context.addIssue({
              code: "custom",
              path: [index, "href"],
              message: "Una misma dirección no puede repetirse.",
            });
          }
          hrefs.add(source.href);
        });
      })
  );

export const expectedRevisionSchema = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number)
  .pipe(z.number().int().positive());

export const editorialGameDownloadFormSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  sizeGb: optionalPositiveNumber,
  fileCount: optionalPositiveInteger,
  platform: optionalText(80),
  channel: optionalDistributionChannelSchema,
  checksumSha256: optionalSha256Schema,
  sourcesJson: downloadSourcesJsonSchema,
});

export const editorialGamePerformanceFormSchema = z
  .object({
    expectedRevision: expectedRevisionSchema,
    referenceFps: optionalCalibrationNumber(1_000),
    ramGb: optionalCalibrationNumber(512),
    fpsCap: optionalCalibrationNumber(1_000),
    benchmarkSource: optionalBenchmarkSourceSchema,
    benchmarkSourceLabel: optionalText(160),
    benchmarkMeasuredAt: optionalCanonicalDateSchema,
    benchmarkConfidence: optionalBenchmarkConfidenceSchema,
  })
  .superRefine((value, context) => {
    const hasAny =
      value.referenceFps !== undefined ||
      value.ramGb !== undefined ||
      value.fpsCap !== undefined;
    const hasMetadata =
      value.benchmarkSource !== undefined ||
      value.benchmarkSourceLabel !== undefined ||
      value.benchmarkMeasuredAt !== undefined ||
      value.benchmarkConfidence !== undefined;

    if (!hasAny) {
      if (hasMetadata) {
        context.addIssue({
          code: "custom",
          path: ["benchmarkSource"],
          message:
            "La procedencia sólo puede guardarse junto con una calibración de FPS y RAM.",
        });
      }
      return;
    }

    if (value.referenceFps === undefined) {
      context.addIssue({
        code: "custom",
        path: ["referenceFps"],
        message: "Indica los FPS de referencia.",
      });
    }

    if (value.ramGb === undefined) {
      context.addIssue({
        code: "custom",
        path: ["ramGb"],
        message: "Indica la RAM de referencia.",
      });
    }

    if (
      value.referenceFps !== undefined &&
      value.fpsCap !== undefined &&
      value.referenceFps > value.fpsCap
    ) {
      context.addIssue({
        code: "custom",
        path: ["fpsCap"],
        message:
          "El límite de FPS no puede ser menor que los FPS de referencia.",
      });
    }
  });

export const editorialGameMediaFormSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  coverImage: optionalLocalImage,
  heroImage: optionalLocalImage,
  screenshotsText: screenshotsTextSchema,
});

export const editorialUpdateFormSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  version: z.string().trim().min(1).max(80),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .refine((value) => {
      const parsed = new Date(`${value}:00Z`);

      return (
        Number.isFinite(parsed.getTime()) &&
        parsed.toISOString().slice(0, 16) === value
      );
    })
    .transform((value) =>
      new Date(`${value}:00Z`).toISOString()
    ),
  type: z.enum([
    "update",
    "content",
    "fix",
    "improvement",
  ]),
  summary: z.string().trim().min(1).max(1_500),
  featured: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
});

export const editorialSiteConfigFormSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  name: z.string().trim().min(1).max(100),
  shortName: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  language: z.literal("es"),
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i),
});

export const revisionIdSchema = z
  .string()
  .regex(/^\d{1,20}$/);
