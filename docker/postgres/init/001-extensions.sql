-- Runs once, on first creation of the postgres-data volume.
-- If you need to re-run it: pnpm infra:reset (destroys all local data).

-- Case-insensitive text, used for user emails so Alice@x.com and alice@x.com collide.
CREATE EXTENSION IF NOT EXISTS citext;

-- Vector similarity search. Created now so the extension exists long before the
-- RAG milestone needs it; no table depends on it yet.
CREATE EXTENSION IF NOT EXISTS vector;
