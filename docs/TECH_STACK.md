# Tech Stack

Every choice below is deliberate. This document explains not just *what* we use, but *why* — and what we consciously rejected.

---

## Frontend

### Next.js 15 (App Router)

**Why:** React 19 Server Components let us ship zero JavaScript for the dashboard skeleton. The device list, sidebar, and navigation are server-rendered HTML — no loading spinners, no layout shift. Client components are reserved for interactive charts and real-time panels.

Key patterns used:
- **Parallel Routes** — split-pane layout (device list + detail view) without client-side state
- **Intercepting Routes** — device detail opens as a slide-over on the list page, full page on direct URL
- **Server Actions** — form mutations (add device, push rule) without writing API route handlers
- **Partial Prerendering** — static shell renders instantly; async slots stream in device data

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx
├── (dashboard)/
│   ├── layout.tsx          # Server Component shell
│   ├── devices/
│   │   ├── page.tsx        # Device list (Server Component)
│   │   ├── @detail/        # Parallel route — detail pane
│   │   └── [id]/page.tsx   # Full device page
│   ├── monitoring/page.tsx
│   └── settings/page.tsx
└── api/
    └── trpc/[trpc]/route.ts
```

### Tailwind CSS v4

**Why:** The new CSS-native engine eliminates `tailwind.config.js`. Design tokens are defined with `@theme` in CSS — the same variables your component library uses. Build is powered by Lightning CSS: HMR is near-instant.

```css
/* globals.css */
@import "tailwindcss";

@theme {
  --color-brand: oklch(55% 0.2 250);
  --font-sans: "Geist", system-ui;
  --radius-card: 12px;
}
```

### shadcn/ui + Radix UI

**Why:** We own the components — no npm update surprises, no `node_modules/shadcn` to worry about. Radix provides accessible primitives (Dialog, Dropdown, Tooltip) with zero styling. shadcn layers our design system on top.

```bash
# Add a component to packages/ui
bunx shadcn@latest add dialog
```

### tRPC v11

**Why:** No REST. No OpenAPI. No codegen. The API contract is a TypeScript file — if you rename a router input field, the TypeScript error appears immediately in the React component that reads it.

tRPC subscriptions handle real-time metric streaming:

```typescript
// packages/types/src/trpc.ts — shared between API and web
export const deviceRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .query(({ input, ctx }) => getDevices(input.orgId, ctx.user)),

  metrics: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .subscription(({ input }) => metricsSubscription(input.deviceId)),
});
```

### TanStack Query v5

**Why:** Server state management with built-in caching, background refetch, and optimistic updates. Used alongside tRPC's React Query integration.

### uPlot (bandwidth graphs)

**Why:** Recharts is beautiful but SVG-based — it struggles with more than ~5,000 data points before the browser chokes. uPlot is canvas-based and renders 100,000 points in ~2ms. Critical for live interface RX/TX graphs at 1-second resolution.

```typescript
// A 24-hour graph at 1-second resolution = 86,400 points
// Recharts: 3–4 second render, janky scroll
// uPlot: <2ms render, smooth zoom/pan
```

---

## Backend

### Bun 1.x

**Why:** Native TypeScript runtime — no `ts-node`, no esbuild, no `tsc --watch`. `bun run index.ts` just works. On I/O-heavy workloads (metric ingestion, concurrent WebSocket connections) Bun benchmarks 3–5× faster than Node. The built-in test runner replaces Jest/Vitest with zero config.

**What we rejected:** Node.js 22 — still requires a build step for TypeScript, slower I/O performance.

### Hono

**Why:** Ultra-fast router (benchmarks faster than Fastify), zero dependencies, runs identically on Bun, Cloudflare Workers, Node, and Deno. This means the edge middleware (Cloudflare Worker) and the origin API (Bun) share the same framework — one mental model, one set of middleware patterns.

```typescript
import { Hono } from 'hono'
import { trpcServer } from '@hono/trpc-server'

const app = new Hono()

app.use('/trpc/*', trpcServer({ router: appRouter, createContext }))
app.get('/health', (c) => c.json({ status: 'ok' }))

export default app
```

### Better Auth

**Why:** Full-featured auth library built for the modern TS ecosystem. Has native org/team support, API keys, OAuth (Google, GitHub), TOTP, session management — all in one package. No vendor lock-in unlike Clerk ($0 self-hosted), no complexity of rolling your own.

**What we rejected:** Clerk (vendor lock-in, expensive at scale), NextAuth v4 (no org support without workarounds).

### Drizzle ORM

**Why:** SQL-first. Migrations are `.sql` files you commit and read. Queries are fully type-safe without a code generation step. No binary engine (unlike Prisma). The query builder maps 1:1 to SQL — no magic.

```typescript
// packages/db/src/schema/devices.ts
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  connectionType: connectionTypeEnum('connection_type').notNull(),
  status: deviceStatusEnum('status').notNull().default('offline'),
  rosVersion: varchar('ros_version', { length: 20 }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**What we rejected:** Prisma (binary engine overhead, slower queries, Prisma Client adds ~50MB to container image).

### Trigger.dev v3

**Why:** Background jobs are TypeScript functions with `task.trigger()`. They're durable — if the server crashes mid-backup, the job resumes. Fan-out (push config to 500 routers) is `task.batchTrigger()`. Cron jobs are `task.cron("0 2 * * *")`. Live run logs visible in Trigger dashboard.

```typescript
// apps/api/src/jobs/backup.ts
export const backupDevice = task({
  id: 'backup-device',
  retry: { maxAttempts: 3, backoffFactor: 2 },
  run: async ({ deviceId }: { deviceId: string }) => {
    const config = await routeros.export(deviceId)
    await r2.put(`backups/${deviceId}/${Date.now()}.rsc`, config)
    await db.insert(configSnapshots).values({ deviceId, takenAt: new Date() })
  },
})
```

**What we rejected:** BullMQ (Redis-dependent, jobs lost on crash), Inngest (similar but less Bun-native).

---

## Data layer

### PostgreSQL 17

**Why:** Rock-solid, JSONB for config snapshots, row-level security for multi-tenancy, pgvector for AI anomaly search, pg_audit for the audit log. The foundation everything else builds on.

Extensions enabled:
- `timescaledb` — timeseries metrics
- `pgvector` — embedding-based anomaly search
- `pg_audit` — audit logging
- `uuid-ossp` — UUID generation
- `pg_trgm` — fuzzy text search (device names, IPs)

### TimescaleDB 2.x

**Why:** Runs as a Postgres extension — same connection, same ORM, no separate infrastructure. Hypertables auto-partition metric data by `(device_id, time)`. Continuous aggregates roll up raw 10-second data to 1-minute, 1-hour, and 1-day granularity automatically.

```sql
-- Hypertable
SELECT create_hypertable('device_metrics', 'collected_at');

-- Continuous aggregate: 1-minute rollup
CREATE MATERIALIZED VIEW metrics_1m
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  time_bucket('1 minute', collected_at) AS bucket,
  avg(cpu_load) AS avg_cpu,
  max(cpu_load) AS max_cpu,
  avg(free_memory) AS avg_memory
FROM device_metrics
GROUP BY device_id, bucket;

-- Retention: keep raw data for 7 days, 1m aggregates for 30 days
SELECT add_retention_policy('device_metrics', INTERVAL '7 days');
```

**Capacity estimate at 500 devices:**
- 1 metric push per device per 10s = 3 pushes/min/device
- ~10 metrics per push = 30 values/min/device
- 500 devices × 30 × 60 min × 24h = **21.6M raw values/day**
- With TimescaleDB compression (~95%): ~5MB/day of storage

### Upstash Redis (serverless)

**Why:** HTTP-based Redis — works from Cloudflare Workers without TCP connection pools. Per-request pricing means it costs $0 in development. Used for: session cache, rate limiting counters, device status cache, pending command queue for offline devices, pub/sub for broadcasting live metrics.

**What we rejected:** Self-hosted Redis (infra overhead), Vercel KV (less flexible).

### ParadeDB (pg_search)

**Why:** BM25 full-text search inside Postgres. Search across device names, IP addresses, config snapshots, and audit log entries — no Elasticsearch, no separate index sync.

```sql
CREATE EXTENSION paradedb;

-- Full-text search on devices
SELECT * FROM devices
WHERE name @@@ 'office router' OR tags @@@ 'branch'
ORDER BY paradedb.score() DESC;
```

---

## Infrastructure

### Cloudflare

Role: **edge layer** — everything before the request hits the origin.

- **Workers:** JWT verification, rate limiting (100 req/10s per IP), request routing
- **Durable Objects:** one persistent WebSocket room per enrolled device
- **R2:** config backup file storage ($0.015/GB, zero egress fees)
- **D1:** edge-cached device status for ultra-low latency dashboard reads
- **Turnstile:** bot protection on login, signup, and agent enrollment

### Railway

Role: **origin infrastructure** — the stateful core.

- Managed PostgreSQL 17 + TimescaleDB extension
- Bun/Hono API service (auto-scales on request volume)
- Trigger.dev worker processes
- Private networking between services (no public exposure for DB)
- Git-push deploys — zero-config CI/CD

### Turborepo monorepo

**Why:** Shared packages (`db`, `types`, `ui`) need to be consumed by both `web` and `api`. Turborepo's remote cache means CI builds skip unchanged packages — average CI time drops from 4 minutes to ~45 seconds.

```json
// turbo.json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

---

## Observability

### OpenTelemetry + Axiom

Every HTTP request, tRPC call, database query, and background job emits OpenTelemetry traces. Axiom ingests logs and traces at $0 for the first 500GB/month.

Key metrics monitored:
- `agent.command.latency` — p50/p99 time from push to ACK
- `metrics.ingest.rate` — device metrics/second throughput
- `trpc.router.latency` — API response times per procedure
- `db.query.duration` — slow query detection

### Sentry

Error tracking with session replay. Every unhandled exception in the frontend and API is captured with full context (org, device, user action).

---

## AI layer

### Vercel AI SDK + Claude API

The AI assistant is context-aware — it knows your organization, selected device, recent alerts, and active config when generating responses.

```typescript
// apps/api/src/routes/ai.ts
const result = await streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: buildSystemPrompt(ctx.org, ctx.device),
  messages,
  tools: {
    listDevices: tool({ ... }),
    getMetrics: tool({ ... }),
    generateFirewallRule: tool({ ... }),
    // Never destructive tools without explicit confirmation
  },
})
```

**Guardrails:**
- Destructive tools (push rule, restart device) require explicit user confirmation before execution
- AI-generated SQL is validated against a safe read-only Zod schema
- All AI actions appear in the audit log with `actor: 'ai_assistant'`
