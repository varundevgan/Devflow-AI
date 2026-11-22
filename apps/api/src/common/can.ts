import { Role } from "@devflow/db";

export type ActionType = {
  organization: "read" | "update" | "delete";
  project: "read" | "update" | "delete" | "create";
  issue: "create" | "read" | "update" | "delete";
  comment: "create" | "read" | "delete" | "update";
  label: "create" | "read" | "apply" | "remove" | "update" | "delete";
};

export type ResourceType = {
  organization: "organization";
  project: "project";
  issue: "issue";
  comment: "comment";
  label: "label";
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
  issue: {
    create: Role.DEVELOPER,
    read: Role.VIEWER,
    update: Role.DEVELOPER,
    delete: Role.DEVELOPER,
  },
  comment: {
    create: Role.VIEWER,
    read: Role.VIEWER,
    delete: Role.VIEWER,
    update: Role.VIEWER,
  },
  label: {
    create: Role.DEVELOPER,
    read: Role.VIEWER,
    apply: Role.DEVELOPER,
    remove: Role.DEVELOPER,
    update: Role.DEVELOPER,
    delete: Role.ADMIN,
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
