/**
 * Database seed script.
 *
 * Inserts foundational data required for a working development environment:
 *   - 3 plans  (free, pro, business)
 *   - 1 test user
 *   - 1 test organisation (on the pro plan, owned by the test user)
 *
 * Run via:
 *   bun run src/seed.ts
 *   # or from the monorepo root:
 *   bun run db:seed
 *
 * The script is idempotent: it uses INSERT ... ON CONFLICT DO NOTHING so it
 * can be re-run safely against a database that already has seed data.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema/index.js";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_PLANS: schema.NewPlan[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Free",
    maxDevices: 3,
    maxUsers: 2,
    metricRetentionDays: 3,
    features: [],
    stripePriceId: null,
    pricePerDeviceUsd: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Pro",
    maxDevices: 50,
    maxUsers: 10,
    metricRetentionDays: 30,
    features: ["config_backups", "alerting", "api_access"],
    stripePriceId: "price_pro_monthly",
    pricePerDeviceUsd: "2.0000",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Business",
    maxDevices: null, // unlimited
    maxUsers: null, // unlimited
    metricRetentionDays: 90,
    features: [
      "config_backups",
      "alerting",
      "api_access",
      "sso",
      "audit_logs",
      "white_label",
    ],
    stripePriceId: "price_business_monthly",
    pricePerDeviceUsd: "1.5000",
  },
];

const SEED_USER: schema.NewUser = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "admin@example.com",
  name: "Test Admin",
  avatarUrl: null,
  mfaEnabled: false,
  lastLoginAt: null,
};

const SEED_ORG: schema.NewOrganization = {
  id: "00000000-0000-0000-0000-000000000020",
  name: "Acme Networks",
  slug: "acme-networks",
  planId: "00000000-0000-0000-0000-000000000002", // pro
  ownerUserId: "00000000-0000-0000-0000-000000000010",
  settings: {},
  stripeCustomerId: null,
};

const SEED_MEMBERSHIP: schema.NewOrgMembership = {
  id: "00000000-0000-0000-0000-000000000030",
  orgId: "00000000-0000-0000-0000-000000000020",
  userId: "00000000-0000-0000-0000-000000000010",
  role: "owner",
  invitedBy: null,
  acceptedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required for seeding");
  }

  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  console.log("Seeding database...");

  try {
    // Plans — insert all three, skip if already present (idempotent)
    await db
      .insert(schema.plans)
      .values(SEED_PLANS)
      .onConflictDoNothing({ target: schema.plans.id });
    console.log("  [ok] plans (free, pro, business)");

    // Test user
    await db
      .insert(schema.users)
      .values(SEED_USER)
      .onConflictDoNothing({ target: schema.users.id });
    console.log(`  [ok] user  ${SEED_USER.email}`);

    // Test organisation
    await db
      .insert(schema.organizations)
      .values(SEED_ORG)
      .onConflictDoNothing({ target: schema.organizations.id });
    console.log(`  [ok] org   ${SEED_ORG.name} (slug: ${SEED_ORG.slug})`);

    // Owner membership
    await db
      .insert(schema.orgMemberships)
      .values(SEED_MEMBERSHIP)
      .onConflictDoNothing({ target: schema.orgMemberships.id });
    console.log(`  [ok] membership (owner)`);

    console.log("\nSeed complete.");
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
