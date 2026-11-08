import { can } from "@/common/can";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { Role } from "@devflow/db";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

export interface CreateIssueProps {
  organizationId: string;
  projectId: string;
  issueTitle: string;
  role: Role;
}

export interface IssueProps {
  organizationId: string;
  projectId: string;
  role: Role;
}

export interface GetIssueProps {
  organizationId: string;
  projectId: string;
  issueId: string;
  role: Role;
}

export type UpdateIssueProps = GetIssueProps & { newTitle: string };

export type DeleteIssueProps = GetIssueProps;

@Injectable()
export class IssuesService {
  constructor(private readonly prisma: PrismaService) {}

  async createIssue(input: CreateIssueProps) {
    const { issueTitle, organizationId, projectId, role } = input;
    const canUser = can(role, "create", "issue");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    const issue = await this.prisma.$transaction(async (tx) => {
      const projectDetails = await tx.project.updateManyAndReturn({
        where: {
          id: projectId,
          organizationId,
          deletedAt: null,
        },
        data: {
          issueCounter: {
            increment: 1,
          },
        },
        select: {
          issueCounter: true,
        },
      });
      const project = projectDetails[0];
      if (!project) throw new NotFoundException("Not found");

      const { issueCounter } = project;

      return await tx.issue.create({
        data: {
          number: issueCounter,
          title: issueTitle,
          organizationId,
          projectId,
        },
      });
    });

    return issue;
  }

  async getIssues(input: IssueProps) {
    const { organizationId, projectId, role } = input;

    const canUser = can(role, "read", "issue");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (project === null) {
      throw new NotFoundException("Not found");
    }

    return await this.prisma.issue.findMany({
      where: {
        organizationId,
        projectId,
      },
      orderBy: {
        number: "desc",
      },
      take: 100,
    });
  }

  async getIssue(input: GetIssueProps) {
    const { organizationId, projectId, issueId, role } = input;
    const canUser = can(role, "read", "issue");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    const issue = await this.prisma.issue.findFirst({
      where: {
        id: issueId,
        projectId,
        organizationId,
        project: {
          deletedAt: null,
          organizationId,
        },
      },
    });

    if (issue === null) {
      throw new NotFoundException("Not found");
    }

    return issue;
  }

  async updateIssue(input: UpdateIssueProps) {
    const { issueId, organizationId, projectId, role, newTitle } = input;

    const canUser = can(role, "update", "issue");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    const issues = await this.prisma.issue.updateManyAndReturn({
      data: {
        title: newTitle,
      },
      where: {
        id: issueId,
        projectId,
        organizationId,
        project: {
          deletedAt: null,
          organizationId,
        },
      },
    });

    const issue = issues[0];
    if (issue === undefined) {
      throw new NotFoundException("Not found");
    }

    return issue;
  }

  async deleteIssue(input: DeleteIssueProps) {
    const { organizationId, projectId, role, issueId } = input;
    const canUser = can(role, "delete", "issue");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    const issue = await this.prisma.issue.deleteMany({
      where: {
        id: issueId,
        projectId,
        organizationId,
        project: {
          deletedAt: null,
          organizationId,
        },
      },
    });

    if (issue.count === 0) throw new NotFoundException("Not found");
  }
}
