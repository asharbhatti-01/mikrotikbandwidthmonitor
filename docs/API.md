# API

The platform uses **tRPC v11** for all client-server communication. There are no REST endpoints for the frontend — everything goes through typed tRPC procedures over HTTP and WebSocket.

A public REST API (for third-party integrations and automation) is planned for Phase 2.

---

## tRPC router structure

```
appRouter
├── auth
│   ├── getSession
│   └── signOut
├── orgs
│   ├── getCurrent
│   ├── update
│   ├── inviteMember
│   ├── removeMember
│   └── updateMemberRole
├── devices
│   ├── list
│   ├── get
│   ├── add
│   ├── update
│   ├── remove
│   ├── metrics (subscription)
│   ├── metricHistory
│   └── refreshStatus
├── config
│   ├── getSnapshot
│   ├── listSnapshots
│   ├── triggerBackup
│   ├── restore
│   ├── diff
│   └── push
├── firewall
│   ├── list
│   ├── add
│   ├── remove
│   └── reorder
├── alerts
│   ├── listRules
│   ├── createRule
│   ├── updateRule
│   ├── deleteRule
│   └── listEvents
├── apiKeys
│   ├── list
│   ├── create
│   └── revoke
├── audit
│   └── list
├── billing
│   ├── getPlan
│   ├── createCheckoutSession
│   └── createPortalSession
└── ai
    ├── chat (subscription — streaming)
    └── generateFirewallRule
```

---

## Authentication middleware

Every procedure goes through the auth middleware. Context carries the authenticated user and org.

```typescript
// apps/api/src/trpc/context.ts
import { betterAuth } from 'better-auth'

export async function createContext({ req }: { req: Request }) {
  const session = await auth.getSession(req)

  return {
    user: session?.user ?? null,
    org:  session?.org  ?? null,
    db,
    redis,
  }
}

// Middleware for protected procedures
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { user: ctx.user, org: ctx.org! } })
})

// Middleware for org-scoped queries — sets RLS variable on DB connection
const isOrgMember = isAuthed.unstable_pipe(async ({ ctx, next }) => {
  await ctx.db.execute(sql`SET LOCAL app.current_org_id = ${ctx.org.id}`)
  return next({ ctx })
})

export const protectedProcedure = t.procedure.use(isOrgMember)
```

---

## Key procedures

### `devices.list`

```typescript
devices.list: protectedProcedure
  .input(z.object({
    siteId:  z.string().uuid().optional(),
    status:  z.enum(['online', 'offline', 'warning']).optional(),
    tags:    z.array(z.string()).optional(),
    search:  z.string().optional(),
    limit:   z.number().int().min(1).max(100).default(50),
    cursor:  z.string().uuid().optional(),
  }))
  .query(async ({ input, ctx }) => {
    const devices = await ctx.db.query.devices.findMany({
      where: and(
        input.siteId ? eq(devices.siteId, input.siteId) : undefined,
        input.status ? eq(devices.status, input.status) : undefined,
        input.tags?.length ? sql`${devices.tags} && ${input.tags}` : undefined,
        input.search ? ilike(devices.name, `%${input.search}%`) : undefined,
        input.cursor ? gt(devices.id, input.cursor) : undefined,
      ),
      orderBy: asc(devices.name),
      limit: input.limit + 1,
    })

    return {
      devices: devices.slice(0, input.limit),
      nextCursor: devices.length > input.limit ? devices[input.limit].id : null,
    }
  })
```

### `devices.metrics` (WebSocket subscription)

```typescript
devices.metrics: protectedProcedure
  .input(z.object({ deviceId: z.string().uuid() }))
  .subscription(async function* ({ input, ctx }) {
    // Verify caller has access to this device
    const device = await assertDeviceAccess(input.deviceId, ctx.org.id, ctx.db)

    // Subscribe to Redis pub/sub channel for this device
    const channel = `metrics:${input.deviceId}`
    const sub = redis.subscribe(channel)

    try {
      for await (const message of sub) {
        yield tracked(message.id, message.data as MetricPush)
      }
    } finally {
      sub.unsubscribe()
    }
  })
```

### `config.push`

```typescript
config.push: protectedProcedure
  .use(requireRole('operator'))  // viewer cannot push
  .input(z.object({
    deviceId:    z.string().uuid(),
    commandType: z.enum([
      'firewall.rule.add',
      'firewall.rule.remove',
      'ip.address.add',
      'ip.address.remove',
      'system.script.run',
    ]),
    payload:     z.record(z.unknown()),
    safeMode:    z.boolean().default(true),
    safeModeTTL: z.number().int().min(10).max(120).default(30),
  }))
  .mutation(async ({ input, ctx }) => {
    const device = await assertDeviceAccess(input.deviceId, ctx.org.id, ctx.db)

    if (device.status !== 'online') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Device is offline — command will be queued' })
    }

    const ikey = crypto.randomUUID()

    // Sign the command with the cloud's private key
    const signature = await signCommand(ikey, input.commandType, input.payload)

    // Write to pending_commands table
    await ctx.db.insert(pendingCommands).values({
      deviceId:       input.deviceId,
      orgId:          ctx.org.id,
      idempotencyKey: ikey,
      commandType:    input.commandType,
      payload:        input.payload,
      createdBy:      ctx.user.id,
      rollbackPayload: buildRollback(input.commandType, input.payload),
    })

    // Forward command to Cloudflare Durable Object (device's room)
    await sendToDeviceRoom(input.deviceId, {
      type:           'command_request',
      idempotencyKey: ikey,
      commandType:    input.commandType,
      payload:        input.payload,
      signature,
      safeMode:       input.safeMode,
      safeModeTTL:    input.safeModeTTL,
    })

    // Audit log
    await ctx.db.insert(auditLogs).values({
      orgId:           ctx.org.id,
      actorUserId:     ctx.user.id,
      action:          `config.${input.commandType}`,
      targetDeviceId:  input.deviceId,
      payloadAfter:    input.payload,
    })

    return { idempotencyKey: ikey, status: 'sent' }
  })
```

---

## Public REST API (Phase 2)

A REST API for automation, Ansible playbooks, Terraform providers, and third-party integrations.

**Base URL:** `https://api.yoursaas.com/v1`

**Authentication:** `Authorization: Bearer <api_key>`

### Endpoints

```
GET    /devices                    List devices
GET    /devices/:id                Get device detail
GET    /devices/:id/metrics        Latest metrics
GET    /devices/:id/metrics/history Timeseries metrics
POST   /devices/:id/backup         Trigger config backup
POST   /devices/:id/commands       Push a command
GET    /devices/:id/snapshots      List config snapshots
GET    /devices/:id/snapshots/:sid Get snapshot content

GET    /sites                      List sites
GET    /alerts/rules               List alert rules
POST   /alerts/rules               Create alert rule
DELETE /alerts/rules/:id           Delete alert rule
GET    /alerts/events              List alert events

GET    /audit                      Audit log (last 1000)
```

### API key scopes

| Scope | Description |
|---|---|
| `devices:read` | List devices, get status, read metrics |
| `devices:write` | Add/update/remove devices |
| `config:read` | Read config snapshots |
| `config:push` | Push config changes (requires `devices:read`) |
| `alerts:read` | Read alert rules and events |
| `alerts:write` | Create and modify alert rules |
| `audit:read` | Read audit log |
| `admin` | Full access (owner only) |

### Webhooks

Outbound webhooks deliver events to your systems in real time.

**Event types:**
- `device.online` — device came online
- `device.offline` — device went offline
- `device.alert_fired` — alert threshold crossed
- `config.push.success` — config command ACKed
- `config.push.failed` — config command failed or rolled back
- `config.backup.completed` — scheduled backup finished

**Payload format:**

```json
{
  "id": "evt_01hx...",
  "type": "device.offline",
  "timestamp": "2026-04-07T14:32:11Z",
  "org_id": "...",
  "data": {
    "device_id": "...",
    "device_name": "Branch Office Router",
    "last_seen_at": "2026-04-07T14:31:45Z"
  }
}
```

**Signature verification:**

Every webhook POST includes `X-Webhook-Signature: sha256=<hmac>`. Verify it:

```typescript
import { createHmac } from 'crypto'

function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  return `sha256=${expected}` === signature
}
```

---

## Rate limits

| Endpoint | Limit |
|---|---|
| All API endpoints | 100 req / 10s per API key |
| `config.push` | 10 req / min per device |
| `ai.chat` | 20 req / min per org |
| Webhook delivery | 3 retries with exponential backoff |

Rate limit headers returned on every response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1744041600
```
