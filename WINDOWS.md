# NetChat on Windows 10 (Docker Desktop)

The bash `setup.sh` / PM2 / apt path is Linux-only. On Windows 10 the clean way is
**Docker Desktop** — one `docker compose up` builds and runs the whole stack, no
Node/build-tools/PM2/coturn-on-Windows headaches. Run everything in **PowerShell**
from the repo folder.

> **No Docker?** If Docker Desktop won't run on the PC (no virtualization /
> Win10 Home), use the native path instead: **`WINDOWS-NATIVE.md`** (Node + PM2,
> `.\setup.ps1`). It avoids Docker entirely.

## 0. Install
- **Docker Desktop** for Windows (uses the WSL2 backend — accept the WSL2 prompt).
- **Git** for Windows (to clone + pull).
- A **domain on Cloudflare** (nameservers pointed at Cloudflare).

## 1. Secrets — create `server\.env` and root `.env`
PowerShell helper to make a 64-hex-char secret:
```powershell
function New-Secret { -join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) }) }
```
Create `server\.env` (the app reads this):
```powershell
@"
PORT=3000
JWT_SECRET=$(New-Secret)
JWT_REFRESH_SECRET=$(New-Secret)
DB_PATH=/data/netchat.db
UPLOADS_DIR=/data/uploads
CLIENT_ORIGIN=https://chat.<your-domain>
REGISTRATION_CODE=<code you share with friends>
TURN_SECRET=<PUT_ONE_SECRET_HERE>
TURN_DOMAIN=turn.<your-domain>
NODE_ENV=production
"@ | Set-Content -NoNewline server\.env -Encoding ascii
```
Create the root `.env` (Docker Compose reads this for coturn). **`TURN_SECRET` must
match** the one in `server\.env`, and `TURN_EXTERNAL_IP` is your home **public IP**:
```powershell
@"
TURN_SECRET=<SAME_SECRET_AS_server\.env>
TURN_EXTERNAL_IP=<your home public IP>
"@ | Set-Content -NoNewline .env -Encoding ascii
```
(Find your public IP: `Invoke-RestMethod https://api.ipify.org`.)

## 2. Build & run the whole stack
```powershell
docker compose up -d --build
```
The app now runs on `http://localhost:3000` (DB + uploads persist in `.\data`).
Check it: `Invoke-RestMethod http://localhost:3000/health` → `status = ok`.
Logs: `docker compose logs -f app`.

## 3. Cloudflare Tunnel (public HTTPS, no open ports for the app)
Install `cloudflared` (winget) and create the tunnel:
```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create netchat
```
In the Cloudflare dashboard → **Networks → Tunnels → netchat → Public Hostname**:
map `chat.<your-domain>` → `http://localhost:3000`. Then install it as a Windows
service so it survives reboots:
```powershell
cloudflared.exe service install <token-from-dashboard>
```
The app is now live at `https://chat.<your-domain>`.

## 4. Voice (coturn) — the one part that needs the router
coturn already runs in the compose stack. To make it reachable:
1. **Router**: forward UDP **3478** and **49152-49252** to this PC's LAN IP.
2. **Cloudflare DNS**: A record `turn.<your-domain>` → your public IP, set to
   **DNS only** (grey cloud, NOT proxied).
3. Make sure `TURN_EXTERNAL_IP` in the root `.env` is your current public IP, then
   `docker compose up -d` again to apply.
4. If your IP is dynamic, schedule `scripts\ddns-update.ps1` in **Task Scheduler**
   every 10 min (set `CF_API_TOKEN`, `CF_ZONE_ID`, `CF_RECORD_ID`, `TURN_NAME`).

> Note: chat/voice work over STUN + direct P2P for most networks even without
> this. TURN is only the fallback for friends behind strict NATs — you can do
> step 4 first and add the router/DNS bits later.

## 5. Backups (Task Scheduler)
Schedule `scripts\backup.ps1` daily — it snapshots `.\data\netchat.db` into
`.\backups` and keeps 14 days. Example action:
`powershell -ExecutionPolicy Bypass -File C:\path\netchat\scripts\backup.ps1`

## 6. Day-to-day
- **Friends register** at `https://chat.<your-domain>` with the registration code.
- **Reset a password** (no mail server):
  ```powershell
  docker compose exec app node dist/scripts/resetPassword.js --username <name>
  ```
  It prints a one-time link you send them.
- **Update after a change**: `git pull; docker compose up -d --build`
- **Stop / start**: `docker compose down` / `docker compose up -d`

That's it — `docker compose up -d --build` + the Cloudflare tunnel and you're live.
