# Leap bridge

A small, pure TypeScript pipeline that turns Ultraleap hand-tracking frames into a BOUNDED "use
observation" — a handful of simple, literal facts about which hand(s) were used and roughly how,
never a claim about the object being held, the force applied, comfort, pain, or accessibility.

```
raw v6 JSON frame ─▶ parseV6Frame ─▶ CompactFrame ─▶ observeSession/createObserver ─▶ UseObservation
```

This module has no dependency on the live socket or DOM: `types.ts`, `parse.ts`, and `observe.ts`
are plain data transforms you can unit test with plain objects. `client.ts` is the only piece that
touches a real WebSocket, and `recorded-session.ts` is a deterministic stand-in for a live capture
for demos and tests.

## Files

- `types.ts` — `Vec3`, `CompactHand`, `CompactFrame`, `RecordedSession`, `LeapStatus`.
- `parse.ts` — `parseV6Frame(raw, sessionStartUs?)`: normalizes one decoded v6 message into a
  `CompactFrame`, or returns `null` if it isn't a tracking frame (the server's version greeting,
  or garbage).
- `observe.ts` — `observeSession(frames)` and `createObserver()`: reduce a sequence of
  `CompactFrame`s to a `UseObservation` (imported from
  `frontend/src/services/contracts.ts`). See "Observation rules" below.
- `client.ts` — `connectLeap({ url?, onFrame, onStatus })`: opens
  `ws://127.0.0.1:6437/v6.json`, sends the two control messages the server requires
  (`{"background":true}`, `{"focused":true}`), and streams `CompactFrame`s. Never throws — if
  `WebSocket` isn't available (SSR, some test environments) or the connection fails, it reports
  `"unavailable"`/`"closed"` through `onStatus` and returns a safe disconnect function.
- `recorded-session.ts` — `recordedOneHandSession`: a deterministic ~3s/30fps session (right hand
  approaches from the front, grips, presses down twice, never lost) generated from a short
  keyframe timeline, not a literal frame dump.
- `index.ts` — re-exports the above.

## Observation rules

All thresholds live as named constants at the top of `observe.ts`.

- **Engagement** — a hand is "engaged" in a frame when `grab >= 0.6` or `pinch >= 0.6`.
- **handsUsed** — `2` if both hands are engaged *simultaneously* in >= 5 frames; else `1` if any
  hand is engaged in >= 5 frames; else however many distinct hands were merely *present* in >= 5
  frames (`0`..`2`).
- **activeHand** — `"both"` when `handsUsed === 2`; otherwise the side with the most engaged
  frames (falling back to the side with the most present frames, then defaulting to `"right"` on
  a full tie); `"none"` when `handsUsed === 0`.
- **approachSide** — dominant axis of the active hand's palm displacement from its first
  appearance to its first engaged frame, only if that displacement exceeds 30mm on the dominant
  axis: `-z` → `"front"` (toward the device), `+x` → `"left"` (came from the user's left), `-x` →
  `"right"`, `-y` → `"top"`; anything smaller, or a dominant axis/sign not listed, is `"unknown"`.
- **spanBand** — median thumb-tip → pinky-tip distance over the active hand's engaged frames:
  `< 80mm` → `"narrow"`, `80–130mm` → `"medium"`, `> 130mm` → `"wide"`, `"unknown"` if there's no
  fingertip data.
- **regraspObserved** — the active hand's `grab` rose to `>= 0.7`, dropped below `0.3`, then rose
  to `>= 0.7` again.
- **trackingLossCount** — how many times *some* hand went from present to fully absent (0 hands
  in frame) and later reappeared. A gap that never reappears (the session just ends) doesn't
  count.

When two hands both qualify as "used" (`activeHand === "both"`), `approachSide`/`spanBand`/
`regraspObserved` are computed from whichever hand engaged first — the rules are inherently
single-hand, so we pick one rather than average across two different hands.

## Not covered here

This module intentionally stops at hand geometry. It does not and should not attempt to identify
what object (if any) is being held, estimate grip force, or infer comfort, pain, or accessibility
— none of those are recoverable from palm/finger positions and velocities alone. Downstream
consumers (see `UseObservationInput` in `frontend/src/services/contracts.ts`) are expected to
combine this bounded observation with human judgment (a `classification` of
`required`/`preferred`/`incidental`), not treat it as a verdict on its own.

## Usage

```ts
import { connectLeap, createObserver, recordedOneHandSession, observeSession } from "./leap-bridge";

// Live:
const observer = createObserver();
const disconnect = connectLeap({
  onFrame: (frame) => observer.push(frame),
  onStatus: (status) => console.log("leap:", status),
});
// later: observer.result(); disconnect();

// Recorded:
const observation = observeSession(recordedOneHandSession.frames);
```
