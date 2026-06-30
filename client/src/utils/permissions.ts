// Mirror of server/src/utils/permissions.ts — keep bit values in sync.
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
  MODERATE_MEMBERS: 1 << 12,
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
  VIDEO: 1 << 24,
  MUTE_MEMBERS: 1 << 25,
  DEAFEN_MEMBERS: 1 << 26,
  MOVE_MEMBERS: 1 << 27,
  ADMINISTRATOR: 1 << 28,
} as const;

export type PermissionName = keyof typeof Permissions;

// Order matters only for display; grouped roughly like the server file.
export const PERMISSION_NAMES = Object.keys(Permissions) as PermissionName[];

export const PERMISSION_LABELS: Record<PermissionName, string> = {
  VIEW_CHANNELS: 'View Channels',
  MANAGE_CHANNELS: 'Manage Channels',
  MANAGE_ROLES: 'Manage Roles',
  MANAGE_EMOJIS: 'Manage Emojis',
  MANAGE_WEBHOOKS: 'Manage Webhooks',
  VIEW_AUDIT_LOG: 'View Audit Log',
  MANAGE_SERVER: 'Manage Server',
  CREATE_INVITE: 'Create Invite',
  CHANGE_NICKNAME: 'Change Nickname',
  MANAGE_NICKNAMES: 'Manage Nicknames',
  KICK_MEMBERS: 'Kick Members',
  BAN_MEMBERS: 'Ban Members',
  MODERATE_MEMBERS: 'Timeout Members',
  SEND_MESSAGES: 'Send Messages',
  CREATE_THREADS: 'Create Threads',
  EMBED_LINKS: 'Embed Links',
  ATTACH_FILES: 'Attach Files',
  ADD_REACTIONS: 'Add Reactions',
  USE_EXTERNAL_EMOJIS: 'Use External Emojis',
  MENTION_EVERYONE: 'Mention @everyone',
  MANAGE_MESSAGES: 'Manage Messages',
  READ_MESSAGE_HISTORY: 'Read Message History',
  CONNECT_VOICE: 'Connect to Voice',
  SPEAK: 'Speak',
  VIDEO: 'Video / Screen Share',
  MUTE_MEMBERS: 'Mute Members',
  DEAFEN_MEMBERS: 'Deafen Members',
  MOVE_MEMBERS: 'Move Members',
  ADMINISTRATOR: 'Administrator',
};

export function hasPermission(bitfield: number, perm: number): boolean {
  if (bitfield & Permissions.ADMINISTRATOR) return true;
  return (bitfield & perm) === perm;
}
