import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { setIo } from '../utils/realtime';
import { db } from '../db/client';
import { setUserStatus } from '../models/user.model';
import { registerChatHandlers } from './chat.handlers';
import { registerThreadHandlers } from './thread.handlers';
import { registerPresenceHandlers } from './presence.handlers';
import { registerFriendHandlers } from './friend.handlers';
import { registerVoiceHandlers } from './voice.handlers';
import { registerDmCallHandlers } from './dmCall.handlers';
import { registerDmHandlers } from './dm.handlers';

export interface AuthedSocket extends Socket {
  userId: string;
}

export function registerSockets(io: SocketServer): void {
  setIo(io);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('No auth token'));
    try {
      const payload = verifyAccessToken(token);
      (socket as AuthedSocket).userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const s = socket as AuthedSocket;
    const userId = s.userId;

    // Personal room (for DMs, friend events, call rings).
    socket.join(`user:${userId}`);

    // Auto-join every server the user belongs to.
    const servers = db
      .prepare('SELECT server_id FROM server_members WHERE user_id = ?')
      .all(userId) as { server_id: string }[];
    for (const { server_id } of servers) socket.join(`server:${server_id}`);

    // Mark online (unless invisible).
    const user = db.prepare('SELECT status FROM users WHERE id = ?').get(userId) as
      | { status: string }
      | undefined;
    if (user && user.status !== 'invisible') {
      setUserStatus(userId, user.status === 'offline' ? 'online' : user.status);
      broadcastPresence(io, userId);
    }

    registerChatHandlers(io, s);
    registerThreadHandlers(io, s);
    registerPresenceHandlers(io, s);
    registerFriendHandlers(io, s);
    registerVoiceHandlers(io, s);
    registerDmCallHandlers(io, s);
    registerDmHandlers(io, s);

    socket.on('disconnect', () => {
      // If no other sockets for this user remain, mark offline.
      const room = io.sockets.adapter.rooms.get(`user:${userId}`);
      if (!room || room.size === 0) {
        setUserStatus(userId, 'offline');
        broadcastPresence(io, userId);
      }
    });
  });
}

export function broadcastPresence(io: SocketServer, userId: string): void {
  const user = db.prepare('SELECT status, custom_status FROM users WHERE id = ?').get(userId) as
    | { status: string; custom_status: string | null }
    | undefined;
  if (!user) return;
  const shown = user.status === 'invisible' ? 'offline' : user.status;
  // Notify every server the user shares.
  const servers = db
    .prepare('SELECT server_id FROM server_members WHERE user_id = ?')
    .all(userId) as { server_id: string }[];
  for (const { server_id } of servers) {
    io.to(`server:${server_id}`).emit('presence:changed', {
      userId,
      status: shown,
      customStatus: user.custom_status,
    });
  }
  // Also notify friends directly.
  const friends = db
    .prepare(
      `SELECT CASE WHEN user_id_a = ? THEN user_id_b ELSE user_id_a END AS other
       FROM friendships WHERE (user_id_a = ? OR user_id_b = ?) AND status = 'accepted'`,
    )
    .all(userId, userId, userId) as { other: string }[];
  for (const { other } of friends) {
    io.to(`user:${other}`).emit('presence:changed', {
      userId,
      status: shown,
      customStatus: user.custom_status,
    });
  }
}
