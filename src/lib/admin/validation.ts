import { z } from "zod";

import {
  ADMIN_PASSWORD_MAX_LENGTH,
  ADMIN_PASSWORD_MIN_LENGTH,
} from "./password.ts";

export const ADMIN_USERNAME_PATTERN =
  /^[a-zA-Z0-9._-]+$/;

function optionalAdminDisplayName(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export const adminUsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(ADMIN_USERNAME_PATTERN);

export const adminLoginSchema = z.object({
  username: adminUsernameSchema,
  password: z
    .string()
    .min(1)
    .max(ADMIN_PASSWORD_MAX_LENGTH),
});

export const adminCurrentPasswordSchema = z
  .string()
  .min(1)
  .max(ADMIN_PASSWORD_MAX_LENGTH);

export const adminCreateAccountSchema = z.object({
  username: adminUsernameSchema,
  password: z
    .string()
    .min(ADMIN_PASSWORD_MIN_LENGTH)
    .max(ADMIN_PASSWORD_MAX_LENGTH),
  displayName: z.preprocess(
    optionalAdminDisplayName,
    z.string().max(80).optional()
  ),
  currentPassword: adminCurrentPasswordSchema,
});

export const adminAccountStatusSchema = z.object({
  userId: z.string().uuid(),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
  currentPassword: adminCurrentPasswordSchema,
});

export const adminAccountPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z
    .string()
    .min(ADMIN_PASSWORD_MIN_LENGTH)
    .max(ADMIN_PASSWORD_MAX_LENGTH),
  currentPassword: adminCurrentPasswordSchema,
});

export function normalizeAdminUsername(
  username: string
) {
  return username
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}
