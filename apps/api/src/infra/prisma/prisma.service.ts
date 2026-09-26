import { AppConfig } from "@/config/app-config";
import { PrismaClient } from "@devflow/db";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(appConfig: AppConfig) {
    const adapter = new PrismaPg({
      connectionString: appConfig.databaseUrl,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
