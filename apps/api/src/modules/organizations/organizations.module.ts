import { Module } from "@nestjs/common";

import { OrganizationController } from "./organizations.controller";
import { OrganizationService } from "./organizations.service";
import { MembershipService } from "./membership.service";
import { OrgMemberGuard } from "./org-member.guard";
import { PermissionGuard } from "./permission.guard";

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService, MembershipService, OrgMemberGuard, PermissionGuard],
  exports: [MembershipService, OrgMemberGuard, PermissionGuard],
})
export class OrganizationModule {}
