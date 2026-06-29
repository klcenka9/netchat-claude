# NetChat

Self-hosted, near-1:1 Discord clone — Node.js + Socket.io + SQLite + WebRTC.
Built for a small friend group, deployed to a home server PC via Cloudflare Tunnel.

See `CLAUDE.md` for the full implementation spec.

## Stack

- **Backend**: Node 20 + TypeScript, Express 4, Socket.io v4, `better-sqlite3` (+ FTS5)
- **Auth**: JWT (15 min access / 30 day rotated refresh) + bcrypt, optional TOTP 2FA
- **Voice/Video**: WebRTC mesh, signaled over Socket.io, coturn for NAT traversal
- **Frontend**: React 18 + Vite + Tailwind + Zustand, installable PWA

## Repository layout

```
server/   Express + Socket.io API, SQLite schema/migrations, models, routes, sockets
client/   React PWA (Vite)
docker-compose.coturn.yml   TURN server
deploy.sh                   one-shot redeploy on the host PC
```

## Local development

```bash
# Server
cd server
cp .env.example .env        # then edit secrets + REGISTRATION_CODE
npm install
npm run db:migrate          # creates netchat.db (also runs automatically on boot)
npm run dev                 # http://localhost:3000  (GET /health -> 200)

# Client
cd ../client
npm install
npm run dev                 # http://localhost:5173
```

The client dev server proxies `/api`, `/uploads` and the socket to `localhost:3000`.

### Environment variables (`server/.env`)

| Var | Purpose |
|---|---|
| `PORT` | HTTP port (3000) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | token signing (use `openssl rand -hex 32`) |
| `DB_PATH` | SQLite file path |
| `UPLOADS_DIR` | upload storage dir |
| `CLIENT_ORIGIN` | allowed CORS origin, e.g. `https://chat.example.com` |
| `REGISTRATION_CODE` | shared sign-up code (no open registration) |
| `TURN_SECRET` | coturn `static-auth-secret`; must match the TURN server |
| `TURN_DOMAIN` | `turn.example.com` |

## Admin: password reset (no mail server)

```bash
cd server
npm run admin:reset-password -- --username <name>
# prints a one-time reset link (1h expiry) to hand to the user out-of-band
```

## Production hosting (Prague PC) — summary of spec §13

1. **Clone & build**
   ```bash
   git clone <repo> && cd netchat
   cd server && npm install && npm run db:migrate && npm run build
   cd ../client && npm install && npm run build
   npm i -g pm2 && cd ../server && pm2 start ecosystem.config.js && pm2 save && pm2 startup
   ```
2. **Cloudflare Tunnel** (no open ports for the app): install `cloudflared`, `cloudflared tunnel create netchat`, map `chat.<domain>` → `http://localhost:3000` in the dashboard, install as a service. Cloudflare terminates HTTPS at its edge; the app listens on plain HTTP locally.
3. **coturn** (the only port-forward): `docker compose -f docker-compose.coturn.yml up -d` with `TURN_SECRET` set, forward UDP `3478` + `49152-49252` on the router, and a **DNS-only** `turn.<domain>` A record kept current by the DDNS cron in §13.
4. **Backups**: `cp server/netchat.db backups/netchat-$(date +%F).db` daily via cron, keep ~14.

Redeploy after a push: `git pull && ./deploy.sh`.

## Build phases

Implemented in the order defined by `CLAUDE.md` §14 (auth → friends → servers/channels →
permissions → messaging → rich messages → threads → search → roles/audit → DMs → voice →
moderation → webhooks → notifications/PWA → hosting). Each phase is committed separately.
