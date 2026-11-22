import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { CommentsService } from "./comments.service";
import { OrganizationRequest, OrgMemberGuard } from "../organizations/org-member.guard";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { PermissionGuard, RequirePermission } from "../organizations/permission.guard";
import { createCommentsSchema } from "./create-comment.schema";

@Controller("orgs/:orgId/projects/:projectId/issues/:issueId/comments")
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("create", "comment")
  async createComment(
    @Req() request: OrganizationRequest,
    @Body() body: unknown,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    const { organizationId, role, userId } = request;
    const parsed = createCommentsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }
    const commentBody = parsed.data.body;
    return this.commentsService.createComment({
      organizationId,
      role,
      userId,
      projectId,
      issueId,
      commentBody,
    });
  }

  @Get()
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("read", "comment")
  async getComments(
    @Req() request: OrganizationRequest,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    const { organizationId, role } = request;
    return this.commentsService.getComments({ issueId, organizationId, projectId, role });
  }

  @Delete(":commentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("delete", "comment")
  async deleteComment(
    @Req() request: OrganizationRequest,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Param("commentId") commentId: string,
  ) {
    const { organizationId, role, userId } = request;
    return this.commentsService.deleteComment({
      issueId,
      userId,
      organizationId,
      projectId,
      role,
      commentId,
    });
  }

  @Patch(":commentId")
  @UseGuards(AccessTokenGuard, OrgMemberGuard, PermissionGuard)
  @RequirePermission("update", "comment")
  async updateComment(
    @Req() request: OrganizationRequest,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Param("commentId") commentId: string,
    @Body() body: unknown,
  ) {
    const { organizationId, role, userId } = request;
    const parsed = createCommentsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
        }),
      );
    }

    const commentBody = parsed.data.body;

    return this.commentsService.updateComment({
      commentBody,
      issueId,
      organizationId,
      projectId,
      role,
      userId,
      commentId,
    });
  }
}
