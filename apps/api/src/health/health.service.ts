import { PrismaService } from "@/infra/prisma/prisma.service";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

export interface LivenessResult {
  status: "ok";
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessResult {
  status: "ok";
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  getLiveness(): LivenessResult {
    return {
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: can this process reach its dependencies?
   * SELECT 1 touches no table. The query succeeding is the check.
   * The rows are not the response, and the database error is not the body.
   */
  async getReadiness(): Promise<ReadinessResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch (error: unknown) {
      this.logger.error("Readiness check failed", error instanceof Error ? error.stack : error);
      throw new ServiceUnavailableException("Database is unavailable");
    }
  }
}
