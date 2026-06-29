import { db } from '../db/client';

export interface ParsedMentions {
  users: string[]; // user ids
  roles: string[]; // role ids
  everyone: boolean;
  here: boolean;
}

// Parses @everyone / @here / <@userId> / <@&roleId> style mentions, plus plain
// @username and @rolename resolved against the server. Returns ids for storage.
export function parseMentions(content: string, serverId: string | null): ParsedMentions {
  const result: ParsedMentions = { users: [], roles: [], everyone: false, here: false };
  if (!content) return result;

  if (/(^|\s)@everyone\b/.test(content)) result.everyone = true;
  if (/(^|\s)@here\b/.test(content)) result.here = true;

  // Explicit id mentions: <@123> users, <@&123> roles.
  for (const m of content.matchAll(/<@&(\d+)>/g)) result.roles.push(m[1]);
  for (const m of content.matchAll(/<@(\d+)>/g)) result.users.push(m[1]);

  // Plain @username — resolve against members of this server.
  if (serverId) {
    for (const m of content.matchAll(/(?:^|\s)@([a-zA-Z0-9_.]{2,32})/g)) {
      const name = m[1];
      if (name === 'everyone' || name === 'here') continue;
      const user = db
        .prepare(
          `SELECT u.id FROM users u JOIN server_members sm ON sm.user_id = u.id
           WHERE sm.server_id = ? AND u.username = ?`,
        )
        .get(serverId, name) as { id: string } | undefined;
      if (user) result.users.push(user.id);
      const role = db
        .prepare('SELECT id FROM roles WHERE server_id = ? AND name = ?')
        .get(serverId, name) as { id: string } | undefined;
      if (role) result.roles.push(role.id);
    }
  }

  result.users = [...new Set(result.users)];
  result.roles = [...new Set(result.roles)];
  return result;
}

export function storeMentions(messageId: string, mentions: ParsedMentions): void {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO message_mentions (message_id, mentioned_type, mentioned_id) VALUES (?, ?, ?)',
  );
  for (const u of mentions.users) stmt.run(messageId, 'user', u);
  for (const r of mentions.roles) stmt.run(messageId, 'role', r);
  if (mentions.everyone) stmt.run(messageId, 'everyone', null);
  if (mentions.here) stmt.run(messageId, 'here', null);
}

export function getMentions(messageId: string) {
  return db
    .prepare('SELECT mentioned_type, mentioned_id FROM message_mentions WHERE message_id = ?')
    .all(messageId) as { mentioned_type: string; mentioned_id: string | null }[];
}
