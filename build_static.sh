#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$ROOT/dist"
rm -rf "$DIST"
mkdir -p "$DIST/js" "$DIST/css" "$DIST/data" "$DIST/icons"
cp "$ROOT/mvp/src/html/"*.html "$DIST/"
cp "$ROOT/index.html" "$DIST/index.html"
cp "$ROOT/mvp/src/js/"*.js "$DIST/js/"
cp "$ROOT/mvp/src/css/style.css" "$DIST/css/"
cp "$ROOT/mvp/src/css/data/manifest.json" "$DIST/"
cp "$ROOT/mvp/src/config.js" "$DIST/"
cat > "$DIST/runtime-config.js" <<EOF
window.BAILBONDS_CONFIG = { apiBase: "${BAILBONDS_API:-}" };
EOF
sed -i 's#<script src="./config.js"></script>#<script src="./config.js"></script><script src="./runtime-config.js"></script>#' "$DIST"/*.html
sed -i -e 's#\./\(domain-connector\|bondsman-actions\|ipfs-storage\|contract-generator\|translations\)\.js#./js/\1.js#g' "$DIST"/*.html
echo "Built static app at $DIST"
