#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$ROOT/build.sh"
cd "$ROOT/dist"
PORT="${PORT:-8787}"
echo "918 Bail Bonds MVP: http://127.0.0.1:$PORT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
