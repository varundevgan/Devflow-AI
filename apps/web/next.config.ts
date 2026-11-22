import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";

import type { NextConfig } from "next";

const MAX_DIRECTORIES_TO_SEARCH = 6;

/**
 * Walks up from the web app directory to the repository-root .env.
 *
 * `next dev` runs with cwd at apps/web, which has no .env of its own. The API
 * already reads the root file. Searching upward keeps one file for both
 * processes. Real environment variables win: loadEnvFile does not override them.
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

const envFile = findEnvFile(process.cwd());
if (envFile) {
  loadEnvFile(envFile);
}

const nextConfig: NextConfig = {
  // This repo already has a root AGENTS.md. Next's generated copy would sit
  // beside it and get rewritten on every `next dev`.
  agentRules: false,
};

export default nextConfig;
