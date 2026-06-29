import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import type { AuthedSocket } from './index';
import { getUserById } from '../models/user.model';
import {
  getFriendship,
  createRequest,
  acceptRequest,
  removeFriendship,
  eitherBlocked,
} from '../models/friendship.model';
import { emitToUser } from '../utils/realtime';

// Socket mirror of the REST friend endpoints (spec §9). REST remains the source
// of truth; these provide a low-latency path and real-time fan-out.
export function registerFriendHandlers(_io: SocketServer, socket: AuthedSocket): void {
  const userId = socket.userId;
  const idSchema = z.object({ userId: z.string() });

  socket.on('friend:request', (raw, ack?: (r: unknown) => void) => {
    const parsed = idSchema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const target = parsed.data.userId;
    if (target === userId || !getUserById(target)) return ack?.({ error: 'Bad target' });
    if (eitherBlocked(userId, target)) return ack?.({ error: 'Blocked' });
    if (getFriendship(userId, target)) return ack?.({ error: 'Already exists' });
    createRequest(userId, target);
    emitToUser(target, 'friend:request-received', { userId });
    ack?.({ ok: true });
  });

  socket.on('friend:accept', (raw, ack?: (r: unknown) => void) => {
    const parsed = idSchema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    const target = parsed.data.userId;
    const fr = getFriendship(userId, target);
    if (!fr || fr.status !== 'pending' || fr.requested_by === userId) {
      return ack?.({ error: 'No incoming request' });
    }
    acceptRequest(userId, target);
    emitToUser(target, 'friend:request-accepted', { userId });
    ack?.({ ok: true });
  });

  socket.on('friend:remove', (raw, ack?: (r: unknown) => void) => {
    const parsed = idSchema.safeParse(raw);
    if (!parsed.success) return ack?.({ error: 'Invalid payload' });
    removeFriendship(userId, parsed.data.userId);
    emitToUser(parsed.data.userId, 'friend:removed', { userId });
    ack?.({ ok: true });
  });
}
