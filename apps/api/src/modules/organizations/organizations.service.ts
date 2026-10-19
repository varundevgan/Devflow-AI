import { Role } from "@devflow/db";

import { PrismaService } from "@/infra/prisma/prisma.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ORGANIZATION_NAME_MAX_LENGTH } from "./create-organization.schema";

export interface CreateOrganizationInput {
  userId: string;
  name: string;
}

export interface CreatedOrganization {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  role: Role;
}

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrganization(input: CreateOrganizationInput): Promise<CreatedOrganization> {
    const name = input.name.trim();
    if (name.length === 0 || name.length > ORGANIZATION_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `Name must be between 1 and ${ORGANIZATION_NAME_MAX_LENGTH} characters`,
      );
    }

    const organization = await this.prisma.organization.create({
      data: {
        name,
        organizationMembers: {
          create: {
            userId: input.userId,
            role: Role.OWNER,
          },
        },
      },
      include: {
        organizationMembers: {
          select: { role: true },
        },
      },
    });

    const membership = organization.organizationMembers[0];
    if (membership === undefined) {
      throw new Error("Organization was created without an owner membership");
    }

    return {
      id: organization.id,
      name: organization.name,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      role: membership.role,
    };
  }
}
