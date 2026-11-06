import { Role } from "@devflow/db";

import { ActionType, can, ResourceType } from "@/common/can";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { type AuthenticatedRequest } from "../auth/access-token.guard";

type Permission<R extends keyof ActionType> = {
  action: ActionType[R];
  resource: R;
};

type AnyPermission = {
  [R in keyof ActionType]: Permission<R>;
}[keyof ActionType];

type PermissionRequest = AuthenticatedRequest & {
  role?: Role;
};

const PERMISSION_KEY = "permission";

export function RequirePermission<R extends keyof ActionType>(action: ActionType[R], resource: R) {
  return SetMetadata(PERMISSION_KEY, { action, resource });
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<AnyPermission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<PermissionRequest>();

    if (permission?.action === undefined || permission.resource === undefined) {
      throw new Error("Permission metadata is missing");
    }

    if (request.role === undefined) {
      throw new Error("Role is missing in request");
    }

    const allowed = can(request.role, permission.action, permission.resource);

    if (!allowed) {
      throw new ForbiddenException();
    }
    return true;
  }
}
