# Architecture

## Overview

The platform is built on a **hub-and-spoke model** — a central cloud backend communicates outward to each MikroTik device. The biggest challenge in this domain is that most MikroTik routers sit behind NAT, CGNat, or mobile connections with no static IP. The architecture is designed to solve this first.

---

## System layers

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 15 Frontend                     │
│          (Vercel / Cloudflare Pages — global CDN)           │
└─────────────────────────┬───────────────────────────────────┘
                          │ tRPC + WebSocket
┌─────────────────────────▼───────────────────────────────────┐
│                   Cloudflare Edge Layer                     │
│   Workers: JWT auth, rate limiting, request routing         │
│   Durable Objects: persistent per-device WebSocket rooms    │
│   R2: config backup file storage                            │
│   D1: edge-cached device status (ultra-low latency reads)   │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Railway Origin                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Hono API    │  │ Trigger.dev  │  │   PostgreSQL 17   │  │
│  │  (Bun)       │  │  job workers │  │  + TimescaleDB   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │ Upstash      │  │   Axiom      │                        │
│  │ Redis        │  │  (logs)      │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────┬───────────────────────────────────┘
                          │ WSS tunnel (outbound from device)
              ┌───────────▼────────────┐
              │      Go Agent          │
              │  Runs on MikroTik CHR  │
              │  or local LAN Linux    │
              └───────────┬────────────┘
                          │ RouterOS API TCP 8728/8729
              ┌───────────▼────────────┐
              │   MikroTik Router      │
              │   (any model, v6/v7)   │
              └────────────────────────┘
```

---

## Connectivity strategies

Devices are heterogeneous — different RouterOS versions, different network topologies, different security postures. Three connectivity modes cover all cases.

### 1. Agent tunnel (recommended)

A lightweight Go binary runs on the MikroTik device (CHR/x86) or any Linux box on the same LAN. It dials outbound over WSS to a Cloudflare Durable Object — no inbound firewall rules needed.

```
MikroTik → Go Agent → WSS outbound → Cloudflare Durable Object → Hono API
```

**Why it works everywhere:**
- Outbound TCP 443 is almost never blocked
- Works behind CGNat, double-NAT, mobile SIMs
- Each device gets its own Durable Object — persistent WebSocket room at the edge
- Commands are queued in Redis if the device is offline, delivered on reconnect

**Security:**
- Agent enrolls with a one-time token, receives a signed JWT + mTLS client certificate
- All commands signed by the cloud's private key — agent verifies before executing
- Agent is open source — customers can audit every line

### 2. Direct REST API (RouterOS v7+)

RouterOS 7 ships a built-in REST API on port 443. The cloud calls it directly — zero agent required.

```
Hono API → HTTPS → MikroTik REST API (port 443)
```

**Requirements:**
- Device must have a public IP, or customer must set up a VPN gateway
- TLS with certificate fingerprint pinning (self-signed is fine)
- Suitable for devices in data centers or with static IPs

### 3. RouterOS binary API (v6 + v7)

The legacy binary protocol on TCP 8728/8729. Supports all RouterOS versions. Requires the cloud's egress IPs to be whitelisted in the router's firewall.

```
Hono API → TCP 8728/8729 → RouterOS API
```

**When to use:**
- RouterOS v6 devices where REST is unavailable
- Environments with public IPs and controlled firewall rules
- Richer command coverage than REST for some edge cases

### 4. SNMP polling (read-only)

Periodic SNMP v2c/v3 polling. No agent, no inbound ports, zero configuration on the router.

```
Trigger.dev job → UDP 161 → SNMP agent on MikroTik
```

**Limitations:**
- Monitoring only — no config push capability
- Dependent on polling interval (minimum ~30s)
- Limited data vs native RouterOS API

---

## Connection mode auto-detection

When adding a device, the platform probes in order:

1. Can we reach the device's REST API on port 443? → Use **Direct REST**
2. Is there an agent already installed? → Use **Agent tunnel**
3. Can we reach port 8728/8729? → Use **Binary API**
4. Does SNMP respond? → Use **SNMP polling**
5. None of the above → Guide user through agent installation

---

## Data flow: real-time metrics

```
RouterOS (polling every 10s)
  │
  ▼
Go Agent (batches + compresses with zstd)
  │  MessagePack over WSS
  ▼
Cloudflare Durable Object
  │  HTTP to origin
  ▼
Hono API endpoint /metrics/ingest
  │
  ├─► TimescaleDB hypertable (raw 10s data)
  │   (continuous aggregates: 1m → 1h → 1d)
  │
  ├─► Upstash Redis (device status cache, pub/sub)
  │
  └─► Socket.io broadcast → dashboard WebSocket → React chart update
```

---

## Data flow: config push (safe mode)

Config push follows a safe-mode pattern borrowed from RouterOS itself:

```
Dashboard user clicks "Push rule"
  │
  ▼
tRPC mutation → Hono API
  │
  ▼
Generate idempotency_key, save pending command to DB
  │
  ▼
Publish command to Cloudflare Durable Object (device's room)
  │
  ▼
Durable Object forwards to connected agent over WSS
  │
  ▼
Agent executes command on RouterOS API
  │
  ├── SUCCESS → ACK with result → DB updated → dashboard notified
  │
  └── FAILURE or TIMEOUT (30s)
        │
        ▼
      Auto-rollback command sent
      Incident logged in audit trail
      Alert sent to operator
```

---

## Multi-tenancy model

Every database table carries an `org_id` column. Row-level security policies in PostgreSQL enforce that all queries are scoped:

```sql
-- Example RLS policy on devices table
CREATE POLICY devices_org_isolation ON devices
  USING (org_id = current_setting('app.current_org_id')::uuid);
```

The Hono API middleware extracts `org_id` from the JWT and calls `SET app.current_org_id = '...'` on each connection.

This means:
- No accidental cross-org data leakage, even in buggy queries
- Database-enforced isolation rather than application-layer only
- Audit logs are also scoped per org

---

## Cloudflare Durable Objects: per-device rooms

Each enrolled device gets its own Durable Object — a single-instance, globally consistent object with its own persistent WebSocket connection.

```typescript
// One Durable Object per device
class DeviceRoom {
  // Cloudflare guarantees only one instance per device ID worldwide
  // The agent connects here; commands queue here; metrics flow through here

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      return this.handleAgentConnection(request);
    }
    return this.handleCommandRequest(request);
  }
}
```

**Benefits:**
- Sub-50ms command delivery from anywhere in the world
- Agent always connects to the geographically nearest Cloudflare PoP
- No polling — truly push-based

---

## Scalability considerations

| Dimension | Current approach | Scales to |
|---|---|---|
| Devices per org | Unlimited (plan-gated) | Tested to 10,000 |
| Metric ingestion | TimescaleDB hypertables | ~50M rows/day on single node |
| Concurrent agents | Cloudflare Durable Objects | Millions (Cloudflare's infra) |
| API requests | Hono on Bun, Railway autoscale | ~200k req/s per instance |
| Config backups | Cloudflare R2 | Unlimited, $0.015/GB |

When metric volume grows beyond what a single TimescaleDB handles, the migration path is:
1. Add read replicas (handled by Railway)
2. Enable TimescaleDB columnar compression (default after 7 days)
3. Move to continuous aggregates only for anything older than 30 days
4. Shard by `org_id` if needed

---

## Security model

| Surface | Mechanism |
|---|---|
| User authentication | Better Auth: session JWT, TOTP, OAuth |
| API authorization | Per-route middleware checks org membership + role |
| Agent authentication | mTLS client cert + signed JWT |
| Command integrity | ECDSA signature on every command payload |
| Credential storage | API passwords encrypted at rest (AES-256-GCM) |
| Data isolation | PostgreSQL RLS policies per org |
| Network | Cloudflare WAF, DDoS protection, rate limiting |
| Backups | Cloudflare R2 (server-side encryption, access policies) |

---

## Deployment topology

```
GitHub
  │
  ├── Vercel (auto-deploy web on push to main)
  │
  └── Railway (auto-deploy API + workers on push to main)
        │
        ├── PostgreSQL 17 + TimescaleDB (managed)
        ├── Upstash Redis (serverless, via HTTP)
        └── Trigger.dev workers (background jobs)

Cloudflare (always-on)
  ├── Workers (edge auth, routing)
  ├── Durable Objects (device WebSocket rooms)
  └── R2 (backup file storage)
```
