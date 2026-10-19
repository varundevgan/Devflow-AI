import { Module } from "@nestjs/common";

import { OrganizationController } from "./organizations.controller";
import { OrganizationService } from "./organizations.service";

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService],
})
export class OrganizationModule {}
