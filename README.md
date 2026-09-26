# DevFlow AI

An AI-powered engineering operations platform: issue tracking, incidents, deployments, and
GitHub activity in one multi-tenant system. The AI agent will answer questions through the
application's own authorized APIs. It will not get a direct database connection or an admin
bypass.

**Status:** Milestone 1 foundation is in place. The API boots, configuration is validated
at startup, and PostgreSQL is reachable through Prisma. Authentication, organizations, the
web app, and the agent are not built yet.

Working on this with an AI agent? Read [`HANDOFF.md`](HANDOFF.md) first. Design detail is
in [`docs/architecture.md`](docs/architecture.md).

## What runs today

| Piece | Behavior |
| --- | --- |
| `GET /health` | Liveness. Returns 200 when the process is up. Does not touch the database. |
| `GET /health/ready` | Readiness. Runs `SELECT 1`. Returns 200 when PostgreSQL answers, 503 when it does not. |
| `users` | First table. `id` is UUID v7, stored as PostgreSQL `uuid`. |

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js, TypeScript, Tailwind, shadcn/ui, TanStack Query (not installed yet) |
| API | NestJS, REST. Socket.IO comes later. |
| Data | PostgreSQL, Prisma 7.10 |
| Async | Redis, BullMQ, separate worker process (milestone 6) |
| AI | Vercel AI SDK. Anthropic in production, Ollama locally (not built yet). |

## Repository layout

```text
apps/
  api/        NestJS HTTP process
  web/        Next.js frontend (skeleton)
  worker/     BullMQ consumers (not created yet)
packages/
  db/         Prisma schema, migrations, client
  contracts/  Shared Zod schemas (empty)
  eslint-config/
  tsconfig/
docs/         Architecture, ADRs, setup
```

## Prerequisites

- Node.js 20 or newer (24 LTS is the recommended line; Prisma does not list Node 25 as supported)
- pnpm 10 (`packageManager` pins 10.33.2)
- PostgreSQL running locally, with a database matching `DATABASE_URL`

Docker Compose is in the repo for PostgreSQL and Redis. Docker is not required for the
current API. The compose file uses Postgres 16; a native Windows install may be a newer
major version.

## Getting started

```powershell
Copy-Item .env.example .env
pnpm install
pnpm --filter @devflow/db migrate
pnpm --filter @devflow/api dev
```

The API listens on `http://localhost:4000` unless `API_PORT` says otherwise.

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/health/ready
```

`.env` is gitignored. `.env.example` lists the variables. Only `NODE_ENV`, `API_PORT`, and
`DATABASE_URL` are read by the API today.

## Documentation

- [Architecture](docs/architecture.md)
- [Setup](docs/setup.md)
- [Decision records](docs/adr)
