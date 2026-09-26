import { Controller, Get } from "@nestjs/common";

import { HealthService, type LivenessResult, type ReadinessResult } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness: is this process running and able to serve a request?
   * Deliberately checks no dependencies — a failing database means the process
   * is unhealthy, not dead, and restarting it would not help.
   */
  @Get()
  getLiveness(): LivenessResult {
    return this.healthService.getLiveness();
  }

  /**
   * Readiness: is this process able to serve traffic?
   * A failure here is 503 from the service. This method does not catch it.
   */
  @Get("ready")
  getReadiness(): Promise<ReadinessResult> {
    return this.healthService.getReadiness();
  }
}
