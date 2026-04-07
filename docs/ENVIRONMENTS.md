# Environments

This project runs fully containerized via Docker Compose. Two environments are defined: **Development** and **Staging**. Production uses the same images as staging but is deployed to Railway + Cloudflare (see [ARCHITECTURE.md](./ARCHITECTURE.md)).

---

## Quick reference

| | Development | Staging |
|---|---|---|
| Compose file | `docker-compose.dev.yml` | `docker-compose.staging.yml` |
| Env file | `.env.dev` | `.env.staging` |
| Image build target | `dev` (hot reload) | `production` (minified) |
| Source mounts | Yes (bind mounts) | No (baked into image) |
| Resource limits | None | Enforced per service |
| Redis auth | No password | Password required |
| Mailpit | Yes (port 8025) | No |
| MinIO console | Yes (port 9001) | Yes (port 9001) |

---

## Services

| Service | Port | Description |
|---|---|---|
| `web` | 3000 | Next.js 15 frontend |
| `api` | 3001 | Hono + Bun API server |
| `trigger-worker` | — | Trigger.dev background job worker |
| `agent` | — | Go agent (connects to API via WebSocket) |
| `postgres` | 5432 | PostgreSQL 17 + TimescaleDB + pgvector |
| `redis` | 6379 | Redis 7 (session cache, pub/sub, queues) |
| `minio` | 9000 / 9001 | S3-compatible storage (replaces Cloudflare R2) |
| `mailpit` | 8025 / 1025 | Local email capture (dev only) |

---

## Development

### Setup

```bash
# 1. Copy the example env file
cp .env.dev.example .env.dev

# 2. Start everything
docker compose -f docker-compose.dev.yml up -d

# 3. Run database migrations
docker compose -f docker-compose.dev.yml exec api bun run db:migrate

# 4. Open the app
open http://localhost:3000
```

### Hot reload

All application services use bind mounts in dev. Changes to source files are picked up automatically:

- **API / Trigger worker** — Bun `--hot` flag, restarts on file change
- **Web** — Next.js fast refresh via HMR
- **Agent** — [Air](https://github.com/air-verse/air) live reloader for Go

### Local tools

| Tool | URL | Purpose |
|---|---|---|
| Web app | http://localhost:3000 | Frontend dashboard |
| API | http://localhost:3001 | Backend API |
| Mailpit | http://localhost:8025 | View captured emails |
| MinIO Console | http://localhost:9001 | Browse backup files |
| Drizzle Studio | Run `bun run db:studio` | Database GUI |

### Useful commands

```bash
# View logs for a specific service
docker compose -f docker-compose.dev.yml logs -f api

# Restart a single service
docker compose -f docker-compose.dev.yml restart api

# Rebuild after Dockerfile changes
docker compose -f docker-compose.dev.yml up -d --build api

# Run database migrations
docker compose -f docker-compose.dev.yml exec api bun run db:migrate

# Generate a new migration
docker compose -f docker-compose.dev.yml exec api bun run db:generate

# Connect to Postgres directly
docker compose -f docker-compose.dev.yml exec postgres psql -U postgres mikrotik_saas

# Wipe everything and start fresh
docker compose -f docker-compose.dev.yml down -v
```

---

## Staging

Staging mirrors production as closely as possible. Images are built from the `production` target (multi-stage, minified, no source mounts). Resource limits are enforced.

### Setup

```bash
# 1. Copy and fill in all required values
cp .env.staging.example .env.staging
# Edit .env.staging — all values are required

# 2. Build and start
docker compose -f docker-compose.staging.yml up -d --build

# 3. Run database migrations
docker compose -f docker-compose.staging.yml exec api bun run db:migrate
```

### Key differences from dev

- **No hot reload** — source code is baked into the image at build time
- **Redis requires a password** — set `REDIS_PASSWORD` in `.env.staging`
- **No Mailpit** — emails go through the real SMTP provider (Resend)
- **Resource limits** — each service has CPU and memory caps via `deploy.resources`
- **Public URLs required** — `PUBLIC_API_URL` and `PUBLIC_WS_URL` must be set for the frontend to reach the API

### Rebuilding after code changes

```bash
# Rebuild all services
docker compose -f docker-compose.staging.yml up -d --build

# Rebuild a specific service
docker compose -f docker-compose.staging.yml up -d --build api
```

---

## Postgres extensions

The init script (`docker/postgres/init.sql`) enables these extensions on first startup:

| Extension | Purpose |
|---|---|
| `timescaledb` | Time-series hypertables for device metrics |
| `vector` (pgvector) | Embedding-based anomaly search |
| `pg_trgm` | Fuzzy text search on device names and IPs |
| `uuid-ossp` | UUID generation |

If you need to add an extension, update `docker/postgres/init.sql` and recreate the postgres volume:

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
```

---

## File structure

```
.
├── docker-compose.dev.yml          # Dev environment
├── docker-compose.staging.yml      # Staging environment
├── .env.dev.example                # Dev env template
├── .env.staging.example            # Staging env template
├── docker/
│   ├── api/Dockerfile              # API multi-stage build
│   ├── web/Dockerfile              # Web multi-stage build
│   ├── agent/Dockerfile            # Go agent multi-stage build
│   └── postgres/init.sql           # Extension init script
```

---

## Production

Production is **not** Docker Compose. It uses:

- **Railway** — API, Trigger workers, managed PostgreSQL + TimescaleDB
- **Vercel** — Next.js frontend (auto-deploy on push to `main`)
- **Cloudflare** — Workers, Durable Objects, R2, D1
- **Upstash** — Serverless Redis

The staging compose file uses the same `production` Dockerfile targets, so if it works in staging it will work in production. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full production topology.
