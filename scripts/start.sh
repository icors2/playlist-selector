#!/usr/bin/env bash
# Bind Next.js to $PORT immediately, then seed catalog in the background.
# Never block listen on migrate/seed — that caused Render edge "Not Found"
# while free Postgres was waking (x-render-routing: no-server).
set -euo pipefail

npm run start &
APP_PID=$!

cleanup() {
  kill "$APP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ -n "${DATABASE_URL:-}" ]]; then
  # Schema should already exist from build-time migrate; re-run is idempotent.
  (npm run db:migrate && npm run db:seed) || echo "DB setup warning — app still running"
fi

wait "$APP_PID"
