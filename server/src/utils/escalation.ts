import { Permissions } from './permissions';
import type { MemberContext } from './permissionResolver';

/**
 * Privilege-escalation guard helpers (spec security requirement). These mirror
 * the checks performed inline in routes/roles.routes.ts and are factored out so
 * they can be unit-tested in isolation. The owner bypasses every guard.
 */

// Can the actor grant exactly this permission bitfield from scratch (e.g. when
// creating a role)? They must already hold every bit they want to hand out.
export function canGrantPermissions(ctx: MemberContext, wanted: number): boolean {
  if (ctx.isOwner) return true;
  return (ctx.basePermissions & wanted) === wanted;
}

// Can the actor add the bits newly introduced relative to the role's current
// permissions (e.g. when editing a role)? Only the *added* bits are checked.
export function canGrantAddedPermissions(
  ctx: MemberContext,
  currentPermissions: number,
  nextPermissions: number,
): boolean {
  if (ctx.isOwner) return true;
  const added = nextPermissions & ~currentPermissions;
  return (ctx.basePermissions & added) === added;
}

// Can the actor act on (edit/delete/assign) a role at the given position? They
// must sit strictly above it in the hierarchy.
export function canActOnRolePosition(ctx: MemberContext, rolePosition: number): boolean {
  if (ctx.isOwner) return true;
  return rolePosition < ctx.highestPosition;
}

// Does the actor hold MANAGE_ROLES (or own the server)?
export function canManageRoles(ctx: MemberContext): boolean {
  if (ctx.isOwner) return true;
  return (ctx.basePermissions & Permissions.MANAGE_ROLES) === Permissions.MANAGE_ROLES;
}
