#!/usr/bin/env node
// Records a live Leap session to JSONL for replay.mjs, at most 30 fps and only the fields the app uses.
//
//   node scripts/leap/record.mjs [--url ws://127.0.0.1:6437/v6.json] [--out file.jsonl] [--seconds 30]
//
// Without --seconds it records until Ctrl-C.

import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "ws://127.0.0.1:6437/v6.json" },
    out: { type: "string", default: resolve(here, `fixtures/real-${stamp}.jsonl`) },
    seconds: { type: "string" },
  },
});

// A little under 1/30 s, so a 60 fps source keeps every second frame.
const MIN_GAP_US = 1_000_000 / 30 - 1000;
const CONTROL_MESSAGES = [{ background: true }, { focused: true }, { optimizeHMD: false }].map((message) =>
  JSON.stringify(message),
);

const round = (value, digits) =>
  Array.isArray(value) ? value.map((n) => Number(Number(n).toFixed(digits))) : value;

function trimFrame(frame) {
  return {
    id: frame.id,
    timestamp: frame.timestamp,
    hands: frame.hands.map((hand) => ({
      id: hand.id,
      type: hand.type,
      palmPosition: round(hand.palmPosition, 1),
      palmNormal: round(hand.palmNormal, 3),
      palmVelocity: round(hand.palmVelocity, 1),
      direction: round(hand.direction, 3),
      pinchStrength: hand.pinchStrength,
      grabStrength: hand.grabStrength,
    })),
    pointables: (frame.pointables ?? []).map((pointable) => ({
      handId: pointable.handId,
      type: pointable.type,
      tipPosition: round(pointable.tipPosition, 1),
    })),
  };
}

mkdirSync(dirname(args.out), { recursive: true });
const out = createWriteStream(args.out);
const socket = new WebSocket(args.url);
let wroteHeader = false;
let lastKeptUs = -Infinity;
let frames = 0;
let withHands = 0;

let finished = false;

function finish(code = 0) {
  if (finished) return;
  finished = true;
  socket.removeAllListeners();
  socket.on("error", () => undefined);
  socket.terminate();
  out.end(() => {
    console.log(`\nSaved ${frames} frames (${withHands} with hands) to ${args.out}`);
    process.exit(code);
  });
}

socket.on("open", () => {
  for (const message of CONTROL_MESSAGES) socket.send(message);
  console.log(`Recording ${args.url} → ${args.out}${args.seconds ? ` for ${args.seconds}s` : " (Ctrl-C to stop)"}`);
  if (args.seconds) setTimeout(() => finish(0), Number(args.seconds) * 1000);
});

socket.on("message", (data) => {
  let message;
  try {
    message = JSON.parse(data.toString());
  } catch {
    return;
  }
  const isFrame = Array.isArray(message.hands) && typeof message.timestamp === "number";
  if (!isFrame) {
    if (!wroteHeader && typeof message.version === "number") {
      out.write(`${JSON.stringify(message)}\n`);
      wroteHeader = true;
    }
    return;
  }
  if (!wroteHeader) {
    out.write(`${JSON.stringify({ version: 6 })}\n`);
    wroteHeader = true;
  }
  if (message.timestamp - lastKeptUs < MIN_GAP_US) return;
  lastKeptUs = message.timestamp;
  out.write(`${JSON.stringify(trimFrame(message))}\n`);
  frames += 1;
  if (message.hands.length > 0) withHands += 1;
  if (frames % 30 === 0) process.stdout.write(`\r${frames} frames, ${withHands} with hands`);
});

socket.on("error", (error) => {
  console.error(`Could not record from ${args.url}: ${error.message}`);
  finish(1);
});

socket.on("close", () => {
  console.log("\nServer closed the connection.");
  finish(0);
});

process.on("SIGINT", () => finish(0));
