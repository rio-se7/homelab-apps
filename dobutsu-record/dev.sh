#!/usr/bin/env bash
# Start backend (cargo, release) and frontend (vite dev server) together.
# Ctrl+C / Vite's `q` stops both.
# Extra args are forwarded to `vite` (e.g. `./dev.sh --port 5174 --host`).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
DB_PATH="${DOBUTSU_RECORD_DB:-data/record.db}"
BACKEND_PORT="${DOBUTSU_RECORD_PORT:-8090}"

backend_pid=""
cleanup() {
  trap - INT TERM EXIT
  [[ -n "$backend_pid" ]] && kill "$backend_pid" 2>/dev/null
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

(
  cd "$BACKEND_DIR"
  exec cargo run --release -- --db "$DB_PATH" --port "$BACKEND_PORT"
) > >(sed -u 's/^/[backend] /') 2>&1 &
backend_pid=$!

cd "$FRONTEND_DIR"
npm run dev -- "$@"
