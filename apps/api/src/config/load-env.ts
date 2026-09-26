import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { envSchema, type Env } from "./env.schema";

const MAX_DIRECTORIES_TO_SEARCH = 6;

/**
 * Walks up from this file looking for the repository-root .env.
 *
 * The alternative — a fixed relative path — breaks depending on how the process
 * was started, because `nest start` runs with cwd at apps/api while `node
 * dist/main.js` from the repo root has cwd at the root. Searching upward is
 * independent of both cwd and whether we are running from src/ or dist/.
 */
function findEnvFile(startDirectory: string): string | undefined {
  let directory = startDirectory;

  for (let level = 0; level < MAX_DIRECTORIES_TO_SEARCH; level += 1) {
    const candidate = join(directory, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }

  return undefined;
}

/**
 * Loads and validates configuration. Throws if anything is missing or malformed,
 * which aborts startup before the server binds a port.
 *
 * Variables already present in the real environment take precedence over the
 * .env file (verified behaviour of process.loadEnvFile), so injected production
 * configuration cannot be shadowed by a stray file left on the host.
 */
export function loadEnv(): Env {
  const envFile = findEnvFile(__dirname);

  // Absent in CI and production, where configuration is injected directly.
  if (envFile) {
    process.loadEnvFile(envFile);
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${details}\n` +
        `Checked ${envFile ?? "process environment only (no .env found)"}`,
    );
  }

  return result.data;
}
