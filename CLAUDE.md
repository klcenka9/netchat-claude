# NetChat — Project Guide for Claude Code

Self-hosted, near-1:1 Discord clone for a ~25-person friend group. Node 20 + TypeScript
everywhere. This file is the operating guide; the original master spec defines the full
feature list and is the source of truth for any disputed detail.

## Operating rules

1. Build through the phases (§14 of the master spec) in order; don't skip ahead.
2. After each phase: run the app, exercise the new functionality, then commit naming the phase.
3. Don't add features beyond the spec; don't silently drop the load-bearing ones
   (permission overwrites, mentions, threads, search, webhooks, friends).
4. `zod` validation at every REST body and every socket payload. No untyped input reaches a query.
5. Permission check on every mutating action. Channel-scoped actions resolve overwrites (§7).
6. All SQL via `better-sqlite3` prepared statements with bound params — never string-concatenated.

## Tech stack (locked)

Express 4 · Socket.io v4 · better-sqlite3 (+ FTS5) · JWT+bcrypt · zod · multer ·
markdown-it + sanitize-html · undici + node-html-parser (link unfurl) · WebRTC mesh + coturn ·
React 18 + Vite + Tailwind + Zustand · vite-plugin-pwa · PM2 · Cloudflare Tunnel.

## Architecture invariants

- **Permissions** (`server/src/utils/permissions.ts`): 29-bit bitfield. `ADMINISTRATOR` bypasses
  everything incl. overwrites. Channel resolution order: base roles → @everyone overwrite →
  role overwrites → member overwrite. `permissionResolver.ts` loads context; `permission.middleware.ts`
  guards routes; socket handlers re-check server-side.
- **Privilege-escalation guard** (security requirement, not UX): can't grant perms you lack,
  can't act on roles/members at or above your highest role. Owner is the only exception.
- **IDs**: snowflake decimal strings (`utils/snowflake.ts`), sortable by creation time.
- **Migrations** run automatically when `db/client.ts` opens (idempotent), and via `npm run db:migrate`.
  FTS5 triggers live in `db/runMigrations.ts`.
- **Realtime**: `utils/realtime.ts` holds the io instance so REST routes can emit. Rooms:
  `user:<id>`, `server:<id>`, `channel:<id>`, `voice:<id>`, `dm:<id>`, `dmcall:<id>`.
- **Voice**: signaling only over Socket.io; media is peer-to-peer (mesh) / coturn-relayed.
  In-memory rosters in the voice/dmCall handlers — no persistent call records.

## Layout

```
server/src/
  config/env.ts        config + env validation
  db/                  schema.sql, client.ts, runMigrations.ts, migrate.ts
  models/              one module per table group (prepared statements)
  routes/              REST routers, registered in routes/index.ts
  sockets/             socket handlers, registered in sockets/index.ts
  middleware/          auth, permission, validate, rateLimit
  utils/               permissions, markdown, mentions, embedFetcher, jwt, password, snowflake
  scripts/             admin CLI (resetPassword)
client/                React PWA
```

## Security checklist (spec §12)

bcrypt cost 12 · registration code gating · JWT access 15m / refresh 30d rotated, httpOnly+SameSite=Strict ·
account lockout after 5 fails (15m) · TOTP secret AES-256-GCM at rest · rate limits on auth (5/min),
message send (10/10s), webhook ingress (5/10s) · constrained markdown + sanitize-html · explicit CSP ·
SSRF guard on embed fetch · upload mime/ext whitelist · webhook tokens stored hashed, shown once.

## Commands

```
cd server && npm run dev        # API on :3000
cd client && npm run dev        # PWA on :5173
npm run db:migrate              # apply schema
npm run admin:reset-password -- --username <name>
npm run typecheck / npm test
```
