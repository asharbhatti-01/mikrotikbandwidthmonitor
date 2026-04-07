import { z } from "zod";
import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { router, protectedProcedure } from "../index.js";
import { auditLogs, users } from "@mikrotik/db/schema";

/**
 * Audit router — read-only access to the immutable audit trail.
 * Rows are append-only; no mutations are exposed through this router.
 */
export const auditRouter = router({
  /**
   * List audit log entries for the current org with rich filtering and
   * cursor-free limit/offset pagination (suitable for table UIs).
   *
   * Filters:
   *  - `action`      substring match on the action identifier
   *  - `actorUserId` filter to a specific user's actions
   *  - `deviceId`    filter to actions targeting a specific device
   *  - `actorType`   'user' | 'api_key' | 'system'
   *  - `from` / `to` ISO date range on `createdAt`
   */
  list: protectedProcedure
    .input(
      z.object({
        action: z.string().optional(),
        actorUserId: z.string().uuid().optional(),
        deviceId: z.string().uuid().optional(),
        actorType: z.enum(["user", "api_key", "system"]).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const conditions = [eq(auditLogs.orgId, org.id)];

      if (input.action) {
        conditions.push(ilike(auditLogs.action, `%${input.action}%`));
      }

      if (input.actorUserId) {
        conditions.push(eq(auditLogs.actorUserId, input.actorUserId));
      }

      if (input.deviceId) {
        conditions.push(eq(auditLogs.targetDeviceId, input.deviceId));
      }

      if (input.actorType) {
        conditions.push(eq(auditLogs.actorType, input.actorType));
      }

      if (input.from) {
        conditions.push(gte(auditLogs.createdAt, input.from));
      }

      if (input.to) {
        conditions.push(lte(auditLogs.createdAt, input.to));
      }

      const logs = await db
        .select({
          id: auditLogs.id,
          orgId: auditLogs.orgId,
          actorUserId: auditLogs.actorUserId,
          actorApiKeyId: auditLogs.actorApiKeyId,
          actorType: auditLogs.actorType,
          action: auditLogs.action,
          targetDeviceId: auditLogs.targetDeviceId,
          targetResource: auditLogs.targetResource,
          payloadBefore: auditLogs.payloadBefore,
          payloadAfter: auditLogs.payloadAfter,
          ipAddress: auditLogs.ipAddress,
          userAgent: auditLogs.userAgent,
          createdAt: auditLogs.createdAt,
          // Eagerly join actor name for display purposes
          actorName: users.name,
          actorEmail: users.email,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorUserId, users.id))
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return logs;
    }),
});
