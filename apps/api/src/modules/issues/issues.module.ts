import { Module } from "@nestjs/common";
import { IssuesService } from "./issues.service";
import { IssuesController } from "./issues.controller";
import { OrganizationModule } from "../organizations/organizations.module";
import { QueueModule } from "@/infra/queue/queue.module";

@Module({
  providers: [IssuesService],
  controllers: [IssuesController],
  imports: [OrganizationModule, QueueModule],
  exports: [IssuesService],
})
export class IssuesModule {}
