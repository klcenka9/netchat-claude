#!/bin/bash
###############################################################################
# NetChat one-shot setup for the Prague PC (spec §13).
#
# Does everything that can be automated:
#   - checks prerequisites (Node 20, npm, openssl)
#   - generates server/.env with random secrets (keeps an existing one)
#   - installs deps + migrates DB + builds server & client
#   - starts the app under PM2 (enables boot-survival)
#   - starts coturn via docker compose (if docker is present)
#   - runs the smoke test to verify the live stack
#
# What it can NOT do for you (printed at the end): Cloudflare Tunnel login,
# the router UDP port-forward, and the DNS-only turn.<domain> record.
#
# Usage:
#   ./setup.sh                      # interactive (prompts for domain + code)
#   DOMAIN=chat.example.com REG_CODE=letmein TURN_DOMAIN=turn.example.com ./setup.sh
#
# Re-runnable: safe to run again after a `git pull` (acts like deploy.sh then).
###############################################################################
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$1"; exit 1; }

bold "==> 1/7  Prerequisites"
command -v node >/dev/null || die "node not found — install Node.js 20 LTS"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR found, need >= 20"
command -v npm >/dev/null || die "npm not found"
command -v openssl >/dev/null || die "openssl not found"
ok "node $(node -v), npm $(npm -v)"

bold "==> 2/7  Environment (server/.env)"
if [ -f server/.env ]; then
  ok "server/.env already exists — keeping it (edit by hand to change secrets)"
  # shellcheck disable=SC1091
  set -a; . server/.env; set +a
else
  DOMAIN="${DOMAIN:-}"
  REG_CODE="${REG_CODE:-}"
  TURN_DOMAIN="${TURN_DOMAIN:-}"
  if [ -z "$DOMAIN" ]; then read -r -p "  Public app hostname (e.g. chat.example.com): " DOMAIN; fi
  if [ -z "$TURN_DOMAIN" ]; then
    DEFAULT_TURN="turn.${DOMAIN#chat.}"
    read -r -p "  TURN hostname [${DEFAULT_TURN}]: " TURN_DOMAIN
    TURN_DOMAIN="${TURN_DOMAIN:-$DEFAULT_TURN}"
  fi
  if [ -z "$REG_CODE" ]; then read -r -p "  Registration code (share with friends): " REG_CODE; fi
  [ -n "$DOMAIN" ] && [ -n "$REG_CODE" ] || die "domain and registration code are required"

  TURN_SECRET="$(openssl rand -hex 32)"
  cat > server/.env <<EOF
PORT=3000
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
DB_PATH=./netchat.db
UPLOADS_DIR=./uploads
CLIENT_ORIGIN=https://${DOMAIN}
REGISTRATION_CODE=${REG_CODE}
TURN_SECRET=${TURN_SECRET}
TURN_DOMAIN=${TURN_DOMAIN}
NODE_ENV=production
EOF
  ok "generated server/.env (random JWT/TURN secrets)"
  # shellcheck disable=SC1091
  set -a; . server/.env; set +a
fi
# Mirror TURN_SECRET into a root .env so docker-compose.coturn.yml picks it up.
printf 'TURN_SECRET=%s\n' "${TURN_SECRET:-}" > .env

bold "==> 3/7  Server (install · migrate · build)"
( cd server && npm install && npm run db:migrate && npm run build )
ok "server built"

bold "==> 4/7  Client (install · build)"
( cd client && npm install && npm run build )
ok "client built (PWA)"

bold "==> 5/7  PM2 (run + survive reboot)"
if ! command -v pm2 >/dev/null; then
  warn "pm2 not found — installing globally"
  npm i -g pm2
fi
( cd server && pm2 startOrRestart ecosystem.config.js && pm2 save )
pm2 startup >/tmp/pm2-startup.txt 2>&1 || true
if grep -q 'sudo env' /tmp/pm2-startup.txt; then
  warn "to survive reboot, run the line that 'pm2 startup' printed:"
  grep 'sudo env' /tmp/pm2-startup.txt | sed 's/^/      /'
fi
ok "app running under PM2 on http://localhost:3000"

bold "==> 6/7  coturn (voice TURN relay)"
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  TURN_SECRET="${TURN_SECRET:-}" docker compose -f docker-compose.coturn.yml up -d
  ok "coturn started via docker compose"
else
  warn "docker (compose) not found — install coturn manually:"
  warn "  sudo apt install coturn  &&  cp turnserver.conf.example /etc/turnserver.conf"
  warn "  (set static-auth-secret = TURN_SECRET from server/.env, then enable the service)"
fi

bold "==> 7/7  Smoke test (verify live stack)"
if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then
  ( cd server && BASE=http://localhost:3000 CODE="${REGISTRATION_CODE}" npm run smoke ) \
    && ok "smoke test passed" \
    || warn "smoke test reported failures — check the output above"
else
  warn "app not responding on :3000 yet — check 'pm2 logs netchat'"
fi

echo
bold "Done. Remaining MANUAL steps (need you — can't be scripted):"
cat <<EOF
  1. Cloudflare Tunnel for the app (no open ports):
       sudo apt install cloudflared   # see README for the signed APT repo
       cloudflared tunnel login && cloudflared tunnel create netchat
       Dashboard → Tunnels → netchat → Public Hostname:
         ${DOMAIN:-chat.<domain>}  ->  http://localhost:3000
       sudo cloudflared service install <token>

  2. Voice (coturn) reachability:
       - Router: forward UDP 3478 + 49152-49252 to this PC's LAN IP.
       - Cloudflare DNS: A record ${TURN_DOMAIN:-turn.<domain>} -> your public IP,
         set to DNS only (grey cloud, NOT proxied).
       - If no static IP, add the DDNS cron (scripts/ddns-update.sh).

  3. Backups cron:
       0 3 * * * ${ROOT}/scripts/backup.sh

  Friends register at https://${DOMAIN:-chat.<domain>} with the registration code.
  Password reset:  cd server && npm run admin:reset-password -- --username <name>
  Redeploy after a push:  git pull && ./deploy.sh   (or re-run ./setup.sh)
EOF
