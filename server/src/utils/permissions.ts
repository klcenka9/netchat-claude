export const Permissions = {
  VIEW_CHANNELS: 1 << 0,
  MANAGE_CHANNELS: 1 << 1,
  MANAGE_ROLES: 1 << 2,
  MANAGE_EMOJIS: 1 << 3,
  MANAGE_WEBHOOKS: 1 << 4,
  VIEW_AUDIT_LOG: 1 << 5,
  MANAGE_SERVER: 1 << 6,
  CREATE_INVITE: 1 << 7,
  CHANGE_NICKNAME: 1 << 8,
  MANAGE_NICKNAMES: 1 << 9,
  KICK_MEMBERS: 1 << 10,
  BAN_MEMBERS: 1 << 11,
  MODERATE_MEMBERS: 1 << 12, // timeout
  SEND_MESSAGES: 1 << 13,
  CREATE_THREADS: 1 << 14,
  EMBED_LINKS: 1 << 15,
  ATTACH_FILES: 1 << 16,
  ADD_REACTIONS: 1 << 17,
  USE_EXTERNAL_EMOJIS: 1 << 18,
  MENTION_EVERYONE: 1 << 19,
  MANAGE_MESSAGES: 1 << 20,
  READ_MESSAGE_HISTORY: 1 << 21,
  CONNECT_VOICE: 1 << 22,
  SPEAK: 1 << 23,
  VIDEO: 1 << 24, // camera + screen share
  MUTE_MEMBERS: 1 << 25,
  DEAFEN_MEMBERS: 1 << 26,
  MOVE_MEMBERS: 1 << 27,
  ADMINISTRATOR: 1 << 28, // bypasses every other check, including channel overwrites
} as const;

export type PermissionName = keyof typeof Permissions;

// Default @everyone permissions per spec §7.
export const EVERYONE_DEFAULT_PERMISSIONS =
  Permissions.VIEW_CHANNELS |
  Permissions.SEND_MESSAGES |
  Permissions.CREATE_INVITE |
  Permissions.CREATE_THREADS |
  Permissions.EMBED_LINKS |
  Permissions.ATTACH_FILES |
  Permissions.ADD_REACTIONS |
  Permissions.READ_MESSAGE_HISTORY |
  Permissions.CONNECT_VOICE |
  Permissions.SPEAK |
  Permissions.CHANGE_NICKNAME;

export function hasServerPermission(memberBitfield: number, perm: number): boolean {
  if (memberBitfield & Permissions.ADMINISTRATOR) return true;
  return (memberBitfield & perm) === perm;
}

/**
 * Discord's actual resolution order for a permission inside a specific channel:
 *   1. base = OR of all role permission bitfields the member has (incl. @everyone)
 *   2. if base has ADMINISTRATOR -> true, full stop, overwrites never apply
 *   3. apply @everyone channel overwrite:      base = (base & ~everyoneDeny) | everyoneAllow
 *   4. apply other-roles channel overwrites:   base = (base & ~rolesDeny)    | rolesAllow
 *   5. apply member-specific channel overwrite: base = (base & ~memberDeny)  | memberAllow
 *   final = (base & perm) === perm
 */
export function resolveChannelPermission(
  perm: number,
  baseRolePermissions: number,
  everyoneOverwrite: { allow: number; deny: number } | null,
  roleOverwrites: { allow: number; deny: number }[],
  memberOverwrite: { allow: number; deny: number } | null,
): boolean {
  if (baseRolePermissions & Permissions.ADMINISTRATOR) return true;
  let result = baseRolePermissions;
  if (everyoneOverwrite) {
    result = (result & ~everyoneOverwrite.deny) | everyoneOverwrite.allow;
  }
  const rolesAllow = roleOverwrites.reduce((acc, o) => acc | o.allow, 0);
  const rolesDeny = roleOverwrites.reduce((acc, o) => acc | o.deny, 0);
  result = (result & ~rolesDeny) | rolesAllow;
  if (memberOverwrite) {
    result = (result & ~memberOverwrite.deny) | memberOverwrite.allow;
  }
  return (result & perm) === perm;
}
