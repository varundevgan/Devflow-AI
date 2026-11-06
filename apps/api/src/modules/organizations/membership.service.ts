import { Role } from "@devflow/db";

import { PrismaService } from "@/infra/prisma/prisma.service";
import { Injectable, NotFoundException } from "@nestjs/common";

export interface RequireMembershipParams {
  userId: string;
  organizationId: string;
}

export interface VerifiedMembership {
  organizationId: string;
  role: Role;
}

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMembership(input: RequireMembershipParams): Promise<VerifiedMembership> {
    const { userId, organizationId } = input;
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          userId,
          organizationId,
        },
      },
      select: {
        role: true,
      },
    });

    if (membership === null) {
      throw new NotFoundException("Not found");
    }

    return {
      organizationId,
      role: membership.role,
    };
  }
}
