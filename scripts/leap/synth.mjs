#!/usr/bin/env node
// Writes a synthetic Leap v6 session (JSONL) that performs the demo gestures:
// idle → hover Maya → pinch tap → pinch-drag her to seat 0 → move to the hearth → pinch tap →
// open-palm sweep → handshake held 2 s → hands leave.
//
//   node scripts/leap/synth.mjs [--out file.jsonl] [--aspect 1.7778] [--fps 60]
//
// The path aims at real screen positions: the constants below mirror lib/stage/layout.ts and the
// default calibration box in lib/gestures/pointer.ts. Keep them in sync if those change.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PerspectiveCamera, Vector3 } from "three";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    out: { type: "string", default: resolve(here, "fixtures/synthetic-session.jsonl") },
    aspect: { type: "string", default: String(16 / 9) },
    fps: { type: "string", default: "60" },
  },
});

// lib/stage/layout.ts
const CAMERA = { position: [0, 7.5, 13], target: [0, 2, -3], fov: 42 };
const COUNCIL_RING = { center: [0, 0, -2.5], radius: 3.2, seatAngles: [-0.8, 0, 0.8] };
const MAYA = [-7, 2.2, -1]; // HOME_SPOTS.wife at SPRITE_FLOAT_HEIGHT
const HEARTH = [0, 1.5, -7.4]; // the hearth target's center
const TREE = [-5.5, 2, -6];
// lib/gestures/pointer.ts DEFAULT_CALIBRATION
const BOX = { xMin: -150, xMax: 150, yMin: 120, yMax: 380 };

const aspect = Number(args.aspect);
const fps = Number(args.fps);
const camera = new PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200);
camera.position.set(...CAMERA.position);
camera.lookAt(...CAMERA.target);
camera.updateMatrixWorld();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function toNdc([x, y, z]) {
  const v = new Vector3(x, y, z).project(camera);
  return [clamp(v.x, -0.95, 0.95), clamp(v.y, -0.95, 0.95)];
}
function seatPosition(index) {
  const angle = COUNCIL_RING.seatAngles[index];
  const [cx, cy, cz] = COUNCIL_RING.center;
  return [cx + Math.sin(angle) * COUNCIL_RING.radius, cy, cz + Math.cos(angle) * COUNCIL_RING.radius];
}

const at = {
  center: [0.1, -0.35],
  maya: toNdc(MAYA),
  seat: toNdc(seatPosition(0)),
  hearth: toNdc(HEARTH),
  tree: toNdc(TREE),
  low: [0.3, -1],
};

// Poses: pinch / grab strengths and the palm normal.
const DOWN = [0, -1, 0];
const SIDE = [-1, 0, 0]; // right hand, palm facing left: roll ≈ -90°
const UP = [0, 1, 0];
const relaxed = { pinch: 0.35, grab: 0.25, normal: DOWN };
const pinched = { pinch: 0.96, grab: 0.2, normal: DOWN };
const open = { pinch: 0.08, grab: 0.04, normal: DOWN };
const shake = { pinch: 0.92, grab: 1.0, normal: SIDE };
// Rotating the wrist from palm-down through sideways avoids lerping straight between antiparallel
// normals (which would pass through a degenerate zero vector at the midpoint).
const openSide = { pinch: 0.08, grab: 0.04, normal: SIDE };
const palmUp = { pinch: 0.08, grab: 0.04, normal: UP }; // isTalkPose: open hand, roll ≈ 180°

// [time s, pointer NDC | null (no hand), pose]. Values ease between keys.
const sweep = [];
for (let i = 0; i < 8; i += 1) {
  sweep.push([12 + i * 0.5, [at.center[0] + (i % 2 === 0 ? 0.45 : -0.45), at.center[1] + 0.1], open]);
}
const KEYS = [
  [0, null, relaxed],
  [1, null, relaxed],
  [1.01, at.center, relaxed],
  [2.6, at.maya, relaxed],
  [3.4, at.maya, relaxed],
  [3.55, at.maya, pinched],
  [3.75, at.maya, pinched],
  [3.9, at.maya, relaxed],
  [4.8, at.maya, relaxed],
  [5.0, at.maya, pinched],
  [5.3, at.maya, pinched],
  [7.2, at.seat, pinched],
  [7.7, at.seat, pinched],
  [7.9, at.seat, relaxed],
  [9.5, at.hearth, relaxed],
  [10.2, at.hearth, relaxed],
  [10.35, at.hearth, pinched],
  [10.55, at.hearth, pinched],
  [10.7, at.hearth, relaxed],
  [11.5, at.center, open],
  ...sweep,
  [16.2, at.tree, open],
  [17.0, at.tree, shake],
  [19.0, at.tree, shake],
  [19.6, at.tree, relaxed],
  // Hold your palm up to talk: rotate through sideways (like the handshake) so the palm normal
  // never lerps straight between antiparallel vectors, then hold palm-up well past talkHoldMs.
  [20.0, at.center, relaxed],
  [20.15, at.center, open],
  [20.35, at.center, openSide],
  [20.55, at.center, palmUp],
  [21.55, at.center, palmUp],
  [21.75, at.center, openSide],
  [21.95, at.center, relaxed],
  [22.6, at.low, relaxed],
  [22.61, null, relaxed],
  [27, null, relaxed],
];

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpVec = (a, b, t) => a.map((value, index) => lerp(value, b[index], t));
const normalize = (v) => {
  const length = Math.hypot(...v) || 1;
  return v.map((value) => value / length);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (...vectors) => vectors.reduce((sum, v) => sum.map((value, index) => value + v[index]));
const scale = (v, s) => v.map((value) => value * s);

function sample(t) {
  let index = KEYS.findIndex(([time]) => time > t);
  if (index <= 0) index = KEYS.length - 1;
  const [t0, p0, pose0] = KEYS[index - 1];
  const [t1, p1, pose1] = KEYS[index];
  const k = ease(clamp((t - t0) / (t1 - t0), 0, 1));
  if (!p0 || !p1) return null;
  return {
    ndc: lerpVec(p0, p1, k),
    pinch: lerp(pose0.pinch, pose1.pinch, k),
    grab: lerp(pose0.grab, pose1.grab, k),
    normal: normalize(lerpVec(pose0.normal, pose1.normal, k)),
  };
}

function palmFromNdc([x, y]) {
  return [
    lerp(BOX.xMin, BOX.xMax, (x + 1) / 2),
    lerp(BOX.yMin, BOX.yMax, (y + 1) / 2),
    15, // a little toward the user
  ];
}

const FINGERS = [
  // type, lateral offset toward the thumb (mm), length (mm)
  [0, 45, 55],
  [1, 22, 90],
  [2, 2, 95],
  [3, -17, 88],
  [4, -34, 70],
];

function fingertips(palm, normal, direction, pinch, grab) {
  const thumbSide = normalize(cross(direction, normal));
  const meet = add(palm, scale(direction, 55), scale(thumbSide, 25), scale(normal, 20));
  return FINGERS.map(([type, lateral, length]) => {
    let tip = add(palm, scale(thumbSide, lateral), scale(direction, length * (1 - 0.75 * grab)), scale(normal, 30 * grab));
    if (type <= 1) tip = lerpVec(tip, meet, clamp(pinch, 0, 1) * 0.9);
    return tip;
  });
}

const round = (v, digits = 1) => v.map((value) => Number(value.toFixed(digits)));

const lines = [JSON.stringify({ serviceVersion: "synthetic", version: 6 })];
const duration = KEYS[KEYS.length - 1][0];
const startUs = 1_000_000_000;
let previousPalm = null;
for (let frame = 0; frame <= duration * fps; frame += 1) {
  const t = frame / fps;
  const state = sample(t);
  const hands = [];
  const pointables = [];
  if (state) {
    const palm = palmFromNdc(state.ndc);
    const velocity = previousPalm ? scale(add(palm, scale(previousPalm, -1)), fps) : [0, 0, 0];
    previousPalm = palm;
    const direction = [0, 0, -1];
    hands.push({
      id: 1,
      type: "right",
      palmPosition: round(palm),
      palmNormal: round(state.normal, 3),
      palmVelocity: round(velocity),
      direction,
      pinchStrength: Number(state.pinch.toFixed(3)),
      grabStrength: Number(state.grab.toFixed(3)),
    });
    fingertips(palm, state.normal, direction, state.pinch, state.grab).forEach((tip, type) => {
      pointables.push({ id: 10 + type, handId: 1, type, tipPosition: round(tip) });
    });
  } else {
    previousPalm = null;
  }
  lines.push(
    JSON.stringify({
      id: frame + 1,
      timestamp: startUs + Math.round(t * 1e6),
      currentFrameRate: fps,
      hands,
      pointables,
    }),
  );
}

mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, `${lines.join("\n")}\n`);
const fmt = ([x, y]) => `(${x.toFixed(2)}, ${y.toFixed(2)})`;
console.log(`Wrote ${lines.length - 1} frames (${duration}s @ ${fps} fps) to ${args.out}`);
console.log(
  `Aimed at NDC (aspect ${aspect.toFixed(2)}): Maya ${fmt(at.maya)}, seat 0 ${fmt(at.seat)}, hearth ${fmt(at.hearth)}, tree ${fmt(at.tree)}`,
);
