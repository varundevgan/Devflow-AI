import { can } from "@/common/can";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { Role } from "@devflow/db";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { IssuesService } from "../issues/issues.service";

export type CreateCommentProps = {
  role: Role;
  organizationId: string;
  projectId: string;
  issueId: string;
  commentBody: string;
  userId: string;
};

export type GetCommentProps = Omit<CreateCommentProps, "commentBody" | "userId">;

export type DeleteCommentProps = Omit<CreateCommentProps, "commentBody"> & { commentId: string };

export type UpdateCommentProps = CreateCommentProps & { commentId: string };

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issuesService: IssuesService,
  ) {}

  async createComment(input: CreateCommentProps) {
    const { role, issueId, organizationId, projectId, userId, commentBody } = input;

    const canUser = can(role, "create", "comment");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    await this.issuesService.getIssue({ organizationId, projectId, issueId, role });

    return await this.prisma.comment.create({
      data: {
        body: commentBody,
        authorId: userId,
        issueId,
        organizationId,
      },
    });
  }

  async getComments(input: GetCommentProps) {
    const { role, issueId, organizationId, projectId } = input;

    const canUser = can(role, "read", "comment");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    await this.issuesService.getIssue({ organizationId, projectId, issueId, role });

    return await this.prisma.comment.findMany({
      where: {
        issueId,
        organizationId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 100,
    });
  }

  async deleteComment(input: DeleteCommentProps) {
    const { issueId, organizationId, projectId, role, userId, commentId } = input;
    const canUser = can(role, "delete", "comment");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    await this.issuesService.getIssue({ issueId, organizationId, projectId, role });

    const comment = await this.prisma.comment.findFirst({
      where: {
        id: commentId,
        issueId,
        organizationId,
      },
    });

    if (!comment) throw new NotFoundException("Not found");

    if (comment.authorId !== userId)
      throw new ForbiddenException("You cannot delete someone else's comment");

    await this.prisma.comment.updateMany({
      data: {
        deletedAt: new Date(),
      },
      where: {
        id: commentId,
        authorId: userId,
        deletedAt: null,
        issueId,
        organizationId,
      },
    });
  }

  async updateComment(input: UpdateCommentProps) {
    const { commentBody, issueId, organizationId, projectId, role, userId, commentId } = input;

    const canUser = can(role, "update", "comment");
    if (!canUser) throw new ForbiddenException("User is not allowed to perform this action");

    await this.issuesService.getIssue({ issueId, organizationId, projectId, role });

    const comment = await this.prisma.comment.findFirst({
      where: {
        id: commentId,
        issueId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!comment) throw new NotFoundException("Not found");

    if (comment.authorId !== userId)
      throw new ForbiddenException("User is not allowed to perform this action");

    const updateComment = await this.prisma.comment.updateManyAndReturn({
      data: {
        body: commentBody,
      },
      where: {
        id: commentId,
        issueId,
        authorId: userId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!updateComment[0]) throw new NotFoundException("Not found");

    return updateComment[0];
  }
}
