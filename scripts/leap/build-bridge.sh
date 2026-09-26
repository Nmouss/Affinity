#!/usr/bin/env bash
# Builds Ultraleap's tracking WebSocket server (legacy leapjs protocol v6 on ws://127.0.0.1:6437/v6.json)
# against the LeapC SDK bundled with Ultraleap Hand Tracking 6.x on macOS.
set -euo pipefail

SRC_DIR="${AFFINITY_LEAP_WS_DIR:-$HOME/.affinity/UltraleapTrackingWebSocket}"
LEAP_SDK_DIR="${LEAP_SDK_DIR:-/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK}"

if [ ! -f "$LEAP_SDK_DIR/include/LeapC.h" ]; then
  echo "LeapC SDK not found at $LEAP_SDK_DIR. Install Ultraleap Hand Tracking or set LEAP_SDK_DIR." >&2
  exit 1
fi

brew list libwebsockets >/dev/null 2>&1 || brew install libwebsockets
BREW_PREFIX="$(brew --prefix)"
OPENSSL_PREFIX="$(brew --prefix openssl@3)"

if [ ! -d "$SRC_DIR/.git" ]; then
  git clone --depth 1 https://github.com/ultraleap/UltraleapTrackingWebSocket.git "$SRC_DIR"
fi

# Upstream CMake expects the SDK under /Library/Application Support, but 6.x ships it inside the app.
# Homebrew's OpenSSL is keg-only (libwebsockets.h includes its headers), and the upstream
# find_library call misses Homebrew's libwebsockets, so both are passed explicitly.
cmake -S "$SRC_DIR" -B "$SRC_DIR/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DLeapSDK_DIR="$LEAP_SDK_DIR/lib/cmake/LeapSDK" \
  -DCMAKE_PREFIX_PATH="$BREW_PREFIX;$OPENSSL_PREFIX" \
  -DCMAKE_C_FLAGS="-I$OPENSSL_PREFIX/include -Wno-pointer-sign" \
  -DLIBWEBSOCKETS_LIBS="$BREW_PREFIX/lib/libwebsockets.dylib"
cmake --build "$SRC_DIR/build" -j 8

echo "Built $SRC_DIR/build/Ultraleap-Tracking-WS"
