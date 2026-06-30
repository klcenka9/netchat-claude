#!/bin/bash
# backup.sh — daily SQLite backup, keep ~14 days (spec §13).
# Cron, e.g.:  0 3 * * * /path/to/netchat/scripts/backup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${DB_PATH:-$ROOT/server/netchat.db}"
DEST="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$DEST"

# Use the SQLite backup API (consistent snapshot even while the app is running).
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$DEST/netchat-$(date +%F).db'"
else
  cp "$DB" "$DEST/netchat-$(date +%F).db"
fi

# Prune backups older than KEEP_DAYS.
find "$DEST" -name 'netchat-*.db' -mtime "+$KEEP_DAYS" -delete

echo "backup: wrote $DEST/netchat-$(date +%F).db (keeping $KEEP_DAYS days)"
