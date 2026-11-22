import { Module } from "@nestjs/common";
import { IssuesModule } from "../issues/issues.module";
import { CommentsService } from "./comments.service";
import { CommentsController } from "./comments.controller";
import { OrganizationModule } from "../organizations/organizations.module";

@Module({
  imports: [IssuesModule, OrganizationModule],
  providers: [CommentsService],
  controllers: [CommentsController],
})
export class CommentsModule {}
