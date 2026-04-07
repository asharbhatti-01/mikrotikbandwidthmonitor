import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../index.js";
import {
  addDeviceSchema,
  updateDeviceSchema,
  deviceListInputSchema,
} from "@mikrotik/types";
import { devices, deviceMetrics } from "@mikrotik/db/schema";

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

      return device;
    }),

  /**
   * Register a new device in the organisation.
   */
  add: protectedProcedure
    .input(addDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [device] = await db
        .insert(devices)
        .values({
          orgId: org.id,
          name: input.name,
          connectionType: input.connectionType,
          ipAddress: input.ipAddress,
          apiPort: input.apiPort ?? 8728,
          description: input.description,
          siteId: input.siteId,
          tags: input.tags ?? [],
        })
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
});
