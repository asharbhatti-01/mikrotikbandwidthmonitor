# Data Model

All tables live in a single PostgreSQL 17 database with TimescaleDB and pgvector extensions. Multi-tenancy is enforced by row-level security policies keyed on `org_id`.

---

## Entity relationship overview

```
organizations
    │
    ├── users (via org_memberships)
    ├── devices
    │       ├── device_metrics (timeseries)
    │       ├── config_snapshots
    │       └── alert_rules
    ├── api_keys
    ├── audit_logs
    └── subscriptions → plans
```

---

## Core tables

### `organizations`

The top-level tenant. Everything belongs to an org.

```sql
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) NOT NULL UNIQUE,
  plan_id         UUID REFERENCES plans(id),
  owner_user_id   UUID NOT NULL REFERENCES users(id),
  settings        JSONB NOT NULL DEFAULT '{}',
  -- settings: { timezone, alert_email, webhook_url, slack_webhook }
  stripe_customer_id VARCHAR(100) UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `users`

Authentication handled by Better Auth. This table is the application-level user record.

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL UNIQUE,
  name            VARCHAR(255),
  avatar_url      TEXT,
  mfa_enabled     BOOLEAN NOT NULL DEFAULT false,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `org_memberships`

Junction table linking users to organizations with a role.

```sql
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'operator', 'viewer');

CREATE TABLE org_memberships (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    org_role NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
```

### `devices`

The central entity. Each row is one MikroTik router enrolled in the platform.

```sql
CREATE TYPE connection_type AS ENUM ('agent', 'rest', 'binary_api', 'snmp');
CREATE TYPE device_status   AS ENUM ('online', 'offline', 'warning', 'unreachable');

CREATE TABLE devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  description      TEXT,

  -- Connection
  connection_type  connection_type NOT NULL DEFAULT 'agent',
  ip_address       INET,
  api_port         INTEGER DEFAULT 8728,
  -- Credentials stored encrypted; NULL if using agent (agent holds no cloud creds)
  api_username_enc TEXT,
  api_password_enc TEXT,
  snmp_community   TEXT,

  -- RouterOS info (populated after first connection)
  ros_version      VARCHAR(20),
  board_name       VARCHAR(100),
  model            VARCHAR(100),
  mac_address      MACADDR,

  -- Status
  status           device_status NOT NULL DEFAULT 'offline',
  last_seen_at     TIMESTAMPTZ,
  uptime_seconds   BIGINT,

  -- Organization
  site_id          UUID REFERENCES sites(id),
  tags             TEXT[] NOT NULL DEFAULT '{}',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX devices_org_id_idx ON devices(org_id);
CREATE INDEX devices_status_idx ON devices(status);
CREATE INDEX devices_tags_idx   ON devices USING GIN(tags);
```

### `sites`

A logical grouping of devices (e.g. a branch office, a data center, a city).

```sql
CREATE TABLE sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  location    TEXT,
  coordinates POINT,  -- lat/lng for map view
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `agent_enrollments`

Tracks agent enrollment tokens and the resulting connection state.

```sql
CREATE TABLE agent_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  enroll_token TEXT NOT NULL UNIQUE,  -- one-time token shown during add-device flow
  token_used   BOOLEAN NOT NULL DEFAULT false,
  agent_version VARCHAR(20),
  client_cert_fingerprint TEXT,       -- mTLS cert fingerprint after enrollment
  last_connected_at TIMESTAMPTZ,
  connected_ip  INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Timeseries tables

### `device_metrics`

Hypertable — partitioned by `(device_id, collected_at)`. Raw data at 10-second resolution.

```sql
CREATE TABLE device_metrics (
  device_id    UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  collected_at TIMESTAMPTZ NOT NULL,

  -- System
  cpu_load     SMALLINT,          -- 0-100 percent
  free_memory  INTEGER,           -- bytes
  total_memory INTEGER,           -- bytes
  uptime       BIGINT,            -- seconds

  -- Interface stats stored as JSONB array
  -- [{ name: "ether1", rx_bytes: 1234, tx_bytes: 5678, rx_packets: 100, tx_packets: 200 }]
  interfaces   JSONB NOT NULL DEFAULT '[]'
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('device_metrics', 'collected_at', partitioning_column => 'device_id', number_partitions => 4);

-- Compress chunks older than 1 day
ALTER TABLE device_metrics SET (timescaledb.compress, timescaledb.compress_segmentby => 'device_id');
SELECT add_compression_policy('device_metrics', INTERVAL '1 day');

-- Retention: raw data for 7 days (extended per plan in application layer)
SELECT add_retention_policy('device_metrics', INTERVAL '7 days');
```

### `metrics_1m` (continuous aggregate)

```sql
CREATE MATERIALIZED VIEW metrics_1m
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  time_bucket('1 minute', collected_at) AS bucket,
  avg(cpu_load)::smallint AS avg_cpu,
  max(cpu_load)::smallint AS max_cpu,
  avg(free_memory)::integer AS avg_memory
FROM device_metrics
GROUP BY device_id, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('metrics_1m',
  start_offset => INTERVAL '10 minutes',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute'
);
```

---

## Config management tables

### `config_snapshots`

Full RouterOS export stored per device. Diffs computed at query time or pre-computed.

```sql
CREATE TYPE snapshot_trigger AS ENUM ('scheduled', 'manual', 'pre_change', 'post_change');

CREATE TABLE config_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id      UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  taken_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_by   snapshot_trigger NOT NULL,
  triggered_by_user_id UUID REFERENCES users(id),
  export_rsc     TEXT NOT NULL,  -- full /export output
  size_bytes     INTEGER,
  storage_key    TEXT,           -- R2 key if offloaded to object storage
  checksum       VARCHAR(64)     -- SHA-256 of export_rsc
);

CREATE INDEX config_snapshots_device_id_taken_at_idx ON config_snapshots(device_id, taken_at DESC);
```

### `pending_commands`

Commands queued for offline devices. Delivered when the device reconnects.

```sql
CREATE TYPE command_status AS ENUM ('pending', 'sent', 'acked', 'failed', 'rolled_back');

CREATE TABLE pending_commands (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  idempotency_key  UUID NOT NULL UNIQUE,
  command_type     VARCHAR(100) NOT NULL,  -- e.g. 'firewall.rule.add', 'ip.address.add'
  payload          JSONB NOT NULL,
  status           command_status NOT NULL DEFAULT 'pending',
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  acked_at         TIMESTAMPTZ,
  result           JSONB,         -- RouterOS API response
  error_message    TEXT,
  rollback_payload JSONB          -- what to send if we need to undo
);
```

---

## Alerting tables

### `alert_rules`

Configurable threshold-based alert conditions.

```sql
CREATE TYPE alert_operator AS ENUM ('gt', 'lt', 'gte', 'lte', 'eq');
CREATE TYPE alert_channel  AS ENUM ('email', 'webhook', 'slack');

CREATE TABLE alert_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id        UUID REFERENCES devices(id) ON DELETE CASCADE,  -- NULL = apply to all devices
  name             VARCHAR(255) NOT NULL,
  metric           VARCHAR(100) NOT NULL,  -- 'cpu_load', 'free_memory', 'status'
  operator         alert_operator NOT NULL,
  threshold        NUMERIC NOT NULL,
  channels         alert_channel[] NOT NULL DEFAULT '{}',
  cooldown_minutes INTEGER NOT NULL DEFAULT 15,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `alert_events`

Each time an alert fires, a record is created here.

```sql
CREATE TABLE alert_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id      UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  device_id    UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL,
  fired_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  metric_value NUMERIC NOT NULL,
  notified     BOOLEAN NOT NULL DEFAULT false
);
```

---

## Audit & access control

### `audit_logs`

Immutable log of every state-changing action in the system.

```sql
CREATE TABLE audit_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id    UUID REFERENCES users(id),  -- NULL if API key or AI assistant
  actor_api_key_id UUID REFERENCES api_keys(id),
  actor_type       VARCHAR(50) NOT NULL DEFAULT 'user',  -- 'user', 'api_key', 'ai_assistant', 'system'
  action           VARCHAR(200) NOT NULL,  -- 'device.config.push', 'firewall.rule.add', etc.
  target_device_id UUID REFERENCES devices(id),
  target_resource  VARCHAR(200),
  payload_before   JSONB,
  payload_after    JSONB,
  ip_address       INET,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partition audit_logs by month to keep queries fast
SELECT create_hypertable('audit_logs', 'created_at', chunk_time_interval => INTERVAL '1 month');
```

### `api_keys`

Per-organization API keys for automation and integrations.

```sql
CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  key_hash     VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 of the actual key
  key_prefix   VARCHAR(10) NOT NULL,         -- first 8 chars, shown in UI
  scopes       TEXT[] NOT NULL DEFAULT '{}', -- ['devices:read', 'config:push', etc.]
  created_by   UUID REFERENCES users(id),
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Billing tables

### `plans`

Feature flags and limits per subscription tier.

```sql
CREATE TABLE plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(50) NOT NULL,  -- 'free', 'pro', 'enterprise'
  max_devices           INTEGER,               -- NULL = unlimited
  max_users             INTEGER,
  metric_retention_days INTEGER NOT NULL DEFAULT 7,
  features              TEXT[] NOT NULL DEFAULT '{}',
  -- features: ['config_push', 'scheduled_backups', 'alerts', 'mass_ops', 'white_label', 'sso']
  stripe_price_id       VARCHAR(100),
  price_per_device_usd  NUMERIC(10, 4),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `subscriptions`

```sql
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing');

CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL UNIQUE REFERENCES organizations(id),
  plan_id                UUID NOT NULL REFERENCES plans(id),
  status                 subscription_status NOT NULL DEFAULT 'trialing',
  stripe_subscription_id VARCHAR(100) UNIQUE,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  trial_end              TIMESTAMPTZ,
  canceled_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Row-level security policies

Applied to all org-scoped tables. The API sets `app.current_org_id` on each DB connection.

```sql
-- Enable RLS on every org-scoped table
ALTER TABLE devices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

-- Policy: users only see their org's data
CREATE POLICY org_isolation ON devices
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- Service role bypasses RLS (used by background jobs)
CREATE POLICY service_bypass ON devices
  USING (current_setting('app.role', true) = 'service');
```

---

## Drizzle schema (TypeScript)

```typescript
// packages/db/src/schema/index.ts
export * from './organizations'
export * from './users'
export * from './devices'
export * from './metrics'
export * from './config'
export * from './alerts'
export * from './billing'
export * from './audit'
```

```typescript
// packages/db/src/schema/devices.ts
import { pgTable, uuid, varchar, inet, boolean, text, timestamp, pgEnum, integer } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'

export const connectionTypeEnum = pgEnum('connection_type', ['agent', 'rest', 'binary_api', 'snmp'])
export const deviceStatusEnum   = pgEnum('device_status',   ['online', 'offline', 'warning', 'unreachable'])

export const devices = pgTable('devices', {
  id:             uuid('id').primaryKey().defaultRandom(),
  orgId:          uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name:           varchar('name', { length: 255 }).notNull(),
  connectionType: connectionTypeEnum('connection_type').notNull().default('agent'),
  status:         deviceStatusEnum('status').notNull().default('offline'),
  rosVersion:     varchar('ros_version', { length: 20 }),
  boardName:      varchar('board_name', { length: 100 }),
  tags:           text('tags').array().notNull().default([]),
  lastSeenAt:     timestamp('last_seen_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Device        = typeof devices.$inferSelect
export type DeviceInsert  = typeof devices.$inferInsert
```
