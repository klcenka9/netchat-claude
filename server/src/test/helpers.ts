import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';

// Wipe every table between tests so each test starts from a clean slate while
// sharing the file-scoped singleton DB. Order doesn't matter with FKs off here;
// we disable them for the truncate then re-enable.
const TABLES = [
  'message_reactions',
  'message_mentions',
  'message_attachments',
  'messages_fts',
  'messages',
  'dm_messages',
  'dm_participants',
  'dm_channels',
  'channel_permission_overwrites',
  'webhooks',
  'channels',
  'categories',
  'member_roles',
  'roles',
  'server_members',
  'servers',
  'blocks',
  'friendships',
  'refresh_tokens',
  'password_reset_tokens',
  'read_states',
  'audit_log',
  'notification_settings',
  'invites',
  'bans',
  'timeouts',
  'custom_emojis',
  'users',
];

export function resetDb(): void {
  db.pragma('foreign_keys = OFF');
  for (const t of TABLES) {
    try {
      db.prepare(`DELETE FROM ${t}`).run();
    } catch {
      // table may not exist in some schema versions; ignore
    }
  }
  db.pragma('foreign_keys = ON');
}

let counter = 0;
export function makeUser(username?: string): { id: string; username: string } {
  const id = snowflake();
  const uname = username ?? `user${counter++}_${id.slice(-4)}`;
  db.prepare(
    'INSERT INTO users (id, username, display_name, email, password_hash) VALUES (?, ?, ?, ?, ?)',
  ).run(id, uname, uname, `${uname}@example.com`, 'x');
  return { id, username: uname };
}
