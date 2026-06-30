import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'fs';
import { Server as SocketServer } from 'socket.io';
import { env } from './config/env';
import { migrate } from './db/migrate';
import { registerRoutes } from './routes';
import { registerSockets } from './sockets';

// Ensure DB schema + uploads dir exist on boot.
migrate();
fs.mkdirSync(env.UPLOADS_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);

// Behind Cloudflare Tunnel (one proxy hop): trust the forwarded client IP so the
// per-IP auth rate limit (§12) keys on the real visitor, not on cloudflared.
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(
  cors({
    origin: [env.CLIENT_ORIGIN, 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(env.UPLOADS_DIR));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', time: Date.now() });
});

registerRoutes(app);

// Serve the built PWA (client/dist) so a single origin — chat.<domain> mapped to
// this server via Cloudflare Tunnel — serves both the app and the API. Registered
// after the API routes; the SPA fallback skips /api, /uploads, /socket.io, /health
// so deep links / client-side routes still load index.html.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/socket.io') ||
      req.path === '/health'
    ) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  console.warn('client/dist not found — run `npm run build` in client/ to serve the PWA');
}

const io = new SocketServer(server, {
  cors: { origin: [env.CLIENT_ORIGIN, 'http://localhost:5173'], credentials: true },
});
registerSockets(io);

// Make io available to REST handlers that need to emit (e.g. webhook ingress).
app.set('io', io);

server.listen(env.PORT, () => {
  console.log(`NetChat server listening on :${env.PORT} (${env.NODE_ENV})`);
});

export { app, server, io };
