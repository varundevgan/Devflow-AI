import { z } from "zod";

/**
 * Every environment variable the API reads, declared once.
 *
 * Add a variable here only when code actually consumes it. A schema listing
 * variables nothing reads misleads whoever has to deploy this.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // coerce because process.env values are always strings.
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  DATABASE_URL: z.url(),

  ACCESS_TOKEN_SECRET: z.string().min(32),

  // The browser Origin header is scheme, host, and port. A path or query would
  // never match it, so reject those at boot instead of failing every request.
  CORS_ORIGIN: z.url().refine((value) => new URL(value).origin === value, {
    message: "must be an origin like http://localhost:3000, with no path, query, or userinfo",
  }),

  REDIS_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;
