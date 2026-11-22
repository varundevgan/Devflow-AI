import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import { OrganizationRequest, OrgMemberGuard } from "../organizations/org-member.guard";
import { PermissionGuard, RequirePermission } from "../organizations/permission.guard";
import { applyLabelSchema } from "./apply-label.schema";
import { LabelsService } from "./labels.service";

@Controller("orgs/:orgId/projects/:projectId/issues/:issueId/labels")
export class IssueLabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("apply", "label")
  async applyLabel(
    @Req() request: OrganizationRequest,
    @Body() body: unknown,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    const parsed = applyLabelSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }

    const { organizationId, role } = request;
    const labelId = parsed.data.labelId;
    return this.labelsService.applyLabel({ organizationId, projectId, issueId, role, labelId });
  }

  @Get()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("read", "label")
  async getIssueLabels(
    @Req() request: OrganizationRequest,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    const { organizationId, role } = request;

    return this.labelsService.getIssueLabels({ organizationId, role, projectId, issueId });
  }

  @Delete(":labelId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("remove", "label")
  async detachLabel(
    @Req() request: OrganizationRequest,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Param("labelId") labelId: string,
  ) {
    const { organizationId, role } = request;
    await this.labelsService.detachLabel({
      organizationId,
      projectId,
      issueId,
      role,
      labelId,
    });
  }
}
