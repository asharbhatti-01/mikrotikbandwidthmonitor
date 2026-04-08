import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../init.js";
import {
  addDeviceSchema,
  updateDeviceSchema,
  deviceListInputSchema,
  testConnectionSchema,
  generateEnrollTokenSchema,
  checkEnrollmentSchema,
} from "@mikrotik/types";
import { devices, deviceMetrics, agentEnrollments } from "@mikrotik/db/schema";
import { randomBytes } from "crypto";
import { testRestConnection } from "../../lib/routeros-rest.js";
import { testBinaryApiConnection } from "../../lib/routeros-api.js";
import { testSnmpConnection } from "../../lib/snmp-test.js";
import { encryptCredential } from "../../lib/encryption.js";

/**
 * Devices router — CRUD operations, status refresh, and metric history.
 */
export const devicesRouter = router({
  /**
   * List devices for the current org with cursor-based pagination.
   * Supports filtering by status, siteId, tags array containment, and
   * full-text search across name / description / IP address.
   */
  list: protectedProcedure
    .input(deviceListInputSchema)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { limit, cursor, status, siteId, tags, search } = input;

      const conditions = [eq(devices.orgId, org.id)];

      if (status) {
        conditions.push(eq(devices.status, status));
      }

      if (siteId) {
        conditions.push(eq(devices.siteId, siteId));
      }

      if (tags && tags.length > 0) {
        // Postgres array containment: tags @> ARRAY['tag1','tag2']
        conditions.push(
          sql`${devices.tags} @> ${sql`ARRAY[${sql.join(
            tags.map((t) => sql`${t}`),
            sql`, `
          )}]::text[]`}`
        );
      }

      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            ilike(devices.name, pattern),
            ilike(devices.description, pattern),
            ilike(devices.ipAddress, pattern)
          )!
        );
      }

      if (cursor) {
        conditions.push(gt(devices.id, cursor));
      }

      const rows = await db
        .select()
        .from(devices)
        .where(and(...conditions))
        .orderBy(asc(devices.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      return { items, nextCursor };
    }),

  /**
   * Get a single device by ID — scoped to the current org.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [device] = await db
        .select()
        .from(devices)
        .where(and(eq(devices.id, input.id), eq(devices.orgId, org.id)))
        .limit(1);

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      // Fetch latest metric snapshot for live data
      const [latestMetric] = await db
        .select()
        .from(deviceMetrics)
        .where(eq(deviceMetrics.deviceId, device.id))
        .orderBy(desc(deviceMetrics.collectedAt))
        .limit(1);

      const ifaces = latestMetric?.interfaces;
      const ifaceArray = Array.isArray(ifaces) ? ifaces : (typeof ifaces === 'string' ? JSON.parse(ifaces) : []);

      return {
        ...device,
        routerOsVersion: device.rosVersion,
        uptimeSeconds: device.uptimeSeconds ? Number(device.uptimeSeconds) : null,
        lastCpuLoad: latestMetric?.cpuLoad ?? null,
        lastFreeMemory: latestMetric?.freeMemory ?? null,
        lastTotalMemory: latestMetric?.totalMemory ?? null,
        interfaceCount: ifaceArray.length || null,
      };
    }),

  /**
   * Register a new device in the organisation.
   */
  add: protectedProcedure
    .input(addDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const values: Record<string, unknown> = {
        orgId: org.id,
        name: input.name,
        connectionType: input.connectionType,
        ipAddress: input.ipAddress,
        apiPort: input.apiPort ?? (input.connectionType === 'rest' ? 443 : 8728),
        description: input.description,
        siteId: input.siteId,
        tags: input.tags ?? [],
        rosVersion: input.rosVersion,
        boardName: input.boardName,
        model: input.model,
      };

      // Encrypt and store credentials
      if (input.username) values.apiUsernameEnc = encryptCredential(input.username);
      if (input.password) values.apiPasswordEnc = encryptCredential(input.password);
      if (input.sshKey) values.sshKeyEnc = encryptCredential(input.sshKey);
      if (input.authMethod) values.authMethod = input.authMethod;
      if (input.snmpCommunity) values.snmpCommunity = input.snmpCommunity;
      if (input.snmpVersion) values.snmpVersion = input.snmpVersion;

      const [device] = await db
        .insert(devices)
        .values(values as typeof devices.$inferInsert)
        .returning();

      return device!;
    }),

  /**
   * Update mutable fields on an existing device.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: updateDeviceSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      // Verify ownership before mutating
      const [existing] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, input.id), eq(devices.orgId, org.id)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      const [updated] = await db
        .update(devices)
        .set({
          ...input.data,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, input.id))
        .returning();

      return updated!;
    }),

  /**
   * Remove a device from the organisation (hard delete — cascades in DB).
   */
  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [deleted] = await db
        .delete(devices)
        .where(and(eq(devices.id, input.id), eq(devices.orgId, org.id)))
        .returning({ id: devices.id });

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return { id: deleted.id };
    }),

  /**
   * Enqueue a status refresh for the device.
   * The agent / poller will pick this up from the Redis job queue.
   */
  refreshStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, redis } = ctx;

      const [device] = await db
        .select({ id: devices.id, status: devices.status })
        .from(devices)
        .where(and(eq(devices.id, input.id), eq(devices.orgId, org.id)))
        .limit(1);

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      // Push a refresh job onto the Redis queue consumed by the agent worker.
      await redis.lpush(
        "queue:device:refresh",
        JSON.stringify({ deviceId: device.id, orgId: org.id, requestedAt: new Date().toISOString() })
      );

      return { queued: true, deviceId: device.id };
    }),

  /**
   * Retrieve time-series metric snapshots for a device.
   * `timeRange` is an ISO 8601 duration string, e.g. "PT1H" (1 hour), "P1D" (1 day).
   * Results are ordered by `collectedAt` ascending.
   */
  metricHistory: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().uuid(),
        timeRange: z
          .enum(["PT1H", "PT6H", "PT12H", "P1D", "P7D", "P30D"])
          .default("PT1H"),
        limit: z.number().int().min(1).max(1000).default(200),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      // Verify the device belongs to this org
      const [device] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, input.deviceId), eq(devices.orgId, org.id)))
        .limit(1);

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      // Map duration string to a Postgres interval literal
      const intervalMap: Record<string, string> = {
        PT1H: "1 hour",
        PT6H: "6 hours",
        PT12H: "12 hours",
        P1D: "1 day",
        P7D: "7 days",
        P30D: "30 days",
      };
      const interval = intervalMap[input.timeRange] ?? "1 hour";

      const metrics = await db
        .select()
        .from(deviceMetrics)
        .where(
          and(
            eq(deviceMetrics.deviceId, input.deviceId),
            sql`${deviceMetrics.collectedAt} >= NOW() - ${sql.raw(`INTERVAL '${interval}'`)}`
          )
        )
        .orderBy(asc(deviceMetrics.collectedAt))
        .limit(input.limit);

      return metrics;
    }),

  testConnection: protectedProcedure
    .input(testConnectionSchema)
    .mutation(async ({ input }) => {
      switch (input.connectionType) {
        case 'rest':
          return testRestConnection(
            input.ipAddress,
            input.port ?? 443,
            input.username ?? 'admin',
            input.password ?? '',
          )
        case 'binary_api':
          return testBinaryApiConnection(
            input.ipAddress,
            input.port ?? 8728,
            input.username ?? 'admin',
            input.password ?? '',
          )
        case 'snmp':
          return testSnmpConnection(
            input.ipAddress,
            input.snmpCommunity ?? 'public',
            input.snmpVersion ?? 'v2c',
          )
        default:
          return { success: false, error: 'Agent mode does not support connection testing' }
      }
    }),

  generateEnrollToken: protectedProcedure
    .input(generateEnrollTokenSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx

      const [device] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, input.deviceId), eq(devices.orgId, org.id)))
        .limit(1)

      if (!device) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Device not found' })
      }

      const token = randomBytes(32).toString('hex')

      await db.insert(agentEnrollments).values({
        deviceId: input.deviceId,
        enrollToken: token,
      })

      const baseUrl = process.env['PUBLIC_URL'] ?? 'https://mkmgmt.computecloud.net'
      const installCommand = `curl -sSL ${baseUrl}/install | sh -s -- --token ${token}`

      return { token, installCommand }
    }),

  checkEnrollment: protectedProcedure
    .input(checkEnrollmentSchema)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx

      // Verify device belongs to org
      const [device] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, input.deviceId), eq(devices.orgId, org.id)))
        .limit(1)

      if (!device) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Device not found' })
      }

      const [enrollment] = await db
        .select()
        .from(agentEnrollments)
        .where(
          and(
            eq(agentEnrollments.deviceId, input.deviceId),
            eq(agentEnrollments.tokenUsed, true),
          ),
        )
        .limit(1)

      if (!enrollment) {
        return { enrolled: false }
      }

      return {
        enrolled: true,
        agentVersion: enrollment.agentVersion,
        connectedIp: enrollment.connectedIp,
        lastConnectedAt: enrollment.lastConnectedAt,
      }
    }),
});
