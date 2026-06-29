import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, makeUser } from '../test/helpers';
import { createServer, addMember } from '../models/server.model';
import { createRole, assignRole, getRole } from '../models/role.model';
import { getChannel, listChannels } from '../models/channel.model';
import { db } from '../db/client';
import { Permissions, EVERYONE_DEFAULT_PERMISSIONS } from './permissions';
import {
  getMemberContext,
  memberHasServerPermission,
  memberHasChannelPermission,
} from './permissionResolver';

function everyoneRoleId(serverId: string): string {
  return (
    db.prepare('SELECT id FROM roles WHERE server_id = ? AND is_default = 1').get(serverId) as {
      id: string;
    }
  ).id;
}

function textChannel(serverId: string): string {
  return listChannels(serverId).find((c) => c.type === 'text')!.id;
}

describe('getMemberContext', () => {
  beforeEach(() => resetDb());

  it('owner gets ADMINISTRATOR and infinite position', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'S');
    const ctx = getMemberContext(server.id, owner.id);
    expect(ctx.isMember).toBe(true);
    expect(ctx.isOwner).toBe(true);
    expect(ctx.basePermissions & Permissions.ADMINISTRATOR).toBeTruthy();
    expect(ctx.highestPosition).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('a plain member inherits @everyone base permissions only', () => {
    const owner = makeUser();
    const member = makeUser();
    const server = createServer(owner.id, 'S');
    addMember(server.id, member.id);
    const ctx = getMemberContext(server.id, member.id);
    expect(ctx.isMember).toBe(true);
    expect(ctx.isOwner).toBe(false);
    expect(ctx.basePermissions).toBe(EVERYONE_DEFAULT_PERMISSIONS);
    expect(ctx.basePermissions & Permissions.ADMINISTRATOR).toBeFalsy();
  });

  it('returns non-member context for outsiders', () => {
    const owner = makeUser();
    const outsider = makeUser();
    const server = createServer(owner.id, 'S');
    const ctx = getMemberContext(server.id, outsider.id);
    expect(ctx.isMember).toBe(false);
    expect(ctx.highestPosition).toBe(-1);
  });

  it('ORs assigned role permissions and tracks highest position', () => {
    const owner = makeUser();
    const member = makeUser();
    const server = createServer(owner.id, 'S');
    addMember(server.id, member.id);
    const role = createRole(server.id, { name: 'Mod', permissions: Permissions.KICK_MEMBERS });
    assignRole(server.id, member.id, role.id);
    const ctx = getMemberContext(server.id, member.id);
    expect(ctx.basePermissions & Permissions.KICK_MEMBERS).toBeTruthy();
    expect(ctx.highestPosition).toBe(getRole(role.id)!.position);
    expect(ctx.roleIds).toContain(role.id);
  });
});

describe('memberHasServerPermission', () => {
  beforeEach(() => resetDb());

  it('owner has every permission', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'S');
    expect(memberHasServerPermission(server.id, owner.id, Permissions.BAN_MEMBERS)).toBe(true);
  });

  it('member lacking the bit is denied', () => {
    const owner = makeUser();
    const member = makeUser();
    const server = createServer(owner.id, 'S');
    addMember(server.id, member.id);
    expect(memberHasServerPermission(server.id, member.id, Permissions.BAN_MEMBERS)).toBe(false);
    // but @everyone grants SEND_MESSAGES by default
    expect(memberHasServerPermission(server.id, member.id, Permissions.SEND_MESSAGES)).toBe(true);
  });
});

describe('memberHasChannelPermission overwrites (spec §7)', () => {
  beforeEach(() => resetDb());

  function denyEveryone(channelId: string, serverId: string, deny: number) {
    db.prepare(
      `INSERT INTO channel_permission_overwrites (channel_id, target_type, target_id, allow, deny)
       VALUES (?, 'role', ?, 0, ?)`,
    ).run(channelId, everyoneRoleId(serverId), deny);
  }

  it('deny VIEW_CHANNELS to @everyone hides the channel', () => {
    const owner = makeUser();
    const member = makeUser();
    const server = createServer(owner.id, 'S');
    addMember(server.id, member.id);
    const ch = textChannel(server.id);
    denyEveryone(ch, server.id, Permissions.VIEW_CHANNELS);
    expect(memberHasChannelPermission(ch, member.id, Permissions.VIEW_CHANNELS)).toBe(false);
    // owner (ADMINISTRATOR) still sees it
    expect(memberHasChannelPermission(ch, owner.id, Permissions.VIEW_CHANNELS)).toBe(true);
  });

  it('member overwrite re-grants a channel denied to @everyone', () => {
    const owner = makeUser();
    const member = makeUser();
    const server = createServer(owner.id, 'S');
    addMember(server.id, member.id);
    const ch = textChannel(server.id);
    denyEveryone(ch, server.id, Permissions.VIEW_CHANNELS);
    db.prepare(
      `INSERT INTO channel_permission_overwrites (channel_id, target_type, target_id, allow, deny)
       VALUES (?, 'member', ?, ?, 0)`,
    ).run(ch, member.id, Permissions.VIEW_CHANNELS);
    expect(memberHasChannelPermission(ch, member.id, Permissions.VIEW_CHANNELS)).toBe(true);
  });

  it('role overwrite allow beats @everyone deny', () => {
    const owner = makeUser();
    const member = makeUser();
    const server = createServer(owner.id, 'S');
    addMember(server.id, member.id);
    const ch = textChannel(server.id);
    denyEveryone(ch, server.id, Permissions.VIEW_CHANNELS);
    const role = createRole(server.id, { name: 'Insiders', permissions: 0 });
    assignRole(server.id, member.id, role.id);
    db.prepare(
      `INSERT INTO channel_permission_overwrites (channel_id, target_type, target_id, allow, deny)
       VALUES (?, 'role', ?, ?, 0)`,
    ).run(ch, role.id, Permissions.VIEW_CHANNELS);
    expect(memberHasChannelPermission(ch, member.id, Permissions.VIEW_CHANNELS)).toBe(true);
  });

  it('member-specific deny is applied last and wins over a role allow', () => {
    const owner = makeUser();
    const member = makeUser();
    const server = createServer(owner.id, 'S');
    addMember(server.id, member.id);
    const ch = textChannel(server.id);
    const role = createRole(server.id, { name: 'Talkers', permissions: 0 });
    assignRole(server.id, member.id, role.id);
    db.prepare(
      `INSERT INTO channel_permission_overwrites (channel_id, target_type, target_id, allow, deny)
       VALUES (?, 'role', ?, ?, 0)`,
    ).run(ch, role.id, Permissions.SEND_MESSAGES);
    db.prepare(
      `INSERT INTO channel_permission_overwrites (channel_id, target_type, target_id, allow, deny)
       VALUES (?, 'member', ?, 0, ?)`,
    ).run(ch, member.id, Permissions.SEND_MESSAGES);
    expect(memberHasChannelPermission(ch, member.id, Permissions.SEND_MESSAGES)).toBe(false);
  });

  it('returns false for unknown channel and non-members', () => {
    const owner = makeUser();
    const outsider = makeUser();
    const server = createServer(owner.id, 'S');
    const ch = textChannel(server.id);
    expect(memberHasChannelPermission('999', owner.id, Permissions.VIEW_CHANNELS)).toBe(false);
    expect(memberHasChannelPermission(ch, outsider.id, Permissions.VIEW_CHANNELS)).toBe(false);
  });

  it('voice channel exists from bootstrap and getChannel resolves it', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'S');
    const voice = listChannels(server.id).find((c) => c.type === 'voice')!;
    expect(getChannel(voice.id)!.type).toBe('voice');
  });
});
