# backup.ps1 — daily SQLite backup on Windows, keep ~14 days (spec §13).
# Schedule via Task Scheduler (daily). Run from the repo root or pass -Repo.
param(
  [string]$Repo = (Resolve-Path "$PSScriptRoot\.."),
  [int]$KeepDays = 14
)
$ErrorActionPreference = "Stop"

# With Docker the DB lives in <repo>\data\netchat.db; native installs use server\netchat.db.
$db = Join-Path $Repo "data\netchat.db"
if (-not (Test-Path $db)) { $db = Join-Path $Repo "server\netchat.db" }
if (-not (Test-Path $db)) { Write-Error "netchat.db not found under $Repo"; exit 1 }

$dest = Join-Path $Repo "backups"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd"
Copy-Item $db (Join-Path $dest "netchat-$stamp.db") -Force

# Prune backups older than KeepDays.
Get-ChildItem $dest -Filter "netchat-*.db" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Force

Write-Host "backup: wrote netchat-$stamp.db (keeping $KeepDays days)"
