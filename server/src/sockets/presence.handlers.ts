import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import type { AuthedSocket } from './index';
import { setUserStatus } from '../models/user.model';
import { broadcastPresence } from './index';

export function registerPresenceHandlers(io: SocketServer, socket: AuthedSocket): void {
  socket.on('presence:update', (raw) => {
    const schema = z.object({
      status: z.enum(['online', 'idle', 'dnd', 'invisible', 'offline']),
      customStatus: z.string().max(128).nullable().optional(),
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return;
    setUserStatus(
      socket.userId,
      parsed.data.status,
      parsed.data.customStatus === undefined ? undefined : parsed.data.customStatus,
    );
    broadcastPresence(io, socket.userId);
  });
}
