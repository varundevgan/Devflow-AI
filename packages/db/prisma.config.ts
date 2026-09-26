import { defineConfig, env } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma 7+).
 *
 * In Prisma 7 the connection URL moved out of schema.prisma and into this file.
 * The CLI uses it for migrations and introspection; the application client gets
 * its connection separately through a driver adapter.
 *
 * Paths are resolved relative to this file, not the shell's working directory.
 *
 * DATABASE_URL is supplied by the package scripts via `dotenv -e ../../.env`,
 * which loads the repository-root .env. The env() helper throws when the
 * variable is missing, so a misconfigured CLI invocation fails immediately
 * rather than silently targeting the wrong database.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
