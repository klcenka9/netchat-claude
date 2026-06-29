import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import type { AuthedSocket } from './index';
import { isParticipant, listParticipants } from '../models/dm.model';
import { emitToUser } from '../utils/realtime';

// In-memory DM call rosters: dmChannelId -> Set<userId in call>.
const callRosters = new Map<string, Set<string>>();
function callRoster(dmId: string): Set<string> {
  if (!callRosters.has(dmId)) callRosters.set(dmId, new Set());
  return callRosters.get(dmId)!;
}

const RING_TIMEOUT_MS = 30_000;

export function registerDmCallHandlers(io: SocketServer, socket: AuthedSocket): void {
  const userId = socket.userId;
  const inCalls = new Set<string>();

  socket.on('dm:call-invite', ({ dmChannelId }: { dmChannelId: string }, ack?: (r: unknown) => void) => {
    if (!isParticipant(dmChannelId, userId)) return ack?.({ error: 'Not a participant' });
    const roster = callRoster(dmChannelId);
    roster.add(userId);
    inCalls.add(dmChannelId);
    socket.join(`dmcall:${dmChannelId}`);
    // Ring every other participant on their personal room (any device/tab).
    for (const p of listParticipants(dmChannelId)) {
      if (p !== userId) emitToUser(p, 'dm:call-incoming', { dmChannelId, fromUserId: userId });
    }
    // Auto-cancel if nobody accepts within 30s and the caller is still alone.
    setTimeout(() => {
      if (callRoster(dmChannelId).size <= 1) {
        callRosters.delete(dmChannelId);
        for (const p of listParticipants(dmChannelId)) {
          emitToUser(p, 'dm:call-ended', { dmChannelId });
        }
      }
    }, RING_TIMEOUT_MS);
    ack?.({ ok: true, roster: [...roster] });
  });

  socket.on('dm:call-accept', ({ dmChannelId }: { dmChannelId: string }, ack?: (r: unknown) => void) => {
    if (!isParticipant(dmChannelId, userId)) return ack?.({ error: 'Not a participant' });
    const roster = callRoster(dmChannelId);
    const existing = [...roster];
    roster.add(userId);
    inCalls.add(dmChannelId);
    socket.join(`dmcall:${dmChannelId}`);
    io.to(`dmcall:${dmChannelId}`).emit('dm:call-accepted', { dmChannelId, userId });
    ack?.({ ok: true, roster: existing });
  });

  socket.on('dm:call-decline', ({ dmChannelId }: { dmChannelId: string }) => {
    for (const p of listParticipants(dmChannelId)) {
      emitToUser(p, 'dm:call-declined', { dmChannelId, userId });
    }
    // 1:1 decline ends the invite entirely.
    if (listParticipants(dmChannelId).length === 2) {
      callRosters.delete(dmChannelId);
    }
  });

  socket.on('dm:call-leave', ({ dmChannelId }: { dmChannelId: string }) => {
    leave(dmChannelId);
  });

  function leave(dmChannelId: string) {
    if (!inCalls.has(dmChannelId)) return;
    callRoster(dmChannelId).delete(userId);
    inCalls.delete(dmChannelId);
    socket.leave(`dmcall:${dmChannelId}`);
    io.to(`dmcall:${dmChannelId}`).emit('dm:call-user-left', { dmChannelId, userId });
    if (callRoster(dmChannelId).size === 0) {
      callRosters.delete(dmChannelId);
      for (const p of listParticipants(dmChannelId)) emitToUser(p, 'dm:call-ended', { dmChannelId });
    }
  }

  socket.on('dm:call-signal', (raw) => {
    const schema = z.object({ dmChannelId: z.string(), targetUserId: z.string(), signal: z.unknown() });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return;
    emitToUser(parsed.data.targetUserId, 'dm:call-signal', {
      dmChannelId: parsed.data.dmChannelId,
      fromUserId: userId,
      signal: parsed.data.signal,
    });
  });

  socket.on('dm:call-mute-update', (raw) => {
    const schema = z.object({ dmChannelId: z.string(), muted: z.boolean(), deafened: z.boolean() });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return;
    io.to(`dmcall:${parsed.data.dmChannelId}`).emit('dm:call-state-update', {
      dmChannelId: parsed.data.dmChannelId,
      userId,
      muted: parsed.data.muted,
      deafened: parsed.data.deafened,
      speaking: false,
    });
  });

  socket.on('disconnect', () => {
    for (const dmChannelId of inCalls) {
      callRoster(dmChannelId).delete(userId);
      io.to(`dmcall:${dmChannelId}`).emit('dm:call-user-left', { dmChannelId, userId });
      if (callRoster(dmChannelId).size === 0) callRosters.delete(dmChannelId);
    }
  });
}
