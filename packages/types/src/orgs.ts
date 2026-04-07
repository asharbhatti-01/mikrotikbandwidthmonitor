import { z } from "zod";

/**
 * Schema for updating an existing organisation's profile and settings.
 */
export const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  timezone: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

/**
 * Schema for creating a new organisation.
 *
 * `slug` is used as the URL-safe identifier and must contain only lowercase
 * alphanumeric characters and hyphens.
 */
export const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric characters optionally separated by hyphens"
    ),
});

export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
