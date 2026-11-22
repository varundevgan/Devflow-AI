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

import { LabelsService } from "./labels.service";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { OrganizationRequest, OrgMemberGuard } from "../organizations/org-member.guard";
import { PermissionGuard, RequirePermission } from "../organizations/permission.guard";
import { createLabelSchema } from "./create-label.schema";

@Controller("orgs/:orgId/labels")
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("create", "label")
  async createLabel(@Req() request: OrganizationRequest, @Body() body: unknown) {
    const { organizationId, role } = request;
    const parsed = createLabelSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }

    const name = parsed.data.name;
    return this.labelsService.createLabel({ name, organizationId, role });
  }

  @Get()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("read", "label")
  async getLabels(@Req() request: OrganizationRequest) {
    const { organizationId, role } = request;
    return this.labelsService.getLabels({ organizationId, role });
  }

  @Patch(":labelId")
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("update", "label")
  async updateLabel(
    @Req() request: OrganizationRequest,
    @Param("labelId") labelId: string,
    @Body() body: unknown,
  ) {
    const { organizationId, role } = request;
    const parsed = createLabelSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }
    const name = parsed.data.name;
    return this.labelsService.updateLabel({ organizationId, role, name, labelId });
  }

  @Delete(":labelId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("delete", "label")
  async deleteLabel(@Req() request: OrganizationRequest, @Param("labelId") labelId: string) {
    const { organizationId, role } = request;
    await this.labelsService.deleteLabel({ organizationId, role, labelId });
  }
}
