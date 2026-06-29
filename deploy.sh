#!/bin/bash
# Redeploy NetChat on the Prague PC after `git pull` (spec §13).
set -e
cd "$(dirname "$0")"

cd server  && npm install && npm run db:migrate && npm run build
cd ../client && npm install && npm run build
cd ../server && pm2 restart netchat || pm2 start ecosystem.config.js
echo "Deployed."
