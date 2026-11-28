import { AppConfig } from "@/config/app-config";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(appConfig: AppConfig) {
    this.connection = new IORedis(appConfig.redisUrl, {
      // One reconnect, then the enqueue fails and create can return.
      maxRetriesPerRequest: 1,
    });
    // ioredis emits connection failures as events. With no listener, Node
    // treats that as an unhandled error and exits. enqueueIssueCreated still
    // rejects, and the caller decides whether the request fails.
    this.connection.on("error", () => undefined);

    this.queue = new Queue("domain-events", {
      connection: this.connection,
      skipWaitingForReady: true,
    });
  }

  async enqueueIssueCreated(input: { issueId: string; organizationId: string }): Promise<void> {
    const { issueId, organizationId } = input;

    await this.queue.add("issue.created", { issueId, organizationId }, { jobId: issueId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
