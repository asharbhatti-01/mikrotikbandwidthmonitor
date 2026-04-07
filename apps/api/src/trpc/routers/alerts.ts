import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../init.js";
import { createAlertRuleSchema, updateAlertRuleSchema } from "@mikrotik/types";
import { alertRules, alertEvents, devices } from "@mikrotik/db/schema";

/**
 * Alerts router — rule management and event history.
 */
export const alertsRouter = router({
  /**
   * List all alert rules for the current org.
   * Optionally filter to a specific device or by enabled state.
   */
  listRules: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().uuid().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const conditions = [eq(alertRules.orgId, org.id)];

      if (input.deviceId !== undefined) {
        conditions.push(eq(alertRules.deviceId, input.deviceId));
      }

      if (input.enabled !== undefined) {
        conditions.push(eq(alertRules.enabled, input.enabled));
      }

      return db
        .select()
        .from(alertRules)
        .where(and(...conditions))
        .orderBy(asc(alertRules.createdAt));
    }),

  /**
   * Create a new alert rule.
   * If `deviceId` is omitted the rule applies org-wide.
   */
  createRule: protectedProcedure
    .input(createAlertRuleSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      // Verify device ownership if a specific device is targeted
      if (input.deviceId) {
        const [device] = await db
          .select({ id: devices.id })
          .from(devices)
          .where(and(eq(devices.id, input.deviceId), eq(devices.orgId, org.id)))
          .limit(1);

        if (!device) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Device not found",
          });
        }
      }

      const [rule] = await db
        .insert(alertRules)
        .values({
          orgId: org.id,
          deviceId: input.deviceId,
          name: input.name,
          metric: input.metric,
          operator: input.operator,
          // Drizzle `numeric` columns accept string representation
          threshold: String(input.threshold),
          channels: input.channels,
          cooldownMinutes: input.cooldownMinutes,
          enabled: input.enabled,
        })
        .returning();

      return rule!;
    }),

  /**
   * Update an existing alert rule — only the provided fields are changed.
   */
  updateRule: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: updateAlertRuleSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [existing] = await db
        .select({ id: alertRules.id })
        .from(alertRules)
        .where(and(eq(alertRules.id, input.id), eq(alertRules.orgId, org.id)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alert rule not found",
        });
      }

      // Build a patch object of only the fields the caller supplied
      const patch: Partial<typeof alertRules.$inferInsert> = {};
      const d = input.data;
      if (d.name !== undefined) patch.name = d.name;
      if (d.metric !== undefined) patch.metric = d.metric;
      if (d.operator !== undefined) patch.operator = d.operator;
      if (d.threshold !== undefined) patch.threshold = String(d.threshold);
      if (d.channels !== undefined) patch.channels = d.channels;
      if (d.cooldownMinutes !== undefined) patch.cooldownMinutes = d.cooldownMinutes;
      if (d.enabled !== undefined) patch.enabled = d.enabled;
      if (d.deviceId !== undefined) patch.deviceId = d.deviceId;

      const [updated] = await db
        .update(alertRules)
        .set(patch)
        .where(eq(alertRules.id, input.id))
        .returning();

      return updated!;
    }),

  /**
   * Delete an alert rule and cascade its associated events.
   */
  deleteRule: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [deleted] = await db
        .delete(alertRules)
        .where(and(eq(alertRules.id, input.id), eq(alertRules.orgId, org.id)))
        .returning({ id: alertRules.id });

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alert rule not found",
        });
      }

      return { id: deleted.id };
    }),

  /**
   * List fired alert events for the current org with optional filters.
   */
  listEvents: protectedProcedure
    .input(
      z.object({
        ruleId: z.string().uuid().optional(),
        deviceId: z.string().uuid().optional(),
        /** true = only resolved; false = only open; omit = all */
        resolved: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const conditions = [eq(alertEvents.orgId, org.id)];

      if (input.ruleId) {
        conditions.push(eq(alertEvents.ruleId, input.ruleId));
      }

      if (input.deviceId) {
        conditions.push(eq(alertEvents.deviceId, input.deviceId));
      }

      if (input.resolved === true) {
        conditions.push(isNotNull(alertEvents.resolvedAt));
      } else if (input.resolved === false) {
        conditions.push(isNull(alertEvents.resolvedAt));
      }

      return db
        .select()
        .from(alertEvents)
        .where(and(...conditions))
        .orderBy(desc(alertEvents.firedAt))
        .limit(input.limit);
    }),
});
