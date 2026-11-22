import { Module } from "@nestjs/common";

import { OrganizationModule } from "../organizations/organizations.module";
import { LabelsController } from "./labels.controller";
import { LabelsService } from "./labels.service";
import { IssuesModule } from "../issues/issues.module";
import { IssueLabelsController } from "./issue-labels.controller";

@Module({
  imports: [OrganizationModule, IssuesModule],
  providers: [LabelsService],
  controllers: [LabelsController, IssueLabelsController],
})
export class LabelsModule {}
