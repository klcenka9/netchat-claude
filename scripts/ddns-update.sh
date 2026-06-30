#!/bin/bash
# ddns-update.sh — keep turn.<your-domain>.com pointed at the home public IP (spec §13).
# Run via cron on the Prague PC every 5–10 min, e.g.:
#   */10 * * * * CF_API_TOKEN=... ZONE_ID=... RECORD_ID=... TURN_NAME=turn.example.com /path/to/ddns-update.sh
#
# Required env: CF_API_TOKEN, ZONE_ID, RECORD_ID, TURN_NAME
set -euo pipefail

: "${CF_API_TOKEN:?set CF_API_TOKEN}"
: "${ZONE_ID:?set ZONE_ID}"
: "${RECORD_ID:?set RECORD_ID}"
: "${TURN_NAME:?set TURN_NAME (e.g. turn.example.com)}"

IP=$(curl -fsS https://api.ipify.org)

curl -fsS -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"A\",\"name\":\"$TURN_NAME\",\"content\":\"$IP\",\"ttl\":120,\"proxied\":false}" \
  > /dev/null

echo "ddns: $TURN_NAME -> $IP"
