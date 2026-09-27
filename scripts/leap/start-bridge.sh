#!/usr/bin/env bash
# Starts the tracking WebSocket bridge on ws://127.0.0.1:6437/v6.json, building it first if needed.
set -euo pipefail

SRC_DIR="${AFFINITY_LEAP_WS_DIR:-$HOME/.affinity/UltraleapTrackingWebSocket}"
BIN="$SRC_DIR/build/Ultraleap-Tracking-WS"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -x "$BIN" ] || bash "$SCRIPT_DIR/build-bridge.sh"

if lsof -nP -iTCP:6437 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 6437 is already in use (a bridge or 'npm run leap:replay' is running):" >&2
  lsof -nP -iTCP:6437 -sTCP:LISTEN >&2
  exit 1
fi

if ! pgrep -f libtrack_server >/dev/null; then
  echo "Warning: the Ultraleap tracking service isn't running. Open Ultraleap Hand Tracking." >&2
fi

echo "Leap bridge on ws://127.0.0.1:6437/v6.json (Ctrl-C to stop)"
exec "$BIN"
