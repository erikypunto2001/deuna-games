import { z } from "zod";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || undefined);

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

export const expectedRevisionSchema = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number)
  .pipe(z.number().int().positive());

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
