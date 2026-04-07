import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./lib/db.js";

/**
 * Better Auth instance for the MikroTik SaaS platform.
 *
 * Providers:
 *  - Email / password (always enabled)
 *  - Google OAuth (requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET env vars)
 *
 * Plugins:
 *  - organization: multi-tenant org support with invitations and roles
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  secret: process.env["BETTER_AUTH_SECRET"] ?? "change-me-in-production",

  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3001",

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  socialProviders: {
    google: {
      clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
      clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
      enabled: !!(
        process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
      ),
    },
  },

  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,      // refresh if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes client-side cache
    },
  },

  trustedOrigins: [
    process.env["WEB_URL"] ?? "http://localhost:3000",
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
