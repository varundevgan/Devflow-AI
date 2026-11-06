import { Role } from "@devflow/db";

export type ActionType = {
  organization: "read" | "update" | "delete";
  project: "read" | "update" | "delete" | "create";
};

export type ResourceType = {
  organization: "organization";
  project: "project";
};

const minPermissions: {
  [Resource in keyof ActionType]: Record<ActionType[Resource], Role>;
} = {
  organization: {
    read: Role.VIEWER,
    update: Role.ADMIN,
    delete: Role.OWNER,
  },
  project: {
    read: Role.VIEWER,
    update: Role.ADMIN,
    delete: Role.OWNER,
    create: Role.OWNER,
  },
};

const roleLevel: Record<Role, number> = {
  [Role.OWNER]: 4,
  [Role.ADMIN]: 3,
  [Role.DEVELOPER]: 2,
  [Role.VIEWER]: 1,
};

export function can<R extends keyof ActionType>(
  role: Role,
  action: ActionType[R],
  resource: R,
): boolean {
  const minRoleLevel = minPermissions[resource][action];

  return roleLevel[role] >= roleLevel[minRoleLevel];
}
