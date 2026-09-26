import {
  z,
} from "zod";

import {
  expectedRevisionSchema,
} from "./content-forms";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/
  );

const requiredText = (
  maximum: number
) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum);

const optionalText = (
  maximum: number
) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform(
      (value) =>
        value || undefined
    );

const booleanText = z
  .enum([
    "true",
    "false",
  ])
  .transform(
    (value) =>
      value === "true"
  );

function jsonField(
  maximum: number
) {
  return z
    .string()
    .max(maximum)
    .transform(
      (
        value,
        context
      ) => {
        try {
          return JSON.parse(
            value
          ) as unknown;
        } catch {
          context.addIssue({
            code: "custom",
            message:
              "El campo JSON no es válido.",
          });
          return z.NEVER;
        }
      }
    );
}

export const softwareCreateFormSchema =
  z.object({
    slug: identifier,
    name:
      requiredText(140),
    shortDescription:
      optionalText(240),
    description:
      requiredText(3_000),
    kind: z.enum([
      "emulator",
      "utility",
      "upscaler",
      "launcher",
      "runtime",
      "other",
    ]),
    version:
      optionalText(240),
    developer:
      optionalText(240),
    website:
      optionalText(2_048),
    imageAlt:
      requiredText(240),
    featured:
      booleanText,
    runsOnJson:
      jsonField(4_000),
    emulatesJson:
      jsonField(6_000),
    packagesJson:
      jsonField(24_000),
  });

export const softwareEditFormSchema =
  softwareCreateFormSchema
    .omit({
      slug: true,
    })
    .extend({
      expectedRevision:
        expectedRevisionSchema,
    });

export const collectionCreateFormSchema =
  z.object({
    slug: identifier,
    title:
      requiredText(140),
    description:
      requiredText(2_500),
    imageAlt:
      requiredText(240),
    featured:
      booleanText,
    gameSlugsJson:
      jsonField(16_000),
  });

export const collectionEditFormSchema =
  collectionCreateFormSchema
    .omit({
      slug: true,
    })
    .extend({
      expectedRevision:
        expectedRevisionSchema,
    });

export const platformCatalogFormSchema =
  z.object({
    expectedRevision:
      expectedRevisionSchema,
    catalogJson:
      jsonField(40_000),
  });

export const gameReleasesFormSchema =
  z.object({
    expectedRevision:
      expectedRevisionSchema,
    releasesJson:
      jsonField(80_000),
  });
