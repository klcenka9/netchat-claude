# NetChat on Windows 10 — native (no Docker)

If Docker Desktop won't run on the PC (no virtualization / Win10 Home / etc.),
run NetChat natively with Node.js + PM2. Everything is PowerShell, from the repo
folder.

## 0. Install
- **Node.js 20 LTS** (recommended) — https://nodejs.org. Node 22/24 also work
  (`better-sqlite3` v12 ships prebuilt binaries for all of them, so `npm install`
  needs no compiler). If you previously ran `npm install` on a Node version
  without a prebuild and it failed, delete the half-built `node_modules` first
  (`Remove-Item -Recurse -Force node_modules`) and re-run.
- **Git** for Windows.
- A **domain on Cloudflare**.

## 1. One command
In PowerShell, in the repo root:
```powershell
.\setup.ps1
```
It asks for your **app hostname** and **registration code**, then:
generates `server\.env` with random secrets, installs + builds the server and
client, starts the app under **PM2**, registers a startup task so it survives
reboot, and checks `http://localhost:3000/health`.

> If `Register-ScheduledTask` is denied, run PowerShell **as Administrator** once
> and re-run `.\setup.ps1` (or add a Task Scheduler task running `pm2 resurrect`
> at startup yourself).

## 2. Cloudflare Tunnel (public HTTPS, no open ports)
```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create netchat
```
Dashboard → **Networks → Tunnels → netchat → Public Hostname**: map
`chat.<your-domain>` → `http://localhost:3000`. Then:
```powershell
cloudflared.exe service install <token-from-dashboard>
```
Now the app is live at `https://chat.<your-domain>`. Chat, accounts, roles,
threads, search, webhooks, DMs all work at this point.

## 3. Voice — coturn has no native Windows build, so pick one

**Option A — start with no TURN (simplest).** STUN + direct peer-to-peer already
connects most networks. Voice/video/screen-share work for the majority of friends
with zero extra setup. If someone behind a strict NAT can't connect, do Option B.

**Option B — managed TURN (recommended if you need the fallback).** Use a hosted
TURN service so you don't run any TURN server on Windows. Free tiers exist
(e.g. **metered.ca** "Open Relay", or Cloudflare). Get a TURN URL + username +
credential from them, add to `server\.env`, and restart:
```powershell
# append to server\.env
TURN_URL=turn:relay.metered.ca:80
TURN_STATIC_USERNAME=<from provider>
TURN_STATIC_CREDENTIAL=<from provider>
```
```powershell
pm2 restart netchat
```
`/api/voice/ice-config` will hand these to clients automatically (no router
port-forward, no coturn). That's the whole change.

**Option C — run coturn anyway.** Only if you specifically want a self-hosted TURN
on this box: run coturn in WSL, or on a separate Linux/Raspberry Pi on your LAN,
using `turnserver.conf.example` (set `static-auth-secret` = `TURN_SECRET` from
`server\.env`), forward UDP 3478 + 49152-49252 on the router to it, and point a
DNS-only `turn.<domain>` A record at your public IP. This is the original spec
setup; Options A/B avoid it entirely.

## 4. Backups (Task Scheduler)
Add a daily task:
```
powershell -ExecutionPolicy Bypass -File C:\path\netchat\scripts\backup.ps1
```
It snapshots `server\netchat.db` into `.\backups` and keeps 14 days.

## 5. Day-to-day
- **Friends register** at `https://chat.<your-domain>` with the registration code.
- **Reset a password**:
  ```powershell
  cd server
  npm run admin:reset-password -- --username <name>
  ```
- **Update after a change**: `git pull; .\setup.ps1`
- **Logs / restart**: `pm2 logs netchat` · `pm2 restart netchat`

That's it: `.\setup.ps1` + the Cloudflare tunnel and you're live, no Docker.
