#!/usr/bin/env bash
# Start Next as the main process (binds $PORT immediately).
# Migrate/seed run in the background so free-tier spin-up isn't stuck
# with no listener (Render edge "Not Found" / x-render-routing: no-server).
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  (npm run db:migrate && npm run db:seed) > /tmp/okaylist-db-setup.log 2>&1 &
fi

exec npm run start
