#!/usr/bin/env node
// Serves a recorded (or synthetic) Leap session over the same protocol as Ultraleap-Tracking-WS:
// only the /v6.json path, a version greeting on connect, and frames only after the client sends
// {"background":true} or {"focused":true}. Frames keep their original timing.
//
//   node scripts/leap/replay.mjs [--port 6437] [--file fixtures/synthetic-session.jsonl] [--loop]
//
// --port 0 picks a free port. The real bridge usually holds 6437, so use e.g. --port 6438 and set
// NEXT_PUBLIC_LEAP_WS_URL=ws://127.0.0.1:6438/v6.json in .env.local.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { WebSocketServer } from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    port: { type: "string", default: "6437" },
    host: { type: "string", default: "127.0.0.1" },
    file: { type: "string", default: resolve(here, "fixtures/synthetic-session.jsonl") },
    loop: { type: "boolean", default: false },
  },
});

const START_MESSAGES = new Set(['{"background":true}', '{"focused":true}']);

const lines = readFileSync(args.file, "utf8").split("\n").filter((line) => line.trim() !== "");
const parsed = lines.map((line) => JSON.parse(line));
const isFrame = (message) => Array.isArray(message.hands) && typeof message.timestamp === "number";
const header = parsed.find((message) => !isFrame(message)) ?? { version: 6 };
const frames = parsed.filter(isFrame);
const frameLines = lines.filter((_, index) => isFrame(parsed[index]));
if (frames.length === 0) {
  console.error(`No frames in ${args.file}`);
  process.exit(1);
}
// Marks the source as a replay for the GestureStatus pip; the real server sends only {"version":6}.
const greeting = JSON.stringify({ ...header, replay: true });
const firstUs = frames[0].timestamp;
const lastUs = frames[frames.length - 1].timestamp;
const frameGapUs = frames.length > 1 ? (lastUs - firstUs) / (frames.length - 1) : 16_667;
const loopUs = lastUs - firstUs + frameGapUs;

function play(socket) {
  const started = performance.now();
  let index = 0;
  let lap = 0;
  let timer = null;

  const tick = () => {
    timer = null;
    const elapsedUs = (performance.now() - started) * 1000;
    while (socket.readyState === socket.OPEN) {
      if (index >= frames.length) {
        if (!args.loop) return;
        index = 0;
        lap += 1;
      }
      const offsetUs = lap * loopUs + (frames[index].timestamp - firstUs);
      if (offsetUs > elapsedUs) {
        timer = setTimeout(tick, Math.max(1, (offsetUs - elapsedUs) / 1000));
        return;
      }
      const frame = frames[index];
      // Later laps shift ids and timestamps so they keep increasing, like a live stream.
      socket.send(
        lap === 0
          ? frameLines[index]
          : JSON.stringify({ ...frame, id: frame.id + lap * frames.length, timestamp: frame.timestamp + lap * loopUs }),
      );
      index += 1;
    }
  };

  tick();
  return () => {
    if (timer) clearTimeout(timer);
  };
}

const server = new WebSocketServer({ host: args.host, port: Number(args.port), path: "/v6.json" });

server.on("connection", (socket) => {
  socket.send(greeting);
  let stop = null;
  socket.on("message", (data) => {
    if (stop || !START_MESSAGES.has(data.toString())) return;
    stop = play(socket);
  });
  socket.on("close", () => stop?.());
});

server.on("listening", () => {
  const { port } = server.address();
  console.log(`Replaying ${frames.length} frames from ${args.file}${args.loop ? " (looping)" : ""}`);
  console.log(`listening on ws://${args.host}:${port}/v6.json`);
});

server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `Port ${args.port} is in use (is the real bridge running?). Try --port 6438.` : error);
  process.exit(1);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
