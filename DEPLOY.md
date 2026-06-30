# NetChat — deployment

Two ways to deploy. Either run the script yourself, or hand this repo to an AI
coding agent (Cursor / Claude Code / etc.) and let it drive.

---

## Option A — one command (you run it on the Prague PC)

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
server. Read README.md and setup.sh first. Then:

1. Confirm prerequisites: Node.js 20 LTS, npm, git, openssl (and Docker if
   HAS_DOCKER=yes). Tell me exact commands if anything is missing.
2. Run ./setup.sh, feeding it APP_DOMAIN and REGISTRATION_CODE from the DATA
   block. It generates server/.env with random JWT/TURN secrets, installs +
   builds server & client, starts the app under PM2, starts coturn, and runs the
   smoke test. Show me the smoke-test result.
3. Set up Cloudflare Tunnel for the app (no open ports):
   install cloudflared from Cloudflare's signed APT repo (commands are in
   README.md), `cloudflared tunnel login`, `cloudflared tunnel create netchat`,
   then map APP_DOMAIN -> http://localhost:3000 in the dashboard, and
   `sudo cloudflared service install <CF_TUNNEL_TOKEN>`.
4. Voice/TURN: tell me the exact router rule to add (forward UDP 3478 and
   49152-49252 to this machine's LAN IP). Create a DNS-only (grey-cloud) A record
   TURN_DOMAIN -> my public IP. If PUBLIC_IP_STATIC=no, install the cron in
   scripts/ddns-update.sh using CF_API_TOKEN / CF_ZONE_ID / CF_RECORD_ID.
5. Add the backup cron:  0 3 * * * <repo>/scripts/backup.sh
6. Verify end to end: open https://APP_DOMAIN, register an account with
   REGISTRATION_CODE, and confirm chat + a voice channel work. Report status.

Rules: never print or commit secrets. Everything sensitive lives in server/.env
(gitignored). If a step needs a value I haven't given you, stop and ask me for
exactly that one value.
```

---

## After deploy

- Friends register at `https://<APP_DOMAIN>` with the registration code.
- Password reset (no mail server): `cd server && npm run admin:reset-password -- --username <name>`.
- Update after changes: `git pull && ./deploy.sh` (or re-run `./setup.sh`).
- Re-verify the live stack anytime: `cd server && BASE=http://localhost:3000 CODE=<code> npm run smoke`.
