# ddns-update.ps1 — keep turn.<domain> pointed at the home public IP on Windows.
# Schedule via Task Scheduler every 5-10 min. Set the env vars below (or edit here).
#   $env:CF_API_TOKEN, $env:CF_ZONE_ID, $env:CF_RECORD_ID, $env:TURN_NAME
$ErrorActionPreference = "Stop"

$token  = $env:CF_API_TOKEN
$zone   = $env:CF_ZONE_ID
$record = $env:CF_RECORD_ID
$name   = $env:TURN_NAME      # e.g. turn.example.com
if (-not ($token -and $zone -and $record -and $name)) {
  Write-Error "Set CF_API_TOKEN, CF_ZONE_ID, CF_RECORD_ID, TURN_NAME"; exit 1
}

$ip = (Invoke-RestMethod -Uri "https://api.ipify.org").Trim()
$body = @{ type = "A"; name = $name; content = $ip; ttl = 120; proxied = $false } | ConvertTo-Json

Invoke-RestMethod -Method Put `
  -Uri "https://api.cloudflare.com/client/v4/zones/$zone/dns_records/$record" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body $body | Out-Null

Write-Host "ddns: $name -> $ip"
