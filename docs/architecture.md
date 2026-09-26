# DevFlow AI — Architecture

Living document. Decisions with lasting consequences also get an ADR in [`adr/`](adr).

## 1. Processes

Three deployable processes, two backing services.

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

The worker cannot hold a WebSocket, since browsers connect to the API. It publishes to
Redis instead, and the Socket.IO Redis adapter fans the message out to whichever API
instance owns that client's socket.

## 2. The four request flows

**Synchronous CRUD.** Controller → guard chain (authenticated, org member, role
sufficient) → service → Prisma → response. No queues. Creating an issue returns the
created issue.

**Asynchronous side effects.** After the transaction commits, the service enqueues a
job. The worker writes the activity record, creates notifications, pushes the realtime
event and queues re-embedding. A failing email provider cannot fail issue creation.

**Realtime.** Used only where a user would otherwise see stale data: board changes,
new comments on an open issue, notification badges, streamed agent output. Everything
else stays HTTP.

**Webhook ingestion.** The controller verifies the HMAC signature, inserts a delivery
row keyed by GitHub's delivery UUID (unique constraint makes redelivery a no-op),
enqueues, and returns 202. GitHub times out at 10 seconds; real work belongs in the worker.

## 3. Modules

**Infrastructure:** Config (Zod-validated at boot), Prisma, Logger (Pino + request IDs),
Queue, Events, Health, Auth.

**Domain:** Users, Orgs, Projects, Issues, Comments, Labels, Sprints, Activity,
Notifications, Incidents, Deployments, GitHub, Documents, Analytics, Audit, AI.

Two rules:

1. A module queries only its own tables. Cross-domain access goes through an exported
   service or an event. See [ADR 0001](adr/0001-modular-monolith.md).
2. `AiModule` depends on domain modules; no domain module depends on `AiModule`. The
   deterministic core stays independent of the probabilistic layer.

## 4. Data model

### MVP entities

```text
User ──< OrganizationMember >── Organization
 │                                   │
 │                                   ├──< Project ──< Issue >──< IssueLabel >── Label
 │                                   │                 │
 │                                   │                 └──< Comment
 │                                   └──< AuditLog
 └──< RefreshToken
```

`ProjectMember` is deliberately deferred. Org membership grants project access and the
org role determines permissions until private projects or per-project role overrides
are actually needed; adding it later is an additive migration plus one change inside
the authorization function.

### Deferred

Sprint · Notification · Activity · Incident · IncidentTimelineEvent · IncidentResponder ·
Deployment · GitHubInstallation · GitHubRepository · GitHubPullRequest · GitHubCommit ·
GitHubReview · GitHubWebhookDelivery · Document · DocumentChunk · AiConversation ·
AiMessage · AiToolCall · AgentRun · ApprovalRequest · AgentMemory

### Conventions

- **`organizationId` on every org-owned table**, even when derivable. Tenant filters stay
  single-table, composite indexes stay possible, and the isolation check is visible in
  every query. Cost: it must be correct on insert and immutable thereafter.
- **Issue keys** (`CHKT-142`) come from an atomic
  `UPDATE projects SET issue_counter = issue_counter + 1 RETURNING issue_counter` inside
  the issue-insert transaction, with `@@unique([projectId, number])` as the backstop.
  A read-then-increment races; a per-project sequence is non-transactional and leaves gaps.
- **Enums in the schema**, not lookup tables. Compile-time safety and a DB constraint, at
  the cost of a migration to add a value.
- **Soft deletion** for comments and projects. Hard deletes destroy audit trails and
  corrupt the RAG index. Deleting a user nulls assignments but preserves authored history.

## 5. Security model

**Authentication.** Short-lived signed JWT access token (~15 min) plus an opaque refresh
token, both in `httpOnly`, `secure`, `sameSite=lax` cookies. The refresh token is 32
random bytes stored only as a SHA-256 hash, rotated on every use, with family-based reuse
detection — replaying an already-rotated token revokes the whole family. The access token
carries `userId` only, never roles: a JWT cannot be un-issued, and stale roles are a
privilege bug. Nothing in `localStorage`.

**Tenancy.** Org ID travels in the URL path (`/orgs/:orgId/...`) and is verified against
`OrganizationMember` by a guard, which attaches `{ orgId, role }` to the request context.
Services read the org from that context, never from the request body. Missing membership
returns 404 rather than 403, so existence cannot be probed.

**Authorization.** `can(role, action, resource)` — a pure function over an explicit
permission matrix, wrapped by a guard. Being pure makes the code that decides who may
delete things exhaustively unit-testable. Hierarchy: OWNER ⊃ ADMIN ⊃ DEVELOPER ⊃ VIEWER.

## 6. AI subsystem

The agent runs inside the API process with no privileged database access. Every tool
declares a Zod input schema, a required permission, and whether it mutates. Execution is:
validate → authorize with the same `can()` used by HTTP → call the domain service →
record an `AiToolCall`. Mutating tools create an `ApprovalRequest` instead of executing.

Tools call services, never Prisma. A tool that reached the database directly would bypass
business rules, authorization, audit logging and event emission at once.

Retrieved document text enters prompts inside delimited blocks marked untrusted. That is
mitigation, not a solution — prompt injection is not fixed by prompting. The real boundary
is that authorization lives in code the model cannot influence: a malicious document can
make the model *attempt* a cross-tenant action; it cannot make the guard approve one.

**Provider layer:** the Vercel AI SDK, wrapped by an `LlmGateway` that owns per-task model
selection, timeouts, retries, token and cost recording, and tracing. Anthropic in
production, Ollama for local development and evaluation runs. Domain code never imports
the SDK directly. Note that embeddings come from a different provider than chat, and the
embedding dimension is fixed in the pgvector column type — changing models later means a
migration plus a full re-index.

## 7. Milestones

| # | Milestone | Status |
| --- | --- | --- |
| 0 | Architecture + repository skeleton | Done |
| 1 | Monorepo, Docker infra, NestJS boot, health, Prisma, CI | Next |
| 2 | Authentication | |
| 3 | Organizations, membership, RBAC, tenant isolation tests | |
| 4 | Projects + issues, front to back | |
| 5 | Comments, labels, issue detail UI | |
| 6 | BullMQ, worker process, activity feed, notifications | |
| 7 | WebSockets | |
| 8 | Documents + seed data | |
| 9 | LLM gateway + first structured-output feature | |
| 10 | RAG: chunking, embeddings, pgvector retrieval | |
| 11 | Tool registry, authorization, agent loop, citations | |
| 12 | Approval workflow + audit integration | |
| 13 | GitHub OAuth, webhooks, PR/commit mirroring | |
| 14 | Incidents, deployments, investigation scenario | |
| 15 | Evaluation harness, observability, hardening, docs | |

Sequencing rationale: CI exists from day one because retrofitting a green pipeline is
miserable. Milestone 4 is a thin vertical slice, validating the whole stack while it is
still cheap to change. Tenant isolation tests land the moment organizations exist, since
auditing them into 200 existing queries later is far harder.

**Explicitly out of scope for now:** sprints, engineering analytics, MCP. The schema stays
compatible with all three — issues carry a nullable `sprintId`, and the tool registry is
shaped so MCP becomes a transport adapter rather than a rewrite. Analytics needs real
historical data to be anything but a chart of seeded noise.

## 8. Known risks

| Risk | Mitigation |
| --- | --- |
| Scope — this is a year of part-time work | Narrowed milestone list; every milestone ends demoable and merged |
| One missing `orgId` is a cross-tenant leak | `orgId` on every table, org from guard context, isolation test suite, later a fail-closed Prisma assertion |
| Refresh rotation false positives across browser tabs | Short grace window on a just-rotated token |
| AI cost and latency | Retrieve-filter-rank, cheap model for classification tasks, per-org token budgets, capped agent iterations, streaming |
| RAG quality degrades invisibly | Golden question/source eval set in CI; expect to need hybrid vector + full-text search |
| Async consistency confuses the UI | Only non-critical work goes async; jobs idempotent; UI treats derived data as eventually consistent |
| GitHub rate limits, duplicate and out-of-order deliveries | Unique delivery ID, thin receive handler, order by event timestamp, HMAC on every payload |
| Overengineering | No technology enters without a written justification tied to a requirement |
