# NetChat native Windows setup (no Docker) — Node.js + PM2.
# Run in PowerShell from the repo root:  .\setup.ps1
# Re-runnable after a `git pull` (acts like a redeploy).
param(
  [string]$AppDomain = $env:APP_DOMAIN,
  [string]$RegCode   = $env:REG_CODE,
  [string]$TurnDomain = $env:TURN_DOMAIN
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
function Info($m){ Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  [!] $m" -ForegroundColor Yellow }
function Hex32 { -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }) }

Info "1/6  Prerequisites"
$node = (node -v) 2>$null
if (-not $node) { throw "Node.js not found. Install Node.js 20 LTS from https://nodejs.org and re-run." }
if ([int]($node.TrimStart('v').Split('.')[0]) -lt 20) { throw "Node $node found; need >= 20." }
Ok "node $node"
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Warn "pm2 not found — installing globally (npm i -g pm2)"
  npm i -g pm2 | Out-Null
}
Ok "pm2 present"

Info "2/6  Environment (server\.env)"
$envPath = Join-Path $root "server\.env"
if (Test-Path $envPath) {
  Ok "server\.env exists — keeping it"
} else {
  if (-not $AppDomain) { $AppDomain = Read-Host "Public app hostname (e.g. chat.example.com)" }
  if (-not $TurnDomain) {
    $base = $AppDomain -replace '^chat\.',''
    $TurnDomain = Read-Host "TURN hostname [turn.$base]"
    if (-not $TurnDomain) { $TurnDomain = "turn.$base" }
  }
  if (-not $RegCode) { $RegCode = Read-Host "Registration code (share with friends)" }
  if (-not $AppDomain -or -not $RegCode) { throw "App domain and registration code are required." }
  $turnSecret = Hex32
  @"
PORT=3000
JWT_SECRET=$(Hex32)
JWT_REFRESH_SECRET=$(Hex32)
DB_PATH=./netchat.db
UPLOADS_DIR=./uploads
CLIENT_ORIGIN=https://$AppDomain
REGISTRATION_CODE=$RegCode
TURN_SECRET=$turnSecret
TURN_DOMAIN=$TurnDomain
NODE_ENV=production
"@ | Set-Content -NoNewline -Encoding ascii $envPath
  Ok "generated server\.env (random secrets)"
}

Info "3/6  Server (install - migrate - build)"
Push-Location (Join-Path $root "server")
npm install
npm run db:migrate
npm run build
Pop-Location
Ok "server built"

Info "4/6  Client (install - build)"
Push-Location (Join-Path $root "client")
npm install
npm run build
Pop-Location
Ok "client built (PWA)"

Info "5/6  PM2 (run + survive reboot)"
Push-Location (Join-Path $root "server")
pm2 startOrReload ecosystem.config.js 2>$null
if ($LASTEXITCODE -ne 0) { pm2 start ecosystem.config.js }
pm2 save
Pop-Location
# Auto-start on boot via a Scheduled Task that resurrects PM2 (Windows has no
# systemd, so `pm2 startup` doesn't apply).
$pm2cmd = (Get-Command pm2).Source
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$pm2cmd`" resurrect"
$trigger = New-ScheduledTaskTrigger -AtStartup
try {
  Register-ScheduledTask -TaskName "NetChat-PM2" -Action $action -Trigger $trigger `
    -RunLevel Highest -Force -User $env:USERNAME | Out-Null
  Ok "registered NetChat-PM2 startup task"
} catch {
  Warn "could not register startup task automatically — run this PowerShell as Administrator once, or add a Task Scheduler task running 'pm2 resurrect' at startup."
}

Info "6/6  Health check"
Start-Sleep -Seconds 3
try {
  $h = Invoke-RestMethod http://localhost:3000/health -TimeoutSec 5
  Ok "app is up: status=$($h.status)"
} catch {
  Warn "app not responding yet on :3000 — check 'pm2 logs netchat'"
}

Write-Host ""
Info "Done. Remaining MANUAL steps (need you):"
Write-Host @"
  1) Cloudflare Tunnel (public HTTPS, no open ports):
       winget install --id Cloudflare.cloudflared
       cloudflared tunnel login
       cloudflared tunnel create netchat
       Dashboard -> Tunnels -> netchat -> Public Hostname:
         $AppDomain  ->  http://localhost:3000
       cloudflared.exe service install <token>

  2) Voice (pick ONE):
     a) Easiest: no local TURN. Most networks connect via STUN/direct P2P. If a
        friend on a strict NAT can't hear/see, use (b).
     b) Managed TURN (no coturn): get free TURN creds (e.g. metered.ca / Cloudflare),
        then add to server\.env and restart (pm2 restart netchat):
          TURN_URL=turn:your-turn-host:3478
          TURN_STATIC_USERNAME=...
          TURN_STATIC_CREDENTIAL=...
        See WINDOWS-NATIVE.md for the exact steps.

  3) Backups: Task Scheduler -> daily ->
       powershell -ExecutionPolicy Bypass -File $root\scripts\backup.ps1

  Friends register at https://$AppDomain with the registration code.
  Password reset:  cd server; npm run admin:reset-password -- --username <name>
  Update later:    git pull;  .\setup.ps1
"@
