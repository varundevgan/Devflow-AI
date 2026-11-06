import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard, type AuthenticatedRequest } from "../auth/access-token.guard";
import { createOrganizationSchema } from "./create-organization.schema";
import { type CreatedOrganization, OrganizationService } from "./organizations.service";
import { OrganizationRequest, OrgMemberGuard } from "./org-member.guard";
import { Role } from "@devflow/db";
import { PermissionGuard, RequirePermission } from "./permission.guard";

export interface UserOrganization {
  organizationId: string;
  role: Role;
}

@UseGuards(AccessTokenGuard)
@Controller("orgs")
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<CreatedOrganization> {
    const parsed = createOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }

    return this.organizationService.createOrganization({
      userId: request.userId,
      name: parsed.data.name,
    });
  }

  @UseGuards(OrgMemberGuard, PermissionGuard)
  @RequirePermission("read", "organization")
  @Get(":orgId")
  async organization(@Req() request: OrganizationRequest): Promise<UserOrganization> {
    const { organizationId, role } = request;

    return {
      organizationId,
      role,
    };
  }

  @UseGuards(OrgMemberGuard, PermissionGuard)
  @RequirePermission("delete", "organization")
  @Delete(":orgId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOrganization(@Req() request: OrganizationRequest): Promise<void> {
    const { organizationId } = request;

    await this.organizationService.deleteOrganization({
      organizationId,
    });
  }
}
