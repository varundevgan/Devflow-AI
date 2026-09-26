# Local setup

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20 LTS or newer | |
| pnpm | 9 or newer | `npm install -g pnpm` |
| Docker Desktop | current | Must be running before `infra:up` |

## First run

```bash
cp .env.example .env     # PowerShell: Copy-Item .env.example .env
pnpm install
pnpm infra:up
```

`pnpm infra:up` starts PostgreSQL (with the pgvector and citext extensions) on
port 5432 and Redis on port 6379. Both containers declare healthchecks, so
`docker compose ps` shows whether they are actually ready rather than merely started.

## Environment variables

One `.env` at the repository root serves Docker Compose, the API and the worker.
`.env.example` is the source of truth for the list; keep the two in sync when adding
a variable. Only variables prefixed `NEXT_PUBLIC_` reach the browser — never put a
secret behind that prefix.

## Useful commands

| Command | Effect |
| --- | --- |
| `pnpm dev` | Runs every app's dev task through Turborepo |
| `pnpm build` | Builds in dependency order |
| `pnpm lint` / `pnpm typecheck` | What CI runs |
| `pnpm db:migrate` | Creates and applies a migration |
| `pnpm db:generate` | Regenerates the Prisma client |
| `pnpm db:studio` | Opens Prisma Studio |
| `pnpm infra:down` | Stops containers, keeps data |
| `pnpm infra:reset` | Stops containers and **deletes volumes** |

`infra:reset` is the only way to re-run `docker/postgres/init/*.sql`, since those
scripts execute once when the data volume is created.

## Troubleshooting

**Port 5432 already in use.** A local PostgreSQL install is running. Stop it, or change
the host-side port mapping in `docker-compose.yml` and the port in `DATABASE_URL`.

**Prisma cannot find `DATABASE_URL`.** The Prisma CLI reads `.env` from its working
directory. Package scripts in `packages/db` load the root file explicitly via
`dotenv -e ../../.env`; run them through `pnpm db:*` from the repository root rather
than invoking `prisma` directly.

**Editor reports unresolved `@devflow/*` imports.** The workspace symlinks are created
by `pnpm install`. Until Milestone 1 declares dependencies there is nothing to link.
