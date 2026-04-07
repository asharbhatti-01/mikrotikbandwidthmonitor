# MikroTik Central Management SaaS

> A modern, multi-tenant SaaS platform for centrally managing, monitoring, and configuring MikroTik RouterOS devices at scale.

---

## What is this?

A cloud-based hub that lets ISPs, MSPs, and network engineers manage their entire MikroTik fleet from a single dashboard — without Winbox, without SSH per device, and without opening inbound firewall ports.

## Key capabilities

- **Fleet monitoring** — real-time CPU, RAM, bandwidth, and uptime for every device
- **Config management** — view, push, diff, backup, and restore RouterOS configurations
- **Mass operations** — push firewall rules, address lists, or firmware upgrades to hundreds of routers at once
- **Alerting** — threshold-based alerts via email, webhook, or Slack
- **AI assistant** — natural language config generation, anomaly detection, and incident explanation
- **Multi-tenancy** — fully isolated organizations with roles, audit logs, and API keys

---

## Repository structure

```
mikrotik-saas/
├── apps/
│   ├── web/               # Next.js 15 frontend
│   └── api/               # Hono + Bun backend
├── packages/
│   ├── agent/             # Go agent binary (tunnels to RouterOS)
│   ├── db/                # Drizzle ORM schema + migrations
│   ├── types/             # Shared Zod schemas
│   └── ui/                # shadcn/ui component library
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TECH_STACK.md
│   ├── DATA_MODEL.md
│   ├── API.md
│   ├── AGENT.md
│   ├── ROADMAP.md
│   └── BUSINESS_MODEL.md
├── turbo.json
├── package.json
└── README.md
```

---

## Quick start

### Prerequisites

- [Bun](https://bun.sh) >= 1.1
- [Go](https://go.dev) >= 1.22 (for agent development)
- [Docker](https://docker.com) (for local Postgres + TimescaleDB)
- [Turborepo](https://turbo.build) (`bun install -g turbo`)

### Setup

```bash
# Clone the repo
git clone https://github.com/your-org/mikrotik-saas
cd mikrotik-saas

# Install all dependencies
bun install

# Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start local services (Postgres + TimescaleDB + Redis)
docker compose up -d

# Run database migrations
bun run db:migrate

# Start all apps in development
bun run dev
```

### Environment variables

#### `apps/api/.env`

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mikrotik_saas
REDIS_URL=redis://localhost:6379
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_URL=http://localhost:3001

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

RESEND_API_KEY=re_...
ANTHROPIC_API_KEY=sk-ant-...

AGENT_WS_SECRET=your-agent-ws-secret
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
R2_BUCKET_NAME=mikrotik-backups
```

#### `apps/web/.env`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
BETTER_AUTH_URL=http://localhost:3001
```

---

## Development

```bash
# Run all apps
bun run dev

# Run only the API
bun run dev --filter=api

# Run only the web app
bun run dev --filter=web

# Run database migrations
bun run db:migrate

# Generate a new migration
bun run db:generate

# Open Drizzle Studio (DB GUI)
bun run db:studio

# Run all tests
bun run test

# Lint everything
bun run lint

# Type check everything
bun run typecheck

# Build for production
bun run build
```

### Building the Go agent

```bash
cd packages/agent

# Build for local testing
go build -o bin/agent ./cmd/agent

# Cross-compile for all targets
make build-all
# Outputs: bin/agent-linux-amd64, bin/agent-linux-arm64, bin/agent-linux-mipsle

# Run tests
go test ./...
```

---

## Architecture overview

```
┌─────────────────────────────────────────────────┐
│               Cloudflare Edge                   │
│  Workers (auth/rate limit) + Durable Objects    │
│         (per-device WebSocket rooms)            │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│            Railway Origin                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │  Hono    │  │Trigger   │  │  PostgreSQL   │ │
│  │  API     │  │.dev jobs │  │ +TimescaleDB  │ │
│  └──────────┘  └──────────┘  └───────────────┘ │
└──────────────────┬──────────────────────────────┘
                   │ WSS tunnel (outbound from device)
         ┌─────────▼──────────┐
         │   Go Agent         │
         │  (on MikroTik or   │
         │   local LAN box)   │
         └─────────┬──────────┘
                   │ RouterOS API (8728/8729)
         ┌─────────▼──────────┐
         │   MikroTik Router  │
         └────────────────────┘
```

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full deep-dive.

---

## Documentation index

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design, connectivity strategies, data flow |
| [TECH_STACK.md](./docs/TECH_STACK.md) | Every technology choice with rationale |
| [DATA_MODEL.md](./docs/DATA_MODEL.md) | Database schema, relationships, multi-tenancy |
| [API.md](./docs/API.md) | tRPC routers, endpoints, authentication |
| [AGENT.md](./docs/AGENT.md) | Go agent protocol, security, installation |
| [ROADMAP.md](./docs/ROADMAP.md) | Phased delivery plan, MVP scope |
| [BUSINESS_MODEL.md](./docs/BUSINESS_MODEL.md) | Pricing, plans, revenue strategy |

---

## Contributing

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Write code and tests
3. Run `bun run typecheck && bun run lint && bun run test`
4. Open a pull request — CI must pass before review

---

## License

MIT
