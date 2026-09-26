# @devflow/worker

Background job consumer. **Not implemented yet — arrives in Milestone 6.**

This directory intentionally has no `package.json`, so pnpm does not treat it as a
workspace member and Turborepo does not try to build it.

## Why it is a separate process

The worker and the API have different failure modes and different scaling profiles.
A job that exhausts memory or blocks on a slow external API should not degrade HTTP
traffic, and we should be able to run more workers without running more API instances.
They share domain code through the monorepo, so the split costs very little.

## What it will own

- Activity feed records and notifications triggered by domain events
- GitHub webhook payload processing (the API only verifies, persists the delivery ID, and enqueues)
- Embedding generation and re-indexing for RAG
- Long-running agent executions
- Scheduled aggregation jobs

## The rule that keeps it maintainable

Queue processors coordinate; they do not hold business logic. A processor unpacks the
job payload, calls the relevant application service, and handles retry semantics.
Every job must be idempotent, because BullMQ delivers at least once.
