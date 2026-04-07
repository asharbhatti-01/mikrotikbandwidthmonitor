import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { router, protectedProcedure } from "../index.js";
import { snapshotListSchema, triggerBackupSchema } from "@mikrotik/types";
import { configSnapshots, devices } from "@mikrotik/db/schema";

/**
 * Config router — configuration snapshot management for MikroTik devices.
 */
export const configRouter = router({
  /**
   * List configuration snapshots for a device with cursor-based pagination.
   * Results are ordered newest-first.
   */
  listSnapshots: protectedProcedure
    .input(snapshotListSchema)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { deviceId, limit, cursor } = input;

      // Verify the device belongs to the org
      const [device] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, deviceId), eq(devices.orgId, org.id)))
        .limit(1);

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      const conditions = [
        eq(configSnapshots.deviceId, deviceId),
        eq(configSnapshots.orgId, org.id),
      ];

      if (cursor) {
        // Cursor is the last-seen snapshot ID; use it for keyset pagination
        conditions.push(gt(configSnapshots.id, cursor));
      }

      const rows = await db
        .select({
          id: configSnapshots.id,
          deviceId: configSnapshots.deviceId,
          orgId: configSnapshots.orgId,
          takenAt: configSnapshots.takenAt,
          triggeredBy: configSnapshots.triggeredBy,
          triggeredByUserId: configSnapshots.triggeredByUserId,
          sizeBytes: configSnapshots.sizeBytes,
          checksum: configSnapshots.checksum,
          // Omit exportRsc from list view to keep payloads small
        })
        .from(configSnapshots)
        .where(and(...conditions))
        .orderBy(desc(configSnapshots.takenAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      return { items, nextCursor };
    }),

  /**
   * Fetch a single snapshot including its full `exportRsc` payload.
   */
  getSnapshot: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [snapshot] = await db
        .select()
        .from(configSnapshots)
        .where(
          and(
            eq(configSnapshots.id, input.id),
            eq(configSnapshots.orgId, org.id)
          )
        )
        .limit(1);

      if (!snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Configuration snapshot not found",
        });
      }

      return snapshot;
    }),

  /**
   * Request an on-demand configuration backup for a device.
   * Enqueues a job on the Redis backup queue consumed by the agent worker.
   */
  triggerBackup: protectedProcedure
    .input(triggerBackupSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org, user, redis } = ctx;

      const [device] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.id, input.deviceId), eq(devices.orgId, org.id)))
        .limit(1);

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      await redis.lpush(
        "queue:device:config:backup",
        JSON.stringify({
          deviceId: device.id,
          orgId: org.id,
          triggeredByUserId: user.id,
          trigger: "manual",
          requestedAt: new Date().toISOString(),
        })
      );

      return { queued: true, deviceId: device.id };
    }),

  /**
   * Compute a line-level diff between two configuration snapshots.
   * Returns an array of unified diff hunks.
   */
  diff: protectedProcedure
    .input(
      z.object({
        snapshotIdA: z.string().uuid(),
        snapshotIdB: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [snapA, snapB] = await Promise.all([
        db
          .select({
            id: configSnapshots.id,
            exportRsc: configSnapshots.exportRsc,
            takenAt: configSnapshots.takenAt,
            checksum: configSnapshots.checksum,
          })
          .from(configSnapshots)
          .where(
            and(
              eq(configSnapshots.id, input.snapshotIdA),
              eq(configSnapshots.orgId, org.id)
            )
          )
          .limit(1)
          .then((r) => r[0]),

        db
          .select({
            id: configSnapshots.id,
            exportRsc: configSnapshots.exportRsc,
            takenAt: configSnapshots.takenAt,
            checksum: configSnapshots.checksum,
          })
          .from(configSnapshots)
          .where(
            and(
              eq(configSnapshots.id, input.snapshotIdB),
              eq(configSnapshots.orgId, org.id)
            )
          )
          .limit(1)
          .then((r) => r[0]),
      ]);

      if (!snapA) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Snapshot ${input.snapshotIdA} not found`,
        });
      }
      if (!snapB) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Snapshot ${input.snapshotIdB} not found`,
        });
      }

      // Produce a simple line-level diff without an external dependency.
      // For production use, consider the `diff` npm package for Myers diff.
      const linesA = snapA.exportRsc.split("\n");
      const linesB = snapB.exportRsc.split("\n");

      const added = linesB.filter((l) => !linesA.includes(l));
      const removed = linesA.filter((l) => !linesB.includes(l));

      return {
        snapshotA: { id: snapA.id, takenAt: snapA.takenAt, checksum: snapA.checksum },
        snapshotB: { id: snapB.id, takenAt: snapB.takenAt, checksum: snapB.checksum },
        unchanged: snapA.checksum === snapB.checksum,
        added,
        removed,
        addedCount: added.length,
        removedCount: removed.length,
      };
    }),
});
