import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../index.js";
import { updateOrgSchema, inviteMemberSchema } from "@mikrotik/types";
import { organizations, orgMemberships, users } from "@mikrotik/db/schema";

/**
 * Organisations router — profile management, membership, and invitations.
 */
export const orgsRouter = router({
  /**
   * Returns the full organisation record for the current org context.
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const { db, org } = ctx;

    const [organisation] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, org.id))
      .limit(1);

    if (!organisation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organisation not found",
      });
    }

    return organisation;
  }),

  /**
   * Update the organisation's display name and/or settings blob.
   */
  update: protectedProcedure
    .input(updateOrgSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [updated] = await db
        .update(organizations)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.settings ? { settings: input.settings } : {}),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, org.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation not found",
        });
      }

      return updated;
    }),

  /**
   * Invite a user to the organisation by email.
   * Creates (or updates) a membership row with `acceptedAt` = null so the
   * invite flow can handle acceptance separately.
   */
  inviteMember: protectedProcedure
    .input(inviteMemberSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      // Resolve the invited user — they must already have a platform account.
      const [invitee] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!invitee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No user found with email ${input.email}`,
        });
      }

      // Upsert the membership so repeated invitations are idempotent.
      const [membership] = await db
        .insert(orgMemberships)
        .values({
          orgId: org.id,
          userId: invitee.id,
          role: input.role,
          invitedBy: user.id,
          acceptedAt: null,
        })
        .onConflictDoUpdate({
          target: [orgMemberships.orgId, orgMemberships.userId],
          set: {
            role: input.role,
            invitedBy: user.id,
            acceptedAt: null,
          },
        })
        .returning();

      return membership!;
    }),

  /**
   * Remove a member from the organisation.
   * The owner (creator) cannot be removed via this endpoint.
   */
  removeMember: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      // Prevent removal of the org owner
      const [organisation] = await db
        .select({ ownerUserId: organizations.ownerUserId })
        .from(organizations)
        .where(eq(organizations.id, org.id))
        .limit(1);

      if (organisation?.ownerUserId === input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot remove the organisation owner",
        });
      }

      const [deleted] = await db
        .delete(orgMemberships)
        .where(
          and(
            eq(orgMemberships.orgId, org.id),
            eq(orgMemberships.userId, input.userId)
          )
        )
        .returning({ id: orgMemberships.id });

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Membership not found",
        });
      }

      return { success: true };
    }),

  /**
   * Change the role of an existing member.
   * Owners cannot have their role changed.
   */
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "operator", "viewer"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [organisation] = await db
        .select({ ownerUserId: organizations.ownerUserId })
        .from(organizations)
        .where(eq(organizations.id, org.id))
        .limit(1);

      if (organisation?.ownerUserId === input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot change the role of the organisation owner",
        });
      }

      const [updated] = await db
        .update(orgMemberships)
        .set({ role: input.role })
        .where(
          and(
            eq(orgMemberships.orgId, org.id),
            eq(orgMemberships.userId, input.userId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Membership not found",
        });
      }

      return updated;
    }),

  /**
   * List all members of the current organisation with their user details.
   */
  listMembers: protectedProcedure.query(async ({ ctx }) => {
    const { db, org } = ctx;

    const members = await db
      .select({
        membershipId: orgMemberships.id,
        role: orgMemberships.role,
        acceptedAt: orgMemberships.acceptedAt,
        createdAt: orgMemberships.createdAt,
        userId: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(orgMemberships)
      .innerJoin(users, eq(orgMemberships.userId, users.id))
      .where(eq(orgMemberships.orgId, org.id))
      .orderBy(orgMemberships.createdAt);

    return members;
  }),
});
