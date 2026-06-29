import { db } from '../db/client';
import { Permissions, resolveChannelPermission, hasServerPermission } from './permissions';

export interface MemberContext {
  isMember: boolean;
  isOwner: boolean;
  basePermissions: number; // OR of all role bitfields (incl. @everyone)
  roleIds: string[];
  highestPosition: number; // highest role position the member holds (owner => Infinity)
}

// Loads a member's base server permission context.
export function getMemberContext(serverId: string, userId: string): MemberContext {
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId) as
    | { owner_id: string }
    | undefined;
  const membership = db
    .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(serverId, userId);

  if (!server || !membership) {
    return { isMember: false, isOwner: false, basePermissions: 0, roleIds: [], highestPosition: -1 };
  }

  const isOwner = server.owner_id === userId;

  // @everyone (default) role always applies.
  const everyone = db
    .prepare('SELECT id, permissions, position FROM roles WHERE server_id = ? AND is_default = 1')
    .get(serverId) as { id: string; permissions: number; position: number } | undefined;

  const assigned = db
    .prepare(
      `SELECT r.id, r.permissions, r.position
       FROM member_roles mr JOIN roles r ON r.id = mr.role_id
       WHERE mr.server_id = ? AND mr.user_id = ?`,
    )
    .all(serverId, userId) as { id: string; permissions: number; position: number }[];

  const all = everyone ? [everyone, ...assigned] : assigned;
  let base = 0;
  let highest = -1;
  const roleIds: string[] = [];
  for (const r of all) {
    base |= r.permissions;
    roleIds.push(r.id);
    if (r.position > highest) highest = r.position;
  }
  if (isOwner) base |= Permissions.ADMINISTRATOR;

  return {
    isMember: true,
    isOwner,
    basePermissions: base,
    roleIds,
    highestPosition: isOwner ? Number.MAX_SAFE_INTEGER : highest,
  };
}

// Does the member have a server-wide permission?
export function memberHasServerPermission(
  serverId: string,
  userId: string,
  perm: number,
): boolean {
  const ctx = getMemberContext(serverId, userId);
  if (!ctx.isMember) return false;
  return hasServerPermission(ctx.basePermissions, perm);
}

// Resolve a permission inside a specific channel, applying overwrites (spec §7).
export function memberHasChannelPermission(
  channelId: string,
  userId: string,
  perm: number,
): boolean {
  const channel = db
    .prepare('SELECT server_id FROM channels WHERE id = ?')
    .get(channelId) as { server_id: string } | undefined;
  if (!channel) return false;
  const ctx = getMemberContext(channel.server_id, userId);
  if (!ctx.isMember) return false;

  const overwrites = db
    .prepare('SELECT target_type, target_id, allow, deny FROM channel_permission_overwrites WHERE channel_id = ?')
    .all(channelId) as { target_type: string; target_id: string; allow: number; deny: number }[];

  const everyoneRole = db
    .prepare('SELECT id FROM roles WHERE server_id = ? AND is_default = 1')
    .get(channel.server_id) as { id: string } | undefined;

  let everyoneOverwrite: { allow: number; deny: number } | null = null;
  const roleOverwrites: { allow: number; deny: number }[] = [];
  let memberOverwrite: { allow: number; deny: number } | null = null;

  for (const o of overwrites) {
    if (o.target_type === 'role' && everyoneRole && o.target_id === everyoneRole.id) {
      everyoneOverwrite = { allow: o.allow, deny: o.deny };
    } else if (o.target_type === 'role' && ctx.roleIds.includes(o.target_id)) {
      roleOverwrites.push({ allow: o.allow, deny: o.deny });
    } else if (o.target_type === 'member' && o.target_id === userId) {
      memberOverwrite = { allow: o.allow, deny: o.deny };
    }
  }

  return resolveChannelPermission(
    perm,
    ctx.basePermissions,
    everyoneOverwrite,
    roleOverwrites,
    memberOverwrite,
  );
}
