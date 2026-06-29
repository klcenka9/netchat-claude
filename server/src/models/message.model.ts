import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';
import { renderMarkdown } from '../utils/markdown';
import { getMentions } from '../utils/mentions';
import { toPublicUser, User } from './user.model';

export interface CreateMessageParams {
  channelId: string;
  authorId?: string | null;
  webhookId?: string | null;
  content?: string | null;
  replyToId?: string | null;
  embedJson?: string | null;
  attachments?: { url: string; filename: string; size_bytes: number; mime_type: string }[];
}

export function createMessage(params: CreateMessageParams): string {
  const id = snowflake();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO messages (id, channel_id, author_id, webhook_id, content, embed_json, reply_to_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.channelId,
      params.authorId ?? null,
      params.webhookId ?? null,
      params.content ?? null,
      params.embedJson ?? null,
      params.replyToId ?? null,
    );
    if (params.attachments) {
      const stmt = db.prepare(
        'INSERT INTO message_attachments (id, message_id, url, filename, size_bytes, mime_type) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const a of params.attachments) {
        stmt.run(snowflake(), id, a.url, a.filename, a.size_bytes, a.mime_type);
      }
    }
  });
  tx();
  return id;
}

export function setEmbed(messageId: string, embedJson: string): void {
  db.prepare('UPDATE messages SET embed_json = ? WHERE id = ?').run(embedJson, messageId);
}

// Builds the full wire-format message object broadcast to clients.
export function serializeMessage(id: string): unknown {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
    | {
        id: string;
        channel_id: string;
        author_id: string | null;
        webhook_id: string | null;
        content: string | null;
        embed_json: string | null;
        reply_to_id: string | null;
        pinned: number;
        edited_at: number | null;
        deleted: number;
        created_at: number;
      }
    | undefined;
  if (!row) return null;

  const attachments = db
    .prepare('SELECT id, url, filename, size_bytes, mime_type FROM message_attachments WHERE message_id = ?')
    .all(id);

  const reactionRows = db
    .prepare('SELECT emoji, user_id FROM message_reactions WHERE message_id = ?')
    .all(id) as { emoji: string; user_id: string }[];
  const reactionMap = new Map<string, string[]>();
  for (const r of reactionRows) {
    if (!reactionMap.has(r.emoji)) reactionMap.set(r.emoji, []);
    reactionMap.get(r.emoji)!.push(r.user_id);
  }
  const reactions = [...reactionMap.entries()].map(([emoji, users]) => ({
    emoji,
    count: users.length,
    users,
  }));

  let author = null;
  let webhook = null;
  if (row.author_id) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(row.author_id) as User | undefined;
    if (u) author = toPublicUser(u);
  }
  if (row.webhook_id) {
    webhook = db
      .prepare('SELECT id, name, avatar_url FROM webhooks WHERE id = ?')
      .get(row.webhook_id);
  }

  let replyTo = null;
  if (row.reply_to_id) {
    const r = db
      .prepare('SELECT id, author_id, content FROM messages WHERE id = ?')
      .get(row.reply_to_id) as { id: string; author_id: string | null; content: string | null } | undefined;
    if (r) {
      const ru = r.author_id
        ? (db.prepare('SELECT * FROM users WHERE id = ?').get(r.author_id) as User | undefined)
        : undefined;
      replyTo = {
        id: r.id,
        content: r.content,
        author: ru ? toPublicUser(ru) : null,
      };
    }
  }

  return {
    id: row.id,
    channelId: row.channel_id,
    author,
    webhook,
    content: row.content,
    contentHtml: row.content ? renderMarkdown(row.content) : '',
    embed: row.embed_json ? JSON.parse(row.embed_json) : null,
    attachments,
    reactions,
    mentions: getMentions(id),
    replyTo,
    pinned: !!row.pinned,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

export function getMessageRow(id: string) {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
    | {
        id: string;
        channel_id: string;
        author_id: string | null;
        content: string | null;
        deleted: number;
        created_at: number;
      }
    | undefined;
}

export function editMessage(id: string, content: string): void {
  db.prepare('UPDATE messages SET content = ?, edited_at = unixepoch() WHERE id = ?').run(
    content,
    id,
  );
}

export function softDeleteMessage(id: string): void {
  // Clear content so FTS index drops it; keep row for reply integrity.
  db.prepare("UPDATE messages SET deleted = 1, content = NULL, embed_json = NULL WHERE id = ?").run(
    id,
  );
}

export function toggleReaction(messageId: string, userId: string, emoji: string): boolean {
  const existing = db
    .prepare('SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .get(messageId, userId, emoji);
  if (existing) {
    db.prepare(
      'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
    ).run(messageId, userId, emoji);
    return false;
  }
  db.prepare(
    'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
  ).run(messageId, userId, emoji);
  return true;
}
