import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IssuesService } from "./issues.service";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { OrganizationRequest, OrgMemberGuard } from "../organizations/org-member.guard";
import { PermissionGuard, RequirePermission } from "../organizations/permission.guard";
import { createIssuesSchema } from "./create-issue.schema";

@Controller("orgs/:orgId/projects/:projectId/issues")
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("create", "issue")
  async createIssue(
    @Req() request: OrganizationRequest,
    @Body() body: unknown,
    @Param("projectId") projectId: string,
  ) {
    const parsed = createIssuesSchema.safeParse(body);
    const { organizationId, role } = request;
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }

    const issueTitle = parsed.data.title;
    return this.issuesService.createIssue({
      organizationId,
      projectId,
      issueTitle,
      role,
    });
  }

  @Get()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("read", "issue")
  async getIssues(@Req() request: OrganizationRequest, @Param("projectId") projectId: string) {
    const { organizationId, role } = request;

    return this.issuesService.getIssues({ organizationId, projectId, role });
  }

  @Get(":issueId")
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("read", "issue")
  async getIssue(
    @Req() request: OrganizationRequest,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    const { organizationId, role } = request;

    return this.issuesService.getIssue({ organizationId, projectId, issueId, role });
  }

  @Patch(":issueId")
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("update", "issue")
  async updateIssue(
    @Req() request: OrganizationRequest,
    @Param("issueId") issueId: string,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    const parsed = createIssuesSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }

    const { organizationId, role } = request;
    const newTitle = parsed.data.title;
    return this.issuesService.updateIssue({ organizationId, projectId, role, issueId, newTitle });
  }

  @Delete(":issueId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("delete", "issue")
  async deleteIssue(
    @Req() request: OrganizationRequest,
    @Param("issueId") issueId: string,
    @Param("projectId") projectId: string,
  ) {
    const { organizationId, role } = request;
    return this.issuesService.deleteIssue({ issueId, projectId, organizationId, role });
  }
}
