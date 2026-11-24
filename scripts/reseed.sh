#!/bin/bash
# The optional demo seeder needs an explicitly provisioned demo database.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEMO_DATABASE_URL:?Set DEMO_DATABASE_URL to a disposable PostgreSQL database}"
export DATABASE_URL="$DEMO_DATABASE_URL"
npm run db:migrate
npx tsx scripts/seed-demo.ts
