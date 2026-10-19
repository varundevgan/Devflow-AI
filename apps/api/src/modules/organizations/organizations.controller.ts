import { BadRequestException, Body, Controller, Post, Req, UseGuards } from "@nestjs/common";

import { AccessTokenGuard, type AuthenticatedRequest } from "../auth/access-token.guard";
import { createOrganizationSchema } from "./create-organization.schema";
import { type CreatedOrganization, OrganizationService } from "./organizations.service";

@Controller("orgs")
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @UseGuards(AccessTokenGuard)
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
}
