import { Module } from "@nestjs/common";
import { IssuesService } from "./issues.service";
import { IssuesController } from "./issues.controller";
import { OrganizationModule } from "../organizations/organizations.module";

@Module({
  providers: [IssuesService],
  controllers: [IssuesController],
  imports: [OrganizationModule],
})
export class IssuesModule {}
