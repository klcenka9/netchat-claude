import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { db } from '../db/client';
import type { AuthedSocket } from './index';
import { Permissions } from '../utils/permissions';
import { memberHasChannelPermission } from '../utils/permissionResolver';
import { getChannel } from '../models/channel.model';
import {
  createMessage,
  serializeMessage,
  getMessageRow,
  editMessage,
  softDeleteMessage,
  toggleReaction,
  setEmbed,
} from '../models/message.model';
import { parseMentions, storeMentions } from '../utils/mentions';
import { fetchEmbed } from '../utils/embedFetcher';
import { emitToChannel } from '../utils/realtime';

// Per-user, per-channel last-send timestamps for slowmode enforcement.
const lastSend = new Map<string, number>();

function isTimedOut(serverId: string, userId: string): boolean {
  const row = db
    .prepare('SELECT expires_at FROM timeouts WHERE server_id = ? AND user_id = ?')
    .get(serverId, userId) as { expires_at: number } | undefined;
  return !!row && row.expires_at > Math.floor(Date.now() / 1000);
}

const sendSchema = z.object({
  channelId: z.string(),
  content: z.string().max(4000).optional(),
  replyToId: z.string().optional(),
  attachmentIds: z
    .array(z.object({ url: z.string(), filename: z.string(), size_bytes: z.number(), mime_type: z.string() }))
    .optional(),
});

export function registerChatHandlers(io: SocketServer, socket: AuthedSocket): void {
  const userId = socket.userId;

  socket.on('channel:join', ({ channelId }: { channelId: string }) => {
    if (!channelId) return;
    if (memberHasChannelPermission(channelId, userId, Permissions.VIEW_CHANNELS)) {
      socket.join(`channel:${channelId}`);
    }
  });

  socket.on('channel:leave', ({ channelId }: { channelId: string }) => {
    socket.leave(`channel:${channelId}`);
  });

  socket.on('message:send', async (raw, ack?: (r: unknown) => void) => {
    const parsed = sendSchema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const { channelId, content, replyToId, attachmentIds } = parsed.data;
    if (!content && (!attachmentIds || attachmentIds.length === 0)) {
      return ack?.({ error: 'Empty message' });
    }
    const channel = getChannel(channelId);
    if (!channel) return ack?.({ error: 'No such channel' });

    if (!memberHasChannelPermission(channelId, userId, Permissions.SEND_MESSAGES)) {
      return ack?.({ error: 'Cannot send here' });
    }
    if (attachmentIds?.length && !memberHasChannelPermission(channelId, userId, Permissions.ATTACH_FILES)) {
      return ack?.({ error: 'Cannot attach files' });
    }
    if (isTimedOut(channel.server_id, userId)) {
      return ack?.({ error: 'You are timed out' });
    }

    // Slowmode (bypassed by MANAGE_MESSAGES holders).
    if (channel.slowmode_seconds > 0 && !memberHasChannelPermission(channelId, userId, Permissions.MANAGE_MESSAGES)) {
      const key = `${channelId}:${userId}`;
      const now = Date.now();
      const prev = lastSend.get(key) ?? 0;
      if (now - prev < channel.slowmode_seconds * 1000) {
        return ack?.({ error: 'Slowmode active', retryAfter: channel.slowmode_seconds });
      }
      lastSend.set(key, now);
    }

    const mentions = parseMentions(content ?? '', channel.server_id);
    // @everyone / @here gated by MENTION_EVERYONE.
    if (
      (mentions.everyone || mentions.here) &&
      !memberHasChannelPermission(channelId, userId, Permissions.MENTION_EVERYONE)
    ) {
      mentions.everyone = false;
      mentions.here = false;
    }

    const messageId = createMessage({
      channelId,
      authorId: userId,
      content: content ?? null,
      replyToId: replyToId ?? null,
      attachments: attachmentIds,
    });
    storeMentions(messageId, mentions);

    const serialized = serializeMessage(messageId);
    emitToChannel(channelId, 'message:new', serialized);
    ack?.({ ok: true, id: messageId });

    // Link embed fetched async; patched in once ready (if EMBED_LINKS allowed).
    if (content && memberHasChannelPermission(channelId, userId, Permissions.EMBED_LINKS)) {
      fetchEmbed(content)
        .then((embed) => {
          if (!embed) return;
          setEmbed(messageId, JSON.stringify(embed));
          emitToChannel(channelId, 'message:updated', serializeMessage(messageId));
        })
        .catch(() => undefined);
    }
  });

  socket.on('message:edit', (raw, ack?: (r: unknown) => void) => {
    const schema = z.object({ messageId: z.string(), content: z.string().max(4000) });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const row = getMessageRow(parsed.data.messageId);
    if (!row || row.deleted) return ack?.({ error: 'Not found' });
    if (row.author_id !== userId) return ack?.({ error: 'Not your message' });
    editMessage(parsed.data.messageId, parsed.data.content);
    emitToChannel(row.channel_id, 'message:updated', serializeMessage(parsed.data.messageId));
    ack?.({ ok: true });
  });

  socket.on('message:delete', (raw, ack?: (r: unknown) => void) => {
    const schema = z.object({ messageId: z.string() });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const row = getMessageRow(parsed.data.messageId);
    if (!row || row.deleted) return ack?.({ error: 'Not found' });
    const canManage = memberHasChannelPermission(row.channel_id, userId, Permissions.MANAGE_MESSAGES);
    if (row.author_id !== userId && !canManage) return ack?.({ error: 'Not allowed' });
    softDeleteMessage(parsed.data.messageId);
    emitToChannel(row.channel_id, 'message:deleted', {
      messageId: parsed.data.messageId,
      channelId: row.channel_id,
    });
    ack?.({ ok: true });
  });

  socket.on('message:react', (raw, ack?: (r: unknown) => void) => {
    const schema = z.object({ messageId: z.string(), emoji: z.string().max(64) });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const row = getMessageRow(parsed.data.messageId);
    if (!row || row.deleted) return ack?.({ error: 'Not found' });
    if (!memberHasChannelPermission(row.channel_id, userId, Permissions.ADD_REACTIONS)) {
      return ack?.({ error: 'Cannot react' });
    }
    const added = toggleReaction(parsed.data.messageId, userId, parsed.data.emoji);
    emitToChannel(row.channel_id, 'message:reaction', {
      messageId: parsed.data.messageId,
      emoji: parsed.data.emoji,
      userId,
      added,
    });
    ack?.({ ok: true, added });
  });

  socket.on('message:pin', (raw, ack?: (r: unknown) => void) => {
    const schema = z.object({ messageId: z.string(), pinned: z.boolean() });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const row = getMessageRow(parsed.data.messageId);
    if (!row) return ack?.({ error: 'Not found' });
    if (!memberHasChannelPermission(row.channel_id, userId, Permissions.MANAGE_MESSAGES)) {
      return ack?.({ error: 'Missing MANAGE_MESSAGES' });
    }
    db.prepare('UPDATE messages SET pinned = ? WHERE id = ?').run(
      parsed.data.pinned ? 1 : 0,
      parsed.data.messageId,
    );
    emitToChannel(row.channel_id, 'message:pin-updated', {
      messageId: parsed.data.messageId,
      pinned: parsed.data.pinned,
    });
    ack?.({ ok: true });
  });

  // Typing indicator, auto-expiring after 5s on the client side.
  socket.on('typing:start', ({ channelId }: { channelId: string }) => {
    if (!channelId) return;
    if (!memberHasChannelPermission(channelId, userId, Permissions.SEND_MESSAGES)) return;
    socket.to(`channel:${channelId}`).emit('typing:update', { channelId, userId, isTyping: true });
  });
}
