import { Global, Module } from "@nestjs/common";

import { AppConfig } from "./app-config";
import { loadEnv } from "./load-env";

/**
 * Marked @Global so that every module can inject AppConfig without importing
 * this module. That deliberately weakens module encapsulation, which is only
 * acceptable for genuinely cross-cutting infrastructure — configuration,
 * logging, database access. Domain modules must never be global.
 *
 * The factory runs during application bootstrap, so invalid configuration
 * rejects NestFactory.create() and the process exits before it listens.
 */
@Global()
@Module({
  providers: [
    {
      provide: AppConfig,
      useFactory: (): AppConfig => new AppConfig(loadEnv()),
    },
  ],
  exports: [AppConfig],
})
export class ConfigModule {}
