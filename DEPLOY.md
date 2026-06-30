# NetChat — deployment

Pick by host OS:

- **Windows 10/11** → use Docker Desktop. Full step-by-step in **`WINDOWS.md`**
  (`docker compose up -d --build` + Cloudflare Tunnel). This is the recommended
  path for the Windows host.
- **Linux/macOS** → either `./setup.sh` (Option A below) or Docker
  (`docker compose up -d --build`, same as Windows).
- **Hand it to an AI agent** → Option B below (works for any OS; tell it your OS).

---

## Option A — one command (Linux/macOS host)

```bash
cd netchat
./setup.sh
```

It asks for your domain + registration code, then installs, builds, starts the
app under PM2, starts coturn, and runs the smoke test. At the end it prints the
few manual steps it can't do (Cloudflare Tunnel login, router port-forward, DNS).
Full detail: see `README.md` (§ "Production hosting").

---

## Option B — let an AI IDE do it for you

Open this project in your AI IDE, fill in the **DATA** block below with your own
values, and paste the whole thing as the prompt. The agent has everything it
needs in the repo (`setup.sh`, `deploy.sh`, `docker-compose.coturn.yml`,
`turnserver.conf.example`, `scripts/`).

### DATA — fill these in
```
APP_DOMAIN        = chat.<your-domain>           # public hostname for the app
TURN_DOMAIN       = turn.<your-domain>           # hostname for the TURN server
REGISTRATION_CODE = <a phrase you share with friends>
CLOUDFLARE        = I have a domain on Cloudflare: yes / no
HOST_OS           = e.g. Ubuntu 22.04 on the Prague PC
HAS_DOCKER        = yes / no
PUBLIC_IP_STATIC  = yes / no   (if no, we'll set up Dynamic DNS)
# Secrets to paste only when the agent asks (do NOT commit them):
CF_TUNNEL_TOKEN   = <from Cloudflare dashboard, when creating the tunnel>
CF_API_TOKEN      = <Cloudflare API token with DNS edit, only if PUBLIC_IP_STATIC=no>
CF_ZONE_ID        = <Cloudflare zone id, only for Dynamic DNS>
CF_RECORD_ID      = <DNS record id for TURN_DOMAIN, only for Dynamic DNS>
```

### PROMPT — paste this to the agent (after the DATA block)
```
You are deploying this repo (NetChat, a self-hosted Discord clone) to my home
server. First read README.md, DEPLOY.md, and — if my HOST_OS is Windows —
WINDOWS.md. Then deploy:

OS path:
- If HOST_OS is Windows: use Docker Desktop, following WINDOWS.md exactly
  (create server\.env and root .env with secrets, then `docker compose up -d
  --build`). Do NOT use setup.sh / PM2 / apt on Windows.
- If HOST_OS is Linux/macOS: run ./setup.sh (it generates server/.env, builds,
  starts under PM2, starts coturn, runs the smoke test) OR
  `docker compose up -d --build`. Either is fine.

Then, regardless of OS:
1. Generate strong random secrets for JWT_SECRET, JWT_REFRESH_SECRET and a single
   TURN_SECRET; put them in server/.env, and put the SAME TURN_SECRET plus
   TURN_EXTERNAL_IP (my public IP) in the root .env for coturn. Never reuse the
   dev defaults. Fill CLIENT_ORIGIN=https://APP_DOMAIN and REGISTRATION_CODE.
2. Bring the app up and confirm http://localhost:3000/health returns ok.
3. Cloudflare Tunnel (public HTTPS, no open ports): install cloudflared,
   `cloudflared tunnel login`, `cloudflared tunnel create netchat`, then tell me
   to map APP_DOMAIN -> http://localhost:3000 in the dashboard and give you
   CF_TUNNEL_TOKEN; install it as a service.
4. Voice/TURN: tell me the exact router rule (forward UDP 3478 and 49152-49252 to
   this machine's LAN IP) and have me create a DNS-only (grey-cloud) A record
   TURN_DOMAIN -> my public IP. If PUBLIC_IP_STATIC=no, schedule the DDNS script
   (scripts/ddns-update.ps1 on Windows / scripts/ddns-update.sh on Linux).
5. Schedule the backup (Task Scheduler -> scripts\backup.ps1 on Windows, or cron
   -> scripts/backup.sh on Linux).
6. Verify: open https://APP_DOMAIN, register with REGISTRATION_CODE, confirm chat
   and a voice channel work. Report status.

Rules: never print or commit secrets (they live in server/.env and root .env,
both gitignored). better-sqlite3 must be built on this machine / in the
container — never copy node_modules from elsewhere. If a step needs a value I
haven't given you, stop and ask me for exactly that one value.
```

---

## After deploy

- Friends register at `https://<APP_DOMAIN>` with the registration code.
- Password reset (no mail server): `cd server && npm run admin:reset-password -- --username <name>`.
- Update after changes: `git pull && ./deploy.sh` (or re-run `./setup.sh`).
- Re-verify the live stack anytime: `cd server && BASE=http://localhost:3000 CODE=<code> npm run smoke`.
