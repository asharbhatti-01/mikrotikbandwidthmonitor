import { z } from "zod";

/**
 * Schema for creating a new API key.
 *
 * `scopes` restrict which API endpoints the key may access.
 * `expiresAt` is optional; omitting it creates a non-expiring key.
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()),
  expiresAt: z.coerce.date().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
