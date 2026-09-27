# Leap bridge

The browser can't talk to the Leap directly. Ultraleap Hand Tracking (6.x, `libtrack_server`) exposes hand
data through the LeapC C API, and Ultraleap's `Ultraleap-Tracking-WS` server republishes it as leapjs
protocol v6 JSON on a local WebSocket. `lib/gestures/leap.ts` reads that socket.

```
Leap ─USB─▶ Ultraleap Hand Tracking ─LeapC─▶ Ultraleap-Tracking-WS ── ws://127.0.0.1:6437/v6.json ──▶ browser
```

## Commands

| Command | What it does |
|---|---|
| `npm run leap:bridge` | Builds the server on first run (`build-bridge.sh`), then serves the live Leap on port 6437 |
| `npm run leap:synth` | Writes a synthetic gesture session to `fixtures/` |
| `npm run leap:replay` | Serves a recorded or synthetic session like the real server (no hardware needed) |
| `npm run leap:record` | Records a live session from the bridge to `fixtures/` |

The bridge and replay both want port 6437; run one at a time, or give replay another port and point
`NEXT_PUBLIC_LEAP_WS_URL` in `.env.local` at it.

## Protocol notes (verified against the running server)

- Only the `/v6.json` path is accepted; connecting to `ws://127.0.0.1:6437` is closed with code 1006.
- The first message is `{"version":6}`.
- Frames are sent only after the client sends `{"background":true}` or `{"focused":true}`. The server
  compares these as exact strings, so send `JSON.stringify(...)` output with no spaces.
- Frames only flow while a controller is connected and tracking. An open socket with no frames usually
  means the controller is unplugged; check the Ultraleap Control Panel visualizer.
- Serve the app over `http://localhost`: the server has no secure WebSocket, so an https page can't connect.

## Build notes

`build-bridge.sh` clones the server to `~/.affinity/UltraleapTrackingWebSocket` and works around three
macOS issues: the LeapC SDK lives inside `/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK`,
Homebrew's OpenSSL is keg-only, and the upstream CMake can't find Homebrew's libwebsockets on its own.
