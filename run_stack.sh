#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_PORT="${PORT:-8787}"
API_PORT="${API_PORT:-8788}"
export PORT="$API_PORT"
export BAILBONDS_ADMIN_TOKEN="${BAILBONDS_ADMIN_TOKEN:-dev-admin-token}"
bash "$ROOT/build_static.sh"
python3 "$ROOT/backend/server.py" & API_PID=$!
cleanup() { kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
echo "Frontend: http://127.0.0.1:$WEB_PORT"
echo "API:      http://127.0.0.1:$API_PORT"
cd "$ROOT/dist"
python3 -m http.server "$WEB_PORT" --bind 127.0.0.1
