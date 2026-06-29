import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import type { AuthedSocket } from './index';
import { Permissions } from '../utils/permissions';
import { memberHasChannelPermission } from '../utils/permissionResolver';
import { getChannel, createChannel } from '../models/channel.model';
import { createMessage, serializeMessage } from '../models/message.model';
import { parseMentions, storeMentions } from '../utils/mentions';
import { emitToServer, emitToChannel } from '../utils/realtime';

export function registerThreadHandlers(_io: SocketServer, socket: AuthedSocket): void {
  const userId = socket.userId;

  socket.on('thread:create', (raw, ack?: (r: unknown) => void) => {
    const schema = z.object({
      channelId: z.string(),
      sourceMessageId: z.string(),
      name: z.string().min(1).max(100),
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const parent = getChannel(parsed.data.channelId);
    if (!parent || parent.type !== 'text') return ack?.({ error: 'Bad parent channel' });
    if (!memberHasChannelPermission(parent.id, userId, Permissions.CREATE_THREADS)) {
      return ack?.({ error: 'Cannot create threads' });
    }
    const thread = createChannel({
      serverId: parent.server_id,
      name: parsed.data.name,
      type: 'thread',
      categoryId: parent.category_id,
      parentChannelId: parent.id,
    });
    emitToServer(parent.server_id, 'thread:created', thread);
    ack?.({ ok: true, thread });
  });

  // Identical handling to message:send, scoped to a thread channel id.
  socket.on('thread:message:send', (raw, ack?: (r: unknown) => void) => {
    const schema = z.object({
      channelId: z.string(),
      content: z.string().max(4000),
      replyToId: z.string().optional(),
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const thread = getChannel(parsed.data.channelId);
    if (!thread || thread.type !== 'thread') return ack?.({ error: 'Not a thread' });
    if (!memberHasChannelPermission(thread.id, userId, Permissions.SEND_MESSAGES)) {
      return ack?.({ error: 'Cannot send' });
    }
    const mentions = parseMentions(parsed.data.content, thread.server_id);
    const messageId = createMessage({
      channelId: thread.id,
      authorId: userId,
      content: parsed.data.content,
      replyToId: parsed.data.replyToId ?? null,
    });
    storeMentions(messageId, mentions);
    emitToChannel(thread.id, 'message:new', serializeMessage(messageId));
    ack?.({ ok: true, id: messageId });
  });
}
