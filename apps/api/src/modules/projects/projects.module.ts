import { Module } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { OrganizationModule } from "../organizations/organizations.module";
import { ProjectsController } from "./projects.controller";

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  imports: [OrganizationModule],
})
export class ProjectsModule {}
