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
});

export type Env = z.infer<typeof envSchema>;
