# ADR 0001 — Modular monolith with a separate worker process

- **Status:** Accepted
- **Date:** 2026-09-19

## Context

DevFlow AI spans issue tracking, incidents, deployments, GitHub integration and an AI
agent subsystem. That breadth invites a microservice split, and a portfolio project
carries some temptation to do so for its own sake.

The actual constraints are: one developer, one database, no independent scaling
requirement for any component, and a strong need for cross-domain transactional
consistency (an issue, its labels and its audit record must commit together).

## Decision

Build a modular monolith: one NestJS codebase organised into modules with explicit
boundaries, deployed as two processes — `apps/api` (HTTP + WebSocket) and
`apps/worker` (BullMQ consumers) — sharing one PostgreSQL database.

The API/worker split is the one process boundary we accept up front. It is justified by
genuinely different failure modes and scaling profiles, not by architectural fashion.

Module boundaries are enforced by convention: **a module may query only its own tables.**
Cross-domain reads and writes go through another module's exported service, or through
an event. `IssuesService` may call `MembershipService.requireRole(...)`; it may never
call `prisma.organizationMember.findFirst(...)`.

## Consequences

Positive: single transaction scope, single deployment, no network failure modes between
domains, no distributed tracing required to debug a request, refactoring across module
boundaries stays cheap.

Negative: the boundary rule is a discipline rather than a compiler guarantee. A careless
cross-module query will work fine and quietly erode the seam. Mitigation is code review,
and eventually a lint rule restricting which modules may import `PrismaService`.

We also accept that all modules scale together. Acceptable, because nothing in the
roadmap has a scaling profile that diverges from the rest.

## Alternatives considered

**Microservices from the start.** Rejected: pays the full cost of distributed systems
(network partitions, eventual consistency, per-service deployment, distributed
debugging) to buy independent scaling and deployment that a single developer with one
database does not need.

**Single process including the worker.** Rejected: long-running AI calls and webhook
processing in the same event loop as HTTP traffic makes latency unpredictable, and a
worker crash would take down the API.

**Serverless functions.** Rejected: hostile to persistent WebSocket connections, to
database connection pooling, and to long-running agent executions.

## Revisiting

Extract a service only when a concrete requirement appears: a component needing a
materially different scaling profile, a hard isolation requirement, or sustained
throughput the monolith demonstrably cannot absorb. The module boundary is the seam
along which that extraction would happen.
