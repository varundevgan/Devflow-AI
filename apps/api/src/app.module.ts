import { Module } from "@nestjs/common";

import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./infra/prisma/prisma.module";

/**
 * Composition root. This module wires the application together and holds no
 * logic of its own; every capability arrives as an imported module.
 */
@Module({
  imports: [ConfigModule, HealthModule, PrismaModule],
})
export class AppModule {}
