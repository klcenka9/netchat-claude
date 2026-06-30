import { io, Socket } from 'socket.io-client';
import { getAccessToken, refreshAccessToken } from './http';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket = io({
    // auth is a function so every (re)connect reads the *current* access token —
    // the token rotates every 15 min, so a captured value would go stale.
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    transports: ['websocket', 'polling'],
  });

  // If a (re)connect is rejected for auth reasons, refresh the token via the
  // refresh cookie and retry, so realtime survives an expired access token
  // without a page reload.
  socket.on('connect_error', async (err) => {
    const msg = String(err?.message ?? '').toLowerCase();
    if (msg.includes('token') || msg.includes('auth')) {
      const ok = await refreshAccessToken().catch(() => false);
      if (ok) socket?.connect();
    }
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
