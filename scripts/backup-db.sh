#!/usr/bin/env bash
set -euo pipefail
DB="${BAILBONDS_DB:?Set BAILBONDS_DB to the production SQLite database path}"
DEST_DIR="${BAILBONDS_BACKUP_DIR:?Set BAILBONDS_BACKUP_DIR to a protected backup directory}"
mkdir -p "$DEST_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
sqlite3 "$DB" ".backup '$DEST_DIR/bailbonds-$STAMP.sqlite3'"
echo "Created SQLite backup: $DEST_DIR/bailbonds-$STAMP.sqlite3"
