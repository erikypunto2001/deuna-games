import { z } from "zod";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || undefined);

export const editorialGameCreateFormSchema = z
  .object({
    slug: identifierSchema,
    title: z.string().trim().min(1).max(140),
    description: z.string().trim().min(1).max(2_500),
    category: z.string().trim().min(1).max(80),
    version: optionalText(240),
    badge: optionalText(240),
    imageAlt: z.string().trim().min(1).max(240),
  })
  .strict();

