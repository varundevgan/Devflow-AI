import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { OrganizationRequest, OrgMemberGuard } from "../organizations/org-member.guard";
import { PermissionGuard, RequirePermission } from "../organizations/permission.guard";
import { ProjectsService } from "./projects.service";
import { createProjectSchema } from "./create-project.schema";

@Controller("orgs/:orgId/projects")
export class ProjectsController {
  constructor(private readonly projectService: ProjectsService) {}

  @Post()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("create", "project")
  async createProject(@Req() request: OrganizationRequest, @Body() body: unknown) {
    const parsed = createProjectSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }

    return this.projectService.createProject({
      ...parsed.data,
      organizationId: request.organizationId,
    });
  }

  @Get()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("read", "project")
  findAll(@Req() request: OrganizationRequest) {
    return this.projectService.findAll({
      organizationId: request.organizationId,
    });
  }

  @Get(":projectId")
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("read", "project")
  findOne(@Req() request: OrganizationRequest, @Param("projectId") projectId: string) {
    return this.projectService.findOne({
      organizationId: request.organizationId,
      projectId,
    });
  }
}
