import { z } from "zod";

/**
 * Schema for user login credentials.
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * Schema for new user registration.
 */
export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

/**
 * Roles assignable when inviting an org member.
 */
export const memberRoleEnum = z.enum(["admin", "operator", "viewer"]);

/**
 * Schema for inviting a new organisation member.
 */
export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: memberRoleEnum,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type MemberRole = z.infer<typeof memberRoleEnum>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
