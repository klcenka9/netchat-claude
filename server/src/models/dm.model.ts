import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';
import { renderMarkdown } from '../utils/markdown';
import { toPublicUser, User } from './user.model';

export function isParticipant(dmChannelId: string, userId: string): boolean {
  return !!db
    .prepare('SELECT 1 FROM dm_participants WHERE dm_channel_id = ? AND user_id = ?')
    .get(dmChannelId, userId);
}

export function listParticipants(dmChannelId: string): string[] {
  return (
    db.prepare('SELECT user_id FROM dm_participants WHERE dm_channel_id = ?').all(dmChannelId) as {
      user_id: string;
    }[]
  ).map((r) => r.user_id);
}

// Find or create a 1:1 DM between exactly two users.
export function openDirectDm(a: string, b: string): string {
  const existing = db
    .prepare(
      `SELECT d.id FROM dm_channels d
       WHERE d.is_group = 0
         AND (SELECT COUNT(*) FROM dm_participants p WHERE p.dm_channel_id = d.id) = 2
         AND EXISTS (SELECT 1 FROM dm_participants p WHERE p.dm_channel_id = d.id AND p.user_id = ?)
         AND EXISTS (SELECT 1 FROM dm_participants p WHERE p.dm_channel_id = d.id AND p.user_id = ?)`,
    )
    .get(a, b) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = snowflake();
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO dm_channels (id, is_group) VALUES (?, 0)').run(id);
    db.prepare('INSERT INTO dm_participants (dm_channel_id, user_id) VALUES (?, ?)').run(id, a);
    db.prepare('INSERT INTO dm_participants (dm_channel_id, user_id) VALUES (?, ?)').run(id, b);
  });
  tx();
  return id;
}

export function createGroupDm(creator: string, userIds: string[], name?: string): string {
  const id = snowflake();
  const all = [...new Set([creator, ...userIds])];
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO dm_channels (id, is_group, name) VALUES (?, 1, ?)').run(
      id,
      name ?? null,
    );
    const stmt = db.prepare('INSERT INTO dm_participants (dm_channel_id, user_id) VALUES (?, ?)');
    for (const u of all) stmt.run(id, u);
  });
  tx();
  return id;
}

export function getDmChannel(id: string) {
  return db.prepare('SELECT * FROM dm_channels WHERE id = ?').get(id) as
    | { id: string; is_group: number; name: string | null; created_at: number }
    | undefined;
}

export function listDmsForUser(userId: string) {
  const channels = db
    .prepare(
      `SELECT d.* FROM dm_channels d
       JOIN dm_participants p ON p.dm_channel_id = d.id
       WHERE p.user_id = ? ORDER BY d.id DESC`,
    )
    .all(userId) as { id: string; is_group: number; name: string | null }[];
  return channels.map((c) => ({
    ...c,
    participants: listParticipants(c.id).map((uid) => {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as User | undefined;
      return u ? toPublicUser(u) : null;
    }),
  }));
}

export function createDmMessage(params: {
  dmChannelId: string;
  authorId: string;
  content?: string | null;
  replyToId?: string | null;
  embedJson?: string | null;
}): string {
  const id = snowflake();
  db.prepare(
    `INSERT INTO dm_messages (id, dm_channel_id, author_id, content, embed_json, reply_to_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.dmChannelId,
    params.authorId,
    params.content ?? null,
    params.embedJson ?? null,
    params.replyToId ?? null,
  );
  return id;
}

export function serializeDmMessage(id: string): unknown {
  const row = db.prepare('SELECT * FROM dm_messages WHERE id = ?').get(id) as
    | {
        id: string;
        dm_channel_id: string;
        author_id: string;
        content: string | null;
        embed_json: string | null;
        reply_to_id: string | null;
        edited_at: number | null;
        deleted: number;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(row.author_id) as User | undefined;
  return {
    id: row.id,
    dmChannelId: row.dm_channel_id,
    author: u ? toPublicUser(u) : null,
    content: row.content,
    contentHtml: row.content ? renderMarkdown(row.content) : '',
    embed: row.embed_json ? JSON.parse(row.embed_json) : null,
    replyToId: row.reply_to_id,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}
