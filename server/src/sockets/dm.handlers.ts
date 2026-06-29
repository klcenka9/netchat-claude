import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { db } from '../db/client';
import type { AuthedSocket } from './index';
import {
  isParticipant,
  listParticipants,
  createDmMessage,
  serializeDmMessage,
} from '../models/dm.model';
import { eitherBlocked } from '../models/friendship.model';
import { emitToUser } from '../utils/realtime';

// DM messaging mirrors the message:* set, scoped to dmChannelId (spec §9).
export function registerDmHandlers(_io: SocketServer, socket: AuthedSocket): void {
  const userId = socket.userId;

  socket.on('dm:send', (raw, ack?: (r: unknown) => void) => {
    const schema = z.object({
      dmChannelId: z.string(),
      content: z.string().min(1).max(4000),
      replyToId: z.string().optional(),
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    if (!isParticipant(parsed.data.dmChannelId, userId)) return ack?.({ error: 'Not a participant' });

    const participants = listParticipants(parsed.data.dmChannelId);
    // In a 1:1 DM, block check prevents delivery.
    if (participants.length === 2) {
      const other = participants.find((p) => p !== userId);
      if (other && eitherBlocked(userId, other)) return ack?.({ error: 'Blocked' });
    }

    const id = createDmMessage({
      dmChannelId: parsed.data.dmChannelId,
      authorId: userId,
      content: parsed.data.content,
      replyToId: parsed.data.replyToId ?? null,
    });
    const serialized = serializeDmMessage(id);
    for (const p of participants) emitToUser(p, 'dm:new', serialized);
    ack?.({ ok: true, id });
  });

  socket.on('dm:edit', (raw, ack?: (r: unknown) => void) => {
    const schema = z.object({ messageId: z.string(), content: z.string().max(4000) });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const row = db.prepare('SELECT * FROM dm_messages WHERE id = ?').get(parsed.data.messageId) as
      | { id: string; dm_channel_id: string; author_id: string; deleted: number }
      | undefined;
    if (!row || row.deleted || row.author_id !== userId) return ack?.({ error: 'Not allowed' });
    db.prepare('UPDATE dm_messages SET content = ?, edited_at = unixepoch() WHERE id = ?').run(
      parsed.data.content,
      parsed.data.messageId,
    );
    const serialized = serializeDmMessage(parsed.data.messageId);
    for (const p of listParticipants(row.dm_channel_id)) emitToUser(p, 'dm:updated', serialized);
    ack?.({ ok: true });
  });

  socket.on('dm:delete', (raw, ack?: (r: unknown) => void) => {
    const schema = z.object({ messageId: z.string() });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const row = db.prepare('SELECT * FROM dm_messages WHERE id = ?').get(parsed.data.messageId) as
      | { id: string; dm_channel_id: string; author_id: string }
      | undefined;
    if (!row || row.author_id !== userId) return ack?.({ error: 'Not allowed' });
    db.prepare('UPDATE dm_messages SET deleted = 1, content = NULL WHERE id = ?').run(
      parsed.data.messageId,
    );
    for (const p of listParticipants(row.dm_channel_id)) {
      emitToUser(p, 'dm:deleted', { messageId: parsed.data.messageId, dmChannelId: row.dm_channel_id });
    }
    ack?.({ ok: true });
  });
}
