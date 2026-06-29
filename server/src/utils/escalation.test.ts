import { describe, it, expect } from 'vitest';
import { Permissions } from './permissions';
import type { MemberContext } from './permissionResolver';
import {
  canGrantPermissions,
  canGrantAddedPermissions,
  canActOnRolePosition,
  canManageRoles,
} from './escalation';

function ctx(partial: Partial<MemberContext>): MemberContext {
  return {
    isMember: true,
    isOwner: false,
    basePermissions: 0,
    roleIds: [],
    highestPosition: 1,
    ...partial,
  };
}

describe('canGrantPermissions', () => {
  it('owner can grant anything', () => {
    expect(canGrantPermissions(ctx({ isOwner: true }), Permissions.ADMINISTRATOR)).toBe(true);
  });
  it('non-owner can only grant bits they hold', () => {
    const actor = ctx({ basePermissions: Permissions.MANAGE_ROLES | Permissions.KICK_MEMBERS });
    expect(canGrantPermissions(actor, Permissions.KICK_MEMBERS)).toBe(true);
    expect(canGrantPermissions(actor, Permissions.BAN_MEMBERS)).toBe(false);
    expect(
      canGrantPermissions(actor, Permissions.KICK_MEMBERS | Permissions.BAN_MEMBERS),
    ).toBe(false);
  });
});

describe('canGrantAddedPermissions', () => {
  it('only checks newly added bits when editing a role', () => {
    // actor has KICK only. Role already has BAN (granted by someone higher).
    const actor = ctx({ basePermissions: Permissions.KICK_MEMBERS });
    const current = Permissions.BAN_MEMBERS;
    // Editing to add KICK (which actor has) on top of existing BAN is OK.
    expect(
      canGrantAddedPermissions(actor, current, Permissions.BAN_MEMBERS | Permissions.KICK_MEMBERS),
    ).toBe(true);
    // Editing to add MANAGE_SERVER (actor lacks) is rejected.
    expect(
      canGrantAddedPermissions(actor, current, Permissions.BAN_MEMBERS | Permissions.MANAGE_SERVER),
    ).toBe(false);
  });
  it('owner bypasses', () => {
    expect(canGrantAddedPermissions(ctx({ isOwner: true }), 0, Permissions.ADMINISTRATOR)).toBe(
      true,
    );
  });
});

describe('canActOnRolePosition', () => {
  it('non-owner must be strictly above the target role', () => {
    const actor = ctx({ highestPosition: 5 });
    expect(canActOnRolePosition(actor, 4)).toBe(true);
    expect(canActOnRolePosition(actor, 5)).toBe(false); // equal position is blocked
    expect(canActOnRolePosition(actor, 6)).toBe(false);
  });
  it('owner can act on any role', () => {
    expect(canActOnRolePosition(ctx({ isOwner: true, highestPosition: -1 }), 99)).toBe(true);
  });
});

describe('canManageRoles', () => {
  it('requires MANAGE_ROLES for non-owners', () => {
    expect(canManageRoles(ctx({ basePermissions: 0 }))).toBe(false);
    expect(canManageRoles(ctx({ basePermissions: Permissions.MANAGE_ROLES }))).toBe(true);
    expect(canManageRoles(ctx({ isOwner: true }))).toBe(true);
  });
});
