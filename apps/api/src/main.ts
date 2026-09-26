import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { AppConfig } from "./config/app-config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // app.get() is the imperative escape hatch out of the DI container. It belongs
  // here because bootstrap is not a class and has no constructor to inject into;
  // anywhere else, ask for AppConfig in a constructor instead.
  const config = app.get(AppConfig);

  app.enableShutdownHooks();
  await app.listen(config.port);

  console.warn(`API listening on http://localhost:${config.port} [${config.nodeEnv}]`);
}

// A failure here means the process cannot serve traffic. Exiting with a non-zero
// code lets Docker, PM2 or a supervisor notice and restart, instead of leaving a
// silently dead process behind an unhandled rejection warning.
bootstrap().catch((error: unknown) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
