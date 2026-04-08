import { z } from "zod";

/**
 * Supported connection protocols for a MikroTik device.
 */
export const connectionTypes = ["agent", "rest", "binary_api", "snmp"] as const;

/**
 * Possible operational statuses for a device.
 */
export const deviceStatuses = [
  "online",
  "offline",
  "warning",
  "unreachable",
] as const;

const connectionTypeEnum = z.enum(connectionTypes);
const deviceStatusEnum = z.enum(deviceStatuses);

/**
 * Schema for registering a new device in the platform.
 */
export const addDeviceSchema = z.object({
  name: z.string().min(1).max(255),
  connectionType: connectionTypeEnum,
  ipAddress: z.string().optional(),
  apiPort: z.number().int().min(1).max(65535).optional(),
  description: z.string().optional(),
  siteId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Schema for updating an existing device — all fields are optional.
 */
export const updateDeviceSchema = addDeviceSchema.partial();

/**
 * Schema for listing/filtering devices with cursor-based pagination.
 */
export const deviceListInputSchema = z.object({
  siteId: z.string().uuid().optional(),
  status: deviceStatusEnum.optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

/**
 * Schema for a single interface traffic sample within a device metric snapshot.
 */
const deviceInterfaceMetricSchema = z.object({
  name: z.string(),
  rxBytes: z.number().int(),
  txBytes: z.number().int(),
  rxPackets: z.number().int(),
  txPackets: z.number().int(),
});

/**
 * Schema for a device metric snapshot pushed from an agent or polled via API.
 */
export const deviceMetricSchema = z.object({
  deviceId: z.string().uuid(),
  cpu: z.number().min(0).max(100),
  freeMemory: z.number().int(),
  totalMemory: z.number().int(),
  uptime: z.number().int(),
  interfaces: z.array(deviceInterfaceMetricSchema),
});

export const testConnectionSchema = z.object({
  connectionType: connectionTypeEnum,
  ipAddress: z.string(),
  port: z.number().int().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  snmpCommunity: z.string().optional(),
  snmpVersion: z.enum(["v2c", "v3"]).optional(),
});

export const generateEnrollTokenSchema = z.object({
  deviceId: z.string().uuid(),
});

export const checkEnrollmentSchema = z.object({
  deviceId: z.string().uuid(),
});

export const connectionTestResultSchema = z.object({
  success: z.boolean(),
  rosVersion: z.string().optional(),
  boardName: z.string().optional(),
  model: z.string().optional(),
  error: z.string().optional(),
});

export type ConnectionType = z.infer<typeof connectionTypeEnum>;
export type DeviceStatus = z.infer<typeof deviceStatusEnum>;
export type AddDeviceInput = z.infer<typeof addDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type DeviceListInput = z.infer<typeof deviceListInputSchema>;
export type DeviceInterfaceMetric = z.infer<typeof deviceInterfaceMetricSchema>;
export type DeviceMetric = z.infer<typeof deviceMetricSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
export type GenerateEnrollTokenInput = z.infer<typeof generateEnrollTokenSchema>;
export type CheckEnrollmentInput = z.infer<typeof checkEnrollmentSchema>;
export type ConnectionTestResult = z.infer<typeof connectionTestResultSchema>;
