# DevFlow AI — Agent Handoff

**Last verified:** 25 September 2026, by direct inspection of the repository, the running
PostgreSQL instance, and the installed toolchain. Where this document and the code
disagree, **the code is right and this document is stale** — fix the document.

> **If you are a new agent: read section 10 first.** It tells you exactly what to do
> before writing anything.
>
> [`AGENTS.md`](AGENTS.md) is the companion file: **how to work with Varun** (the
> teach-first workflow, review rules, teaching style). This file is **what the project
> is** (state, architecture, decisions, constraints). Read both.

---

## 1. Project overview

**DevFlow AI** is an AI-powered engineering operations platform for software teams. It
combines issue tracking (Linear/Jira-like), incident management, deployment tracking and
GitHub activity into one multi-tenant system, and layers an AI agent on top that answers
questions using the application's own authorized APIs.

**Purpose.** This is a portfolio project for Varun, a full-stack developer with ~2 years
of professional experience. It exists to demonstrate real engineering judgement —
system design, multi-tenancy, async processing, AI architecture, security, testing — and
equally to *teach him* those things as it is built. Shipping fast is explicitly not the goal.

**What makes it technically interesting.** Three things, in order:

1. **The AI agent has no privileged database access.** It calls the same application
   services, through the same authorization checks, as an HTTP request. There is no
   "AI admin" role. A prompt-injected document can make the model *attempt* a
   cross-tenant action; it cannot make the authorization guard approve one.
2. **Tenant isolation is treated as the highest-severity risk** and gets its own test
   suite, its own schema conventions, and explicit request-context plumbing.
3. **The event/worker boundary** — deciding what is synchronous, what is queued, and
   how to avoid the transactional-outbox trap.

Everything else (CRUD for issues, labels, sprints) is competent but ordinary. The three
above are the story.

**Current scope.** Narrowed from an original 36-phase plan to **15 milestones**
(section 5). Sprints, engineering analytics and MCP are documented as future work.
Currently at **Milestone 1, increment 3 of 4** — see section 4.

---

## 2. Current architecture

Full detail lives in [`docs/architecture.md`](docs/architecture.md). This is the summary.

### Processes

Three deployable processes, two backing services. **Not microservices.**

```text
Browser (Next.js)
   │ HTTPS, httpOnly cookies          │ WebSocket
   ▼                                  ▼
apps/api — NestJS
   controllers → guards → services → Prisma
   Socket.IO gateway (rooms: org / project / user)
   AI subsystem (agent, tools, retrieval)
   │            │                │
   ▼            ▼                ▼
PostgreSQL    Redis          GitHub API / LLM provider
+ pgvector    BullMQ queues
   ▲          Socket.IO adapter
   │          rate limits
   │             │
   │        apps/worker — NestJS standalone
   └────────  notifications, activity, webhooks,
              embeddings, long agent runs
```

### Frontend

Next.js App Router, TypeScript, Tailwind, shadcn/ui, TanStack Query, React Hook Form,
Zod. Server components for reads, client components only where interactivity demands it.
The web app holds **no business logic** and **no authorization logic** — frontend checks
are UX, never security.

### Backend

NestJS. Controllers are thin (HTTP translation only); business logic lives in services.
Dependency injection throughout. REST, documented with OpenAPI/Swagger.

### Database

PostgreSQL + Prisma. Conventions:

- **Every organization-owned table carries `organizationId` directly**, even when it is
  derivable through a relation. Tenant filters stay single-table, composite indexes stay
  possible, and the isolation check is visible in every query.
- **snake_case column and table names** via `@map` / `@@map`, because we will write raw
  SQL for vector search and analytics.
- Soft deletion for comments and projects. Deleting a user nulls assignments but
  preserves authored history.
- Enums in the schema, not lookup tables.

### Redis / BullMQ — *not yet implemented (milestone 6)*

Redis is the queue backbone, Socket.IO adapter and rate-limit store. It is explicitly
**not a cache** — caching before measuring is how you get stale-data bugs for a
performance problem you did not have.

### API / worker separation — *worker not yet implemented (milestone 6)*

Different failure modes and scaling profiles: a worker OOM must not drop HTTP traffic.
They share domain code through the monorepo.

**Critical rule: enqueue only *after* the database transaction commits.** Enqueueing
inside the transaction lets a worker pick up a job and query a row that does not exist
yet, or will never exist if the transaction rolls back. We accept the small window where
commit succeeds and enqueue fails; the proper fix is a transactional outbox, documented
as a known limitation rather than built speculatively.

Every job must be **idempotent** — BullMQ delivers at least once.

### WebSockets / realtime — *not yet implemented (milestone 7)*

Socket.IO, chosen over raw `ws` for rooms, reconnection, acknowledgements and a Redis
adapter for horizontal fan-out. Used **only** where a user would otherwise see stale
data: board changes, comments on an open issue, notification badges, streamed agent
output. Normal CRUD stays HTTP.

The worker cannot hold a socket (browsers connect to the API), so it publishes to Redis
and the adapter fans out to whichever API instance owns that client's connection.
Authorization happens at handshake *and* again at room-join — a socket authenticated for
org A must not be able to join a room in org B.

### GitHub integration — *not yet implemented (milestone 13)*

OAuth for repository linking; webhooks for pull requests, commits, reviews, deployments.

Webhook handler does exactly three cheap things and returns 202: verify the HMAC
signature, insert a delivery row keyed by GitHub's delivery UUID (a unique constraint
makes redelivery a no-op), enqueue a job. GitHub times out at 10 seconds and retries, so
parsing and persisting inside the request handler is how you get duplicate data.

Treat all payloads as untrusted. Order by GitHub's event timestamp, not arrival order.

### AI architecture — *not yet implemented (milestones 9–12)*

```text
AgentService.run(actor, conversationId, message)
     │  actor = { userId, orgId, role } — the SAME context an HTTP request carries
     ▼
 1. Input guardrails
 2. Retrieve context (pgvector, org-filtered)
 3. LLM call with tool schemas
 4. Tool loop: Zod validate → authorize → domain service → Prisma
 5. Mutating tool? → ApprovalRequest, pause for human
 6. Record AiToolCall + tokens + cost + trace
 7. Output guardrails + citation assembly
```

**Provider layer:** the Vercel AI SDK, wrapped by an `LlmGateway` owning per-task model
selection, timeouts, retries, token/cost recording and tracing. **Anthropic in
production, Ollama for local development and evaluation runs** (decided). Domain code
never imports the SDK directly.

Note: Anthropic has no embeddings API, so the embedding provider differs from the chat
provider. **The embedding dimension is baked into the pgvector column type** — changing
embedding models later requires a migration plus a full re-index. Treat it as a one-way
door and decide deliberately at milestone 10.

### RAG / pgvector — *not yet implemented (milestone 10)*

pgvector inside PostgreSQL rather than a separate vector database, so retrieval results
live in the same database as the permission metadata we must filter on. Sources:
documents, ADRs, runbooks, postmortems, issues, incidents.

**Retrieval must never cross organizations.** Metadata filtering before similarity.
Expect to need hybrid search (vector + PostgreSQL full-text) — naive chunking plus pure
cosine similarity retrieves plausible-but-irrelevant text often, and the failure is
invisible without an evaluation set.

### Agents / memory — *not yet implemented (milestones 11, and memory later)*

Bounded tool-calling loop with a hard iteration cap. Memory has explicit retention,
scope and deletion rules — it is not an excuse to store unlimited user data.

### MCP — *deferred, out of current scope*

When built, MCP is a **fourth entry point** (alongside HTTP, WebSocket and the internal
agent) over the *same* `ToolRegistry`. It adds a transport and an auth mechanism. It must
not contain a single line of business logic.

### Authentication — *not yet implemented (milestone 2)*

- Short-lived signed **JWT access token** (~15 min) in an `httpOnly`, `secure`,
  `sameSite=lax` cookie.
- Opaque **refresh token**: 32 random bytes, stored only as a SHA-256 hash, rotated on
  every use, with **family-based reuse detection** — replaying an already-rotated token
  revokes the entire family.
- The access token carries `userId` **only, never roles**. A JWT cannot be un-issued, so
  embedded roles go stale and become a privilege bug. Roles are looked up per request.
- Nothing in `localStorage`.
- Known edge case: concurrent requests from multiple browser tabs can both present the
  same refresh token and trigger a false reuse alarm. Handle with a short grace window
  on the just-rotated token.

### Multi-tenancy

Organizations are first-class. A user belongs to many organizations with different roles.

Org ID travels in the **URL path** (`/orgs/:orgId/...`), is verified against
`OrganizationMember` by a guard, and the guard attaches `{ orgId, role }` to the request
context. Services read the org from that context, **never from the request body**.

Missing membership returns **404, not 403**, so existence cannot be probed.

**Per-request context is passed explicitly as a function parameter**, never stored on a
singleton service field (that is a cross-tenant data leak under concurrency — see
section 6) and never hidden in `AsyncLocalStorage`. ALS is reserved for request IDs and
log correlation, where invisibility is harmless.

### RBAC

`OWNER ⊃ ADMIN ⊃ DEVELOPER ⊃ VIEWER`.

Implemented as a **pure function** `can(role, action, resource)` over an explicit
permission matrix, wrapped by a guard and decorator. Purity makes the code that decides
who may delete things exhaustively unit-testable in milliseconds.

### Audit logging

Append-only `AuditLog` from the MVP onward: actor, actorType (`USER | AI_AGENT | SYSTEM`),
organization, action, resource, timestamp, metadata. Never store secrets in it.

---

## 3. Architectural decisions and why

Each of these was argued, not assumed. Do not silently reverse one.

| Decision | Why | Cost we accepted |
| --- | --- | --- |
| **Modular monolith** | One developer, one database, no divergent scaling need. Microservices buy distributed failure modes for nothing. See [ADR 0001](docs/adr/0001-modular-monolith.md) | Boundaries are convention, not compiler-enforced |
| **Separate API and worker processes** | Genuinely different failure modes and scaling profiles; a worker OOM must not drop HTTP traffic | Two processes to run locally |
| **Module owns its tables** | A module may query **only its own tables**. Cross-domain access goes through an exported service or an event. `IssuesService` may call `MembershipService.requireRole(...)`; it may **never** call `prisma.organizationMember.findFirst(...)` | Requires discipline and review; eventually a lint rule |
| **`MembershipService` is the authorization boundary** | One place resolves "is this user in this org, and with what role?" Duplicating that query across modules means N places to get tenant isolation wrong | An extra indexed query per request |
| **AI dependency direction** | `AiModule` depends on domain modules; **no domain module depends on `AiModule`**. Keeps deterministic core independent of probabilistic layer | AI features cannot be triggered from inside domain services; they call in from outside |
| **AI tools use normal authorization** | Tools call domain services with the user's own `{ userId, orgId, role }`. No service-role client, no AI-admin bypass | Agent can do strictly less than a human admin — correct |
| **MCP reuses the existing tool registry** | Same validation and authorization layer; MCP is transport only | MCP cannot expose anything the internal agent cannot |
| **REST, not GraphQL** | Predictable caching, simple auth per endpoint, OpenAPI tooling. No client-shape problem that GraphQL solves | Some over-fetching; revisit only with a concrete reason |
| **Sync vs async** | Anything the user waits for is synchronous HTTP. Side effects (activity, notifications, embeddings, webhooks, long AI runs) are queued | Derived data is eventually consistent; UI must not pretend otherwise |
| **Webhook idempotency** | Unique index on GitHub's delivery UUID; handler verifies, records, enqueues, returns 202 | Duplicate deliveries are a cheap no-op |
| **Realtime only where it earns its place** | WebSockets for stale-data problems, HTTP for everything else | Two transports to reason about |
| **PostgreSQL + pgvector, one database** | Retrieval results live beside the permission metadata we filter on; one backup story, one transaction boundary | pgvector needs index tuning at large scale |
| **Prisma** | Type-safe queries, reviewable SQL migrations | Weak at complex analytics → drop to `$queryRaw` deliberately |
| **Zod over class-validator** | One library for env validation, DTOs, webhook payloads and AI tool schemas; infers TypeScript types from the same declaration, so type and check cannot drift. The Vercel AI SDK uses it natively | Not the NestJS default, so needs a pipe to integrate |
| **No `@nestjs/config`** | Node 20.12+ has `process.loadEnvFile()`; `ConfigService.get()` is stringly-typed and returns `T \| undefined`. We parse once into a typed frozen `AppConfig` class | Diverges from most NestJS tutorials |
| **Config validated at boot, fail fast** | Misconfiguration surfaces at startup, in CI, not at 3am on a rare code path | Loses graceful degradation: one missing optional var kills the whole process. So genuinely optional config must be `.optional()` in the schema |
| **Real env vars beat `.env`** | Verified behaviour of `process.loadEnvFile`. A stray `.env` on a host can never shadow injected production config | None |
| **Unguessable IDs are not authorization** | UUIDs reduce the blast radius of an authorization failure and stop enumeration; they do **not** replace the tenant check | Slightly larger keys |
| **Three global modules maximum** | `@Global()` is for cross-cutting infrastructure (config, logging, database). Domain modules never qualify — globals destroy the dependency graph as documentation and bypass circular-dependency detection | — |

---

## 4. Current repository state

**Verified by inspection on 25 Sep 2026, and re-checked the same day** (toolchain, `typecheck` on `@devflow/api` and `@devflow/db`, live PostgreSQL, migrations folder, git). Everything below is fact, not intent. The `User` model is still the open task.

### Toolchain actually installed

| Tool | Version | Note |
| --- | --- | --- |
| Node | **25.1.0** | ⚠️ Prisma prints "only supports 20.19+, 22.12+, 24.0+". **Recommend Node 24 LTS.** |
| pnpm | 10.33.2 | Pinned via `packageManager` in root `package.json` |
| TypeScript | **6.0.3 installed** | Declared as `^6.0.3` (caret, so 6.x can float). TS 7.0 ships only the `tsc` binary — no programmatic compiler API — and the Nest CLI refuses it. Do **not** upgrade to 7.x until 7.1 |
| NestJS | 12.0.3 | |
| Prisma CLI + client | **7.10.0 (exact pin)** | |
| `@prisma/adapter-pg` / `pg` | 7.10.0 / ^8.23.0 | Prisma 7 requires a driver adapter |
| Zod | 4.6.5 | |
| Turborepo | 2.11.2 | Uses the `tasks` key (v2 syntax) |
| Prettier | 3.9.8 | |
| PostgreSQL | **18.3, native Windows install** (not Docker) | |
| Docker | **NOT INSTALLED** | WSL2 also not installed |

### Files that exist

```text
HANDOFF.md                      ← this file
README.md
docker-compose.yml              written, never run (Docker absent). Specifies pg16 —
                                  MISMATCH with local PG 18, align when adopting Docker
package.json                    root scripts, packageManager pin
pnpm-workspace.yaml             workspace globs + onlyBuiltDependencies
turbo.json                      task graph
.env / .env.example             .env exists locally (gitignored)
.npmrc .editorconfig .gitignore .prettierrc.json .prettierignore

apps/api/                       ✅ RUNS
  package.json  tsconfig.json  nest-cli.json
  src/main.ts                   bootstrap, reads port from AppConfig
  src/app.module.ts             composition root: [ConfigModule, HealthModule]
  src/config/env.schema.ts      Zod schema: NODE_ENV, API_PORT only
  src/config/load-env.ts        upward .env search + validation, throws on invalid
  src/config/app-config.ts      typed frozen config class, own DI token
  src/config/config.module.ts   @Global
  src/health/health.{module,controller,service}.ts   GET /health (liveness)
  src/{common,infra,modules}/   EMPTY (.gitkeep only)
  test/                         EMPTY

apps/web/                       ⛔ SKELETON ONLY — no Next.js installed
  package.json (scripts only, zero deps)  tsconfig.json
  src/{app,components,lib}/ public/       EMPTY (.gitkeep only)

apps/worker/README.md           ⛔ README only, intentionally no package.json

packages/db/                    ✅ typechecks
  package.json                  prisma 7.10.0, @prisma/client, adapter-pg, pg, dotenv-cli
  prisma.config.ts              Prisma 7 config: schema path, migrations path, datasource url
  prisma/schema.prisma          generator + datasource + User model (SEE ISSUES BELOW)
  prisma/migrations/            EMPTY — no migration has ever been created
  src/index.ts                  re-exports @prisma/client
packages/contracts/             ✅ typechecks, but src/index.ts is `export {}` — empty
packages/eslint-config/         package.json + base.js. ESLint is NOT INSTALLED anywhere
packages/tsconfig/              base / library / nestjs / nextjs — all in use

docs/architecture.md            current, matches reality
docs/adr/0001-modular-monolith.md
docs/setup.md
.github/workflows/              EMPTY — no CI exists
```

### Database state (verified by querying it)

- PostgreSQL **18.3** running as a Windows service on `localhost:5432`.
- Role `devflow` exists: `CREATEDB = true`, `SUPERUSER = false`. (CREATEDB is needed for
  Prisma's *shadow database* during `migrate dev`; production uses `migrate deploy`,
  which does not need it.)
- Database `devflow` exists, owned by `devflow`.
- **`public` schema contains 0 tables.** No migration has been applied.
- Installed extensions: `plpgsql` only. **`citext` is NOT installed.**
- **`vector` is NOT AVAILABLE** in `pg_available_extensions` — pgvector is not bundled
  with the Windows installer and building it natively is unpleasant.

### Configuration state

Single root `.env`, copied from `.env.example`, holding `NODE_ENV`, `DATABASE_URL`,
`REDIS_URL`, `API_PORT`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`.

Only `NODE_ENV` and `API_PORT` are in the Zod schema, deliberately: **the schema only
contains variables that code actually reads.** `DATABASE_URL` joins it when Prisma is
wired into the API; `CORS_ORIGIN` when the browser calls us; `REDIS_URL` at milestone 6.

`packages/db` reads `DATABASE_URL` via `dotenv -e ../../.env` in its package scripts.

### What is implemented / partial / missing

**Implemented and verified working**
- Monorepo: pnpm workspaces + Turborepo, shared tsconfig and Prettier.
- NestJS boots. `GET /health` is liveness and does not touch the database. `GET /health/ready` runs `SELECT 1` and returns 503 with a fixed body when the query throws. Verified 26 Sep 2026: liveness 200, readiness 200 against the local database.
- Configuration: Zod-validated, fails fast, typed `AppConfig` injected via DI, real env
  vars override `.env`. Verified: invalid `API_PORT` exits 1 before binding a port.
- Prisma installed, configured for v7, client generates successfully.
- All three packages pass `typecheck`.

**Partially done**
- `User` migration `20260926061922_init_users` is applied. `PrismaService` is wired. `GET /health/ready` is implemented. Verified: `$connect()` does not open a Postgres connection with the pg adapter; the readiness query does.
- `docker-compose.yml` exists but has never been run.

**Missing entirely**
- Git repository, CI, ESLint runtime, any test framework, any test.
- Next.js application.
- Everything from milestone 2 onward.

### ⚠️ Known issues and unresolved items

1. **Milestone 1, increment 3 is done through readiness.** `GET /health/ready` returns
   `{status:"ok"}` when `SELECT 1` succeeds. A thrown query becomes
   `ServiceUnavailableException` ("Database is unavailable"), logged server-side.
   The failure path was not exercised against a stopped Postgres in this session.
   Next increment is the Next.js shell, or git init — see section 5. Do not start
   either without telling the user.

2. **Node 25.1.0 is unsupported by Prisma.** It has worked so far. If anything bizarre
   happens during migration, this is suspect number one. Recommend Node 24 LTS.

3. **Never install Prisma with `latest`.** The `prisma` dist-tag `latest` currently points
   at `8.0.0-rc.15` (a release candidate) while `@prisma/client` `latest` is `7.10.0`.
   Installing naively produces a **CLI/client major-version mismatch**. Both are pinned
   to exact `7.10.0`. Upgrade only deliberately, both together.

4. **`pnpm lint` will fail** — `packages/eslint-config/base.js` exists but ESLint,
   `typescript-eslint` and `eslint-config-prettier` are not installed, and no app has an
   `eslint.config.mjs`.

5. **No git repository.** `git init` and an initial commit are overdue.

6. **`node_modules` contains leftovers** from the accidental Prisma 8 RC install
   (`@alchemy.run/cloudflare-runtime` and similar, with paths deep enough to break
   recursive directory listing on Windows). Harmless but consider
   `rm -r node_modules; pnpm store prune; pnpm install`.

7. **Docker is required before milestone 6** (Redis) **and milestone 10** (pgvector,
   confirmed unavailable on this PostgreSQL install). Needs WSL2 + reboot.

8. **`docker-compose.yml` specifies `pgvector/pgvector:pg16`** while local PostgreSQL is
   18. Align them when Docker is adopted to avoid local/CI drift.

9. **The sandbox on this machine cannot enforce filesystem isolation**, so every shell
   command must be run with elevated permission and will prompt the user.

---

## 5. Roadmap

### Completed

- **Milestone 0** — architecture, ADR, repository skeleton.
- **Milestone 1, increment 1** — NestJS boots, `GET /health`.
- **Milestone 1, increment 2** — validated configuration.

### In progress

- **Milestone 1, increment 3** — Prisma, `User` model, first migration, `/health/ready`.
  Done. `users` is migrated, `PrismaService` is wired, `GET /health/ready` runs `SELECT 1`.

### Remaining

| # | Milestone | Portfolio-critical? |
| --- | --- | --- |
| 1 | Finish: `User` migration, `PrismaService`, `/health/ready` | Foundation |
| 1 | Next.js shell + CI | Foundation |
| 2 | Authentication (refresh rotation, reuse detection) | **Yes** |
| 3 | Organizations, membership, RBAC, **tenant isolation test suite** | **Yes — highest value** |
| 4 | Projects + issues, front to back (thin vertical slice) | **Yes** |
| 5 | Comments, labels, issue detail UI | Yes |
| 6 | BullMQ, worker process, activity feed, notifications | **Yes** |
| 7 | WebSockets | Yes |
| 8 | Documents module + realistic seed data | Enables 10 |
| 9 | LLM gateway + first structured-output feature | **Yes** |
| 10 | RAG: chunking, embeddings, pgvector, tenant-filtered retrieval | **Yes** |
| 11 | Tool registry, authorization, agent loop, citations | **Yes — the centerpiece** |
| 12 | Human approval workflow + audit integration | **Yes** |
| 13 | GitHub OAuth, webhooks, PR/commit mirroring | Yes |
| 14 | Incidents, deployments, the investigation demo | **Yes** |
| 15 | Evaluation harness, observability, hardening, docs polish | Yes |

**Sequencing rationale.** CI early because retrofitting a green pipeline is miserable.
Milestone 4 is a deliberate vertical slice, validating the whole stack while it is still
cheap to change. Tenant isolation tests land the moment organizations exist, because
auditing them into 200 existing queries later is far harder.

### Future / stretch, explicitly out of scope

Sprints · engineering analytics · MCP.

The schema stays compatible with all three — issues will carry a nullable `sprintId`, and
the tool registry is shaped so MCP becomes a transport adapter rather than a rewrite.
Analytics without months of real data is a chart of seeded noise.

---

## 6. Constraints the next agent must not violate

1. **Never let the AI bypass application authorization.** Tools call domain services with
   the user's own context. No service-role client. No "AI admin" permission. No arbitrary
   SQL exposed to a model, ever.
2. **Never trust a client-supplied organization ID.** It comes from the URL, is verified
   against `OrganizationMember` by a guard, and reaches services through the request
   context.
3. **Never store per-request state on a singleton service field.** Providers are
   singletons; every `await` is a yield point where another request can run. Request A
   sets `currentUserId`, awaits, request B overwrites it, request A resumes with B's
   identity — a cross-tenant data leak. Pass context explicitly as a parameter.
4. **A module queries only its own tables.** Cross-domain access goes through an exported
   service or an event.
5. **`@Global()` is for infrastructure only.** Config, logging, database. Never a domain
   module.
6. **No business logic in controllers, and none in queue processors.** Both coordinate;
   services decide.
7. **Enqueue after commit, never inside the transaction.**
8. **Every background job must be idempotent.**
9. **Every webhook must have its signature verified and its delivery ID deduplicated.**
10. **Never add a dependency without stating** what problem it solves, the alternatives,
    and why this one. Do not install two libraries that solve the same problem.
11. **Never pin to `latest` for compilers, runtimes or database tooling.** This project
    has already been bitten twice (TypeScript 7, Prisma 8 RC).
12. **Never silently change the database schema.** Explain entities, relationships,
    indexes, constraints and migration impact first. Use proper Prisma migrations.
13. **Do not introduce microservices, Kafka, Go, or GraphQL** without a concrete,
    demonstrated requirement.
14. **Do not modify unrelated files** or rewrite working code.
15. **Frontend checks are never security.**

---

## 7. The learning goal — read this twice

**The user is not asking you to build this project for him.** He is asking you to teach
him to build it. A finished repository he does not understand is a failure, even if every
test passes.

### Required workflow for every increment

```text
1. EXPLAIN     what we're building, why, the architecture, the data flow,
               which files are involved, any concept he may not know
2. TASK        give him a small, well-scoped implementation task —
               exact file, what it must accomplish, hints and constraints
3. HE WRITES   stop. do not write the solution.
4. REVIEW      inspect his code critically (section 8)
5. EXPLAIN     what is wrong and WHY — not just what to change
6. HINT        let him attempt the fix himself
7. SOLVE       only if he is genuinely stuck after attempting
8. VERIFY      run the build / typecheck / tests yourself. Investigate failures
               yourself. Explain them. Never hide an error.
9. SUMMARISE   what he implemented, what he learned, which decisions mattered,
               what he should be able to explain in an interview
```

### Division of labour

**You may write (repetitive setup):** package and workspace config, tsconfig,
ESLint/Prettier, Docker Compose, NestJS bootstrap, empty module shells, generated Prisma
boilerplate, configuration plumbing, CI workflow files.

**He writes (meaningful logic):** controllers, services, authorization checks, Prisma
queries, transactions, event handling, BullMQ jobs, webhook processing, WebSocket flows,
AI tools, RAG logic, MCP integration, business rules.

### Additional expectations

- **Do not praise code because it works.** Review it critically. Working code with a
  concurrency bug or a missing tenant filter is not good code.
- **If he misunderstands an architectural concept, stop and correct it** before
  continuing. This has already happened twice and both corrections mattered more than the
  code did.
- **Ask him comprehension questions** after each increment, phrased the way an
  interviewer would ask. Correct wrong answers directly and completely.
- **Make him run the checks before submitting.** He has already handed over a schema with
  a typo that `prisma validate` would have caught instantly.

### Misconceptions already corrected — do not assume they are fully internalised

- `experimentalDecorators` (allows decorator syntax) vs `emitDecoratorMetadata` (emits
  constructor parameter types for DI). Removing the latter compiles fine and fails at
  runtime.
- Liveness vs readiness probes, and why a database check in a liveness probe turns a
  30-second blip into a multi-minute `CrashLoopBackOff` outage.
- Singleton providers and the concurrent-request state race.
- `@Global()` affects **visibility**, not instance count. He initially thought it created
  multiple instances.
- **Unguessable IDs are not access control** (IDOR). He initially believed UUIDs prevent
  users reaching each other's data.

---

## 8. Code review rules

Review every submission against all of these, in roughly this priority order:

1. **Tenant isolation** — is `organizationId` filtered, and does it come from verified
   request context rather than user input? Could this query ever return another org's row?
2. **Authorization** — is the check present, in the service (not only the controller),
   and does it use the shared `can()` / `MembershipService`?
3. **Security** — input validated at the boundary? secrets not logged or returned?
   errors not leaking internals? SQL parameterised?
4. **Correctness** — does it do what was asked, including edge cases and empty results?
5. **Concurrency** — per-request state on a singleton? read-then-write races? Does it need
   a transaction or a unique constraint instead of a check-then-insert?
6. **Transactions** — are multi-write operations atomic? Is anything enqueued *inside* a
   transaction?
7. **Module boundaries** — is it querying another module's tables? Is the dependency
   direction right (nothing depends on `AiModule`)?
8. **Error handling** — are errors differentiated (validation / auth / not-found /
   conflict / external / unexpected)? Anything swallowed? Any unhandled rejection?
9. **Architecture** — thin controller, focused service, no premature abstraction, follows
   patterns already established in this repo?
10. **Maintainability** — naming, function size, `any` usage, dead code, unexplained TODOs.
11. **Production concerns** — indexes for this query pattern? N+1? unbounded result set
    with no pagination? external call without a timeout? job not idempotent?

State clearly which category each problem falls into. Severity ordering matters: a
missing tenant filter is not the same class of problem as an awkward variable name.

---

## 9. Teaching style

- **Explain from fundamentals when the concept is new.** Do not assume knowledge of
  distributed systems, queues, event-driven design, vector search, OAuth or WebSockets.
- **Do not turn everything into a beginner tutorial either.** He is a working developer
  with two years of experience; he knows TypeScript, HTTP and SQL basics.
- **Use concrete examples over abstractions.** "Alice's request sets the field, awaits,
  Bob's request overwrites it, Alice resumes and reads Bob's ID" beats "mutable shared
  state is unsafe."
- **Use ASCII diagrams** for request flows, data flows and process boundaries.
- **Always give the tradeoff.** Every decision costs something; name it. "This is the
  standard approach" is not an explanation.
- **When he asks "why?", answer in five parts:** what problem it solves, how the mechanism
  works, what alternatives exist, why we chose this one, what we accept in return.
- **Verify library behaviour instead of asserting it.** This project runs on a toolchain
  where `latest` has been wrong twice. Probe it, read the installed package, fetch the
  docs — then state it. Say "I verified X" or "I am not certain about X", never guess
  confidently.

---

## 10. Instructions for the next agent — do this first

**Do not generate code in your first response.** Do this instead, in order:

1. **Read this file completely**, then [`docs/architecture.md`](docs/architecture.md) and
   [`docs/adr/0001-modular-monolith.md`](docs/adr/0001-modular-monolith.md).

2. **Verify the documented state against reality.** Do not trust section 4 — it goes stale.
   At minimum:

   ```powershell
   # toolchain
   node -v; pnpm -v; pnpm exec tsc --version

   # what actually exists
   Get-ChildItem -Recurse -File apps, packages, docs |
     Where-Object { $_.FullName -notmatch 'node_modules|dist' }

   # does it build?
   pnpm --filter @devflow/api typecheck
   pnpm --filter @devflow/db typecheck

   # database truth
   $env:PGPASSWORD="devflow"
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U devflow -h localhost -d devflow `
     -c "\dt" -c "SELECT extname FROM pg_extension;"
   Remove-Item Env:\PGPASSWORD

   # has a migration ever run?
   Get-ChildItem packages/db/prisma/migrations
   ```

   Note: shell commands on this machine need elevated permission because the sandbox
   cannot enforce filesystem isolation.

3. **Report any discrepancy** between this document and what you find, and update this
   file. Treat the code as the source of truth.

4. **Identify the next increment.** As of this writing it is:
   **Milestone 1 is not finished.** Increment 3 (User migration, `PrismaService`,
   `/health/ready`) is done. Next is the Next.js shell and CI, unless the user
   wants `git init` first. Do not start that work in the first response of a
   new session; explain it and give one task.

5. **Explain that increment to the user** using the section 7 workflow — what, why,
   architecture, files, concepts — and then **give him a small task and stop.**

6. **Do not** run migrations, install dependencies beyond what the increment needs, or
   write application logic on his behalf.

### Useful commands

```powershell
pnpm install
pnpm --filter @devflow/api dev          # watch mode
pnpm --filter @devflow/api build
pnpm --filter @devflow/api typecheck
pnpm --filter @devflow/db generate      # regenerate Prisma client
pnpm --filter @devflow/db validate      # validate schema
pnpm --filter @devflow/db migrate       # migrate dev (NOT YET RUN)
node apps/api/dist/main.js              # start built API
Invoke-RestMethod http://localhost:4000/health
```

Use `Invoke-RestMethod` or `curl.exe`, **not** `Invoke-WebRequest` — Windows PowerShell
5.1 routes it through Internet Explorer's parser and it fails in non-interactive shells.
