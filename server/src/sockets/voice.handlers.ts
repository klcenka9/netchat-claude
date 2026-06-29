import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import type { AuthedSocket } from './index';
import { Permissions } from '../utils/permissions';
import { memberHasChannelPermission } from '../utils/permissionResolver';
import { emitToChannel } from '../utils/realtime';

// In-memory voice rosters: channelId -> Map<userId, {muted, deafened}>.
type VoiceState = { muted: boolean; deafened: boolean };
const rosters = new Map<string, Map<string, VoiceState>>();

function roster(channelId: string): Map<string, VoiceState> {
  if (!rosters.has(channelId)) rosters.set(channelId, new Map());
  return rosters.get(channelId)!;
}

export function getRoster(channelId: string) {
  return [...roster(channelId).entries()].map(([userId, state]) => ({ userId, ...state }));
}

export function registerVoiceHandlers(io: SocketServer, socket: AuthedSocket): void {
  const userId = socket.userId;
  const joined = new Set<string>();

  socket.on('voice:join', ({ channelId }: { channelId: string }, ack?: (r: unknown) => void) => {
    if (!channelId) return ack?.({ error: 'No channel' });
    if (!memberHasChannelPermission(channelId, userId, Permissions.CONNECT_VOICE)) {
      return ack?.({ error: 'Cannot connect' });
    }
    const r = roster(channelId);
    // Reply with current roster so the joiner can build peer connections.
    const existing = getRoster(channelId);
    r.set(userId, { muted: false, deafened: false });
    joined.add(channelId);
    socket.join(`voice:${channelId}`);
    socket.to(`voice:${channelId}`).emit('voice:user-joined', { channelId, userId });
    emitToChannel(channelId, 'voice:state-update', {
      channelId,
      userId,
      muted: false,
      deafened: false,
      speaking: false,
    });
    ack?.({ ok: true, roster: existing });
  });

  socket.on('voice:leave', ({ channelId }: { channelId: string }) => {
    leave(channelId);
  });

  function leave(channelId: string) {
    if (!joined.has(channelId)) return;
    roster(channelId).delete(userId);
    joined.delete(channelId);
    socket.leave(`voice:${channelId}`);
    io.to(`voice:${channelId}`).emit('voice:user-left', { channelId, userId });
  }

  // Relay WebRTC SDP/ICE verbatim to the targeted peer's personal room.
  socket.on('voice:signal', (raw) => {
    const schema = z.object({ targetUserId: z.string(), signal: z.unknown(), channelId: z.string().optional() });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return;
    io.to(`user:${parsed.data.targetUserId}`).emit('voice:signal', {
      fromUserId: userId,
      signal: parsed.data.signal,
    });
  });

  socket.on('voice:mute-update', (raw) => {
    const schema = z.object({ channelId: z.string(), muted: z.boolean(), deafened: z.boolean() });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return;
    const state = roster(parsed.data.channelId).get(userId);
    if (state) {
      state.muted = parsed.data.muted;
      state.deafened = parsed.data.deafened;
    }
    io.to(`voice:${parsed.data.channelId}`).emit('voice:state-update', {
      channelId: parsed.data.channelId,
      userId,
      muted: parsed.data.muted,
      deafened: parsed.data.deafened,
      speaking: false,
    });
  });

  socket.on('voice:speaking', ({ channelId, speaking }: { channelId: string; speaking: boolean }) => {
    if (!joined.has(channelId)) return;
    socket.to(`voice:${channelId}`).emit('voice:state-update', { channelId, userId, speaking });
  });

  socket.on('disconnect', () => {
    for (const channelId of joined) {
      roster(channelId).delete(userId);
      io.to(`voice:${channelId}`).emit('voice:user-left', { channelId, userId });
    }
  });
}
