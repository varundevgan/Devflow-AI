import type { Env } from "./env.schema";

/**
 * Validated configuration, exposed to the application.
 *
 * This is a class rather than a plain object for two reasons. It serves as its
 * own dependency-injection token, so consumers write `constructor(private
 * readonly config: AppConfig)` with no string keys to mistype. And it translates
 * SCREAMING_SNAKE environment names into idiomatic properties, keeping shell
 * conventions out of application code.
 */
export class AppConfig {
  readonly nodeEnv: Env["NODE_ENV"];
  readonly port: number;
  readonly databaseUrl: string;

  constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.port = env.API_PORT;
    this.databaseUrl = env.DATABASE_URL;

    // Configuration is read-only for the process lifetime. Freezing turns an
    // accidental write into an immediate error instead of a confusing one later.
    Object.freeze(this);
  }

  get isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  get isTest(): boolean {
    return this.nodeEnv === "test";
  }
}
