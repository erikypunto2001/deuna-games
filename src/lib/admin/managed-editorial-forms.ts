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

const releaseSourceStatus = z.enum([
  "available",
  "down",
  "maintenance",
]);

const releaseSource = z
  .object({
    id: identifier,
    name:
      requiredText(100),
    href: z
      .string()
      .trim()
      .max(2_048)
      .refine(
        (value) => {
          if (
            value.startsWith(
              "/"
            )
          ) {
            return (
              !value.startsWith(
                "//"
              ) &&
              !value.includes(
                "\\"
              )
            );
          }

          try {
            const url =
              new URL(
                value
              );

            return (
              url.protocol ===
                "https:" &&
              !url.username &&
              !url.password
            );
          } catch {
            return false;
          }
        },
        "La fuente debe usar HTTPS sin credenciales o una ruta interna segura."
      ),
    label:
      optionalText(240),
    enabled:
      z.boolean().optional(),
    status:
      releaseSourceStatus.optional(),
  })
  .strict();

const optionalPositiveNumber = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      /^\d{1,6}(?:\.\d{1,2})?$/.test(
        value
      )
  )
  .transform(
    (value) =>
      value === ""
        ? undefined
        : Number(value)
  )
  .refine(
    (value) =>
      value === undefined ||
      (
        Number.isFinite(
          value
        ) &&
        value > 0 &&
        value <= 100_000
      )
  );

const optionalPositiveInteger = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      /^\d{1,5}$/.test(
        value
      )
  )
  .transform(
    (value) =>
      value === ""
        ? undefined
        : Number(value)
  )
  .refine(
    (value) =>
      value === undefined ||
      (
        Number.isInteger(
          value
        ) &&
        value > 0 &&
        value <= 10_000
      )
  );

const releaseSourcesJson =
  jsonField(5_500)
    .pipe(
      z
        .array(
          releaseSource
        )
        .max(6)
        .superRefine(
          (
            sources,
            context
          ) => {
            const ids =
              new Set<string>();
            const hrefs =
              new Set<string>();

            sources.forEach(
              (
                source,
                index
              ) => {
                if (
                  ids.has(
                    source.id
                  )
                ) {
                  context.addIssue({
                    code:
                      "custom",
                    path: [
                      index,
                      "id",
                    ],
                    message:
                      "Los identificadores de los mirrors deben ser únicos.",
                  });
                }
                ids.add(
                  source.id
                );

                if (
                  hrefs.has(
                    source.href
                  )
                ) {
                  context.addIssue({
                    code:
                      "custom",
                    path: [
                      index,
                      "href",
                    ],
                    message:
                      "Una misma dirección no puede repetirse dentro del paquete.",
                  });
                }
                hrefs.add(
                  source.href
                );
              }
            );
          }
        )
    );

export const integratedReleasePackageFormSchema =
  z.object({
    expectedRevision:
      expectedRevisionSchema,
    sizeGb:
      optionalPositiveNumber,
    fileCount:
      optionalPositiveInteger,
    channel: z
      .enum([
        "",
        "stable",
        "beta",
        "testing",
      ])
      .transform(
        (value) =>
          value ||
          undefined
      ),
    checksumSha256: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          /^[a-f0-9]{64}$/i.test(
            value
          ),
        "El SHA-256 debe contener exactamente 64 caracteres hexadecimales."
      )
      .transform(
        (value) =>
          value
            ? value.toLowerCase()
            : undefined
      ),
    sourcesJson:
      releaseSourcesJson,
  });

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
