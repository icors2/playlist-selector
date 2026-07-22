#!/usr/bin/env bash
# Bind Next.js to $PORT immediately. Migrate/seed after the HTTP server is up
# so Render health checks / edge routing don't return plain-text "Not Found"
# while free Postgres is waking.
set -euo pipefail

npm run db:migrate &
MIGRATE_PID=$!

npm run start &
APP_PID=$!

cleanup() {
  kill "$MIGRATE_PID" "$APP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Seed after migrate finishes (best-effort; app can serve without catalog).
wait "$MIGRATE_PID" && npm run db:seed || echo "DB setup warning — app still running"

wait "$APP_PID"
