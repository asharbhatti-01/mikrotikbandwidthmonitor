import { z } from "zod";

/**
 * Schema for triggering an on-demand configuration backup for a device.
 */
export const triggerBackupSchema = z.object({
  deviceId: z.string().uuid(),
});

/**
 * Supported RouterOS command types that can be pushed to a device.
 */
export const commandTypeEnum = z.enum([
  "firewall.rule.add",
  "firewall.rule.remove",
  "ip.address.add",
  "ip.address.remove",
  "system.script.run",
]);

/**
 * Schema for pushing a configuration command to a device.
 *
 * Safe mode rolls back the change automatically after `safeModeTTL` seconds
 * unless confirmed, preventing accidental lockouts.
 */
export const configPushSchema = z.object({
  deviceId: z.string().uuid(),
  commandType: commandTypeEnum,
  payload: z.record(z.unknown()),
  safeMode: z.boolean().default(true),
  safeModeTTL: z.number().int().min(10).max(120).default(30),
});

/**
 * Schema for listing configuration snapshots for a device with cursor-based pagination.
 */
export const snapshotListSchema = z.object({
  deviceId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export type TriggerBackupInput = z.infer<typeof triggerBackupSchema>;
export type CommandType = z.infer<typeof commandTypeEnum>;
export type ConfigPushInput = z.infer<typeof configPushSchema>;
export type SnapshotListInput = z.infer<typeof snapshotListSchema>;
