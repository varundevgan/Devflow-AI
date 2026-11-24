import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "@/infra/prisma/prisma.service";
import { Prisma, Role } from "@devflow/db";
import { can } from "@/common/can";
import { IssuesService } from "../issues/issues.service";

export type CreateLabelInput = {
  organizationId: string;
  name: string;
  role: Role;
};

export type GetLabelsInput = Omit<CreateLabelInput, "name">;

export type ApplyLabelInput = {
  organizationId: string;
  issueId: string;
  projectId: string;
  role: Role;
  labelId: string;
};

export type GetIssueLabelsInput = Omit<ApplyLabelInput, "labelId">;

export type UpdateLabelInput = {
  name: string;
  organizationId: string;
  role: Role;
  labelId: string;
};

export type DeleteLabelInput = Omit<UpdateLabelInput, "name">;

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issueService: IssuesService,
  ) {}

  async createLabel(input: CreateLabelInput) {
    const { name, organizationId, role } = input;
    const canUser = can(role, "create", "label");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    try {
      return await this.prisma.label.create({
        data: {
          name,
          organizationId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A label with this name already exists in this organization");
      }

      throw error;
    }
  }

  async getLabels(input: GetLabelsInput) {
    const { organizationId, role } = input;
    const canUser = can(role, "read", "label");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    return await this.prisma.label.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        name: "asc",
      },
      take: 100,
    });
  }

  async applyLabel(input: ApplyLabelInput) {
    const { issueId, organizationId, projectId, role, labelId } = input;

    const canUser = can(role, "apply", "label");
    if (!canUser) {
      throw new ForbiddenException("User is not allowed to perform this action");
    }

    await this.issueService.getIssue({
      issueId,
      organizationId,
      projectId,
      role,
    });

    const label = await this.prisma.label.findFirst({
      where: {
        id: labelId,
        organizationId,
      },
    });

    if (!label) throw new NotFoundException("Not found");

    try {
      return await this.prisma.issueLabel.create({
        data: {
          issueId,
          labelId,
          organizationId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This label is already attached to the issue");
      }

      throw error;
    }
  }

  async getIssueLabels(input: GetIssueLabelsInput) {
    const { issueId, organizationId, projectId, role } = input;

    const canUser = can(role, "read", "label");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    await this.issueService.getIssue({ issueId, organizationId, projectId, role });

    const issueLabels = await this.prisma.issueLabel.findMany({
      where: {
        issueId,
        organizationId,
      },
      select: {
        label: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        label: {
          name: "asc",
        },
      },
      take: 100,
    });

    return issueLabels.map((issueLabel) => issueLabel.label);
  }

  async detachLabel(input: ApplyLabelInput) {
    const { issueId, organizationId, projectId, role, labelId } = input;

    const canUser = can(role, "remove", "label");
    if (!canUser) {
      throw new ForbiddenException("User is not allowed to perform this action");
    }

    await this.issueService.getIssue({
      issueId,
      organizationId,
      projectId,
      role,
    });

    await this.prisma.issueLabel.deleteMany({
      where: {
        issueId,
        labelId,
        organizationId,
      },
    });
  }

  async updateLabel(input: UpdateLabelInput) {
    const { role, labelId, organizationId, name } = input;

    const canUser = can(role, "update", "label");
    if (!canUser) {
      throw new ForbiddenException("User is not allowed to perform this action");
    }

    try {
      const update = await this.prisma.label.updateManyAndReturn({
        where: {
          id: labelId,
          organizationId,
        },
        data: {
          name,
        },
      });

      if (update.length === 0) throw new NotFoundException("Not found");

      return update[0];
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A label with this name already exists in this organization");
      }

      throw error;
    }
  }

  async deleteLabel(input: DeleteLabelInput) {
    const { role, labelId, organizationId } = input;

    const canUser = can(role, "delete", "label");
    if (!canUser) {
      throw new ForbiddenException("User is not allowed to perform this action");
    }

    const removed = await this.prisma.label.deleteMany({
      where: {
        id: labelId,
        organizationId,
      },
    });

    if (removed.count === 0) throw new NotFoundException("Not found");
  }
}
