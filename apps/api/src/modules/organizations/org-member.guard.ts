import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { MembershipService } from "./membership.service";
import { AuthenticatedRequest } from "../auth/access-token.guard";
import { Role } from "@devflow/db";

export type OrganizationRequest = AuthenticatedRequest & {
  organizationId: string;
  role: Role;
};

@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(private readonly membership: MembershipService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();
    const { userId } = request;
    const organizationId = request?.params?.orgId;

    if (typeof organizationId !== "string" || !organizationId || organizationId.length <= 0) {
      throw new NotFoundException("Not found");
    }

    const { organizationId: userOrgId, role } = await this.membership.requireMembership({
      userId,
      organizationId,
    });

    request.organizationId = userOrgId;
    request.role = role;
    return true;
  }
}
