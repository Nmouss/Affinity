import { useCallback, useEffect, useRef, useState } from "react";
import { type CompactFrame, createObserver, observeSession, recordedOneHandSession } from "../../../leap-bridge";
import { ScreenHeading } from "../components/common";
import type { UseObservation } from "../services/contracts";
import type { Controller } from "../state/controller";
import type { AppState } from "../state/machine";
import { useLeapFrames, useLeapStatus } from "../leap/leapStore";

interface ScreenProps {
  state: AppState;
  actions: Controller;
}

const CAPTURE_MS = 4000;
const MIN_LIVE_FRAMES = 30;

export function describeObservation(o: UseObservation) {
  if (o.handsUsed === 0) return "We didn’t see a hand interact.";
  if (o.handsUsed === 2) return "We observed two-handed use.";
  return `We observed one-handed use${o.activeHand === "left" || o.activeHand === "right" ? ` (${o.activeHand} hand)` : ""}.`;
}

/** Screen 9. Observation is bounded to hand count and motion; only the user's answer changes the profile. */
export function LeapCheckScreen({ state, actions }: ScreenProps) {
  const check = state.leapCheck;
  const status = useLeapStatus();
  const product = state.catalog?.products.find((p) => p.id === check?.productId);
  const [frame, setFrame] = useState<CompactFrame | null>(null);
  const [unstable, setUnstable] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const observer = useRef(createObserver());
  const capturingLive = check?.phase === "capturing" && check.source === "live";
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  // The buttons that produced an observation or an answer unmount; move focus to the outcome text.
  useEffect(() => {
    if (check?.phase === "observed" || check?.phase === "saved") outcomeRef.current?.focus();
  }, [check?.phase]);

  const onFrame = useCallback((f: CompactFrame) => {
    observer.current.push(f);
    setFrame(f);
  }, []);
  useLeapFrames(capturingLive ? onFrame : null);

  // Live capture: fixed window, then observe; fall back when tracking is too sparse.
  useEffect(() => {
    if (!capturingLive) return;
    observer.current.reset();
    setUnstable(false);
    const started = performance.now();
    const tick = setInterval(() => setRemaining(Math.max(0, CAPTURE_MS - (performance.now() - started))), 200);
    const done = setTimeout(() => {
      clearInterval(tick);
      if (observer.current.frameCount() < MIN_LIVE_FRAMES) {
        setUnstable(true);
        actions.leapCapturing("manual");
        return;
      }
      actions.leapObserved(observer.current.result(), "live");
    }, CAPTURE_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [capturingLive, actions]);

  // Recorded playback: replay the skeleton, labeled as a recording, then observe the same frames.
  useEffect(() => {
    if (check?.phase !== "capturing" || check.source !== "recorded") return;
    const frames = recordedOneHandSession.frames;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || frames.length === 0) {
      actions.leapObserved(observeSession(frames), "recorded");
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      setFrame(frames[i]);
      i += 2;
      if (i >= frames.length) {
        clearInterval(timer);
        actions.leapObserved(observeSession(frames), "recorded");
      }
    }, 66);
    return () => clearInterval(timer);
  }, [check?.phase, check?.source, actions]);

  if (!check) return null;
  const liveReady = status === "open";
  const manual = (observation: UseObservation) => actions.leapObserved(observation, "manual");

  return (
    <section className="screen screen--narrow leap">
      <p className="eyebrow">Optional interaction check · {product?.name}</p>
      <ScreenHeading>How do you naturally use it?</ScreenHeading>

      {(check.phase === "offer" || (check.phase === "capturing" && check.source === "manual")) && (
        <>
          {unstable && (
            <p className="banner banner--warn" role="alert">
              Tracking was unstable, so nothing was observed. Play the recorded session or answer with the buttons below.
            </p>
          )}
          <p>Hold your hand over the sensor and mime using the {product?.facts.control ?? "control"}. We only look at how many hands you use and how you approach it.</p>
          <div className="row">
            <button type="button" className="btn btn--primary btn--large" disabled={!liveReady} onClick={() => actions.leapCapturing("live")}>
              Start live check
            </button>
            <button type="button" className="btn btn--large" onClick={() => actions.leapCapturing("recorded")}>
              Play recorded session
            </button>
          </div>
          {!liveReady && <p className="caption">Leap controller not connected ({status}). Use the recorded session or the buttons.</p>}
          <fieldset className="manual">
            <legend className="label">Or tell us directly</legend>
            <div className="row">
              <button type="button" className="btn" onClick={() => manual({ handsUsed: 1, activeHand: "right", approachSide: "unknown", spanBand: "unknown", regraspObserved: false, trackingLossCount: 0 })}>
                One hand (right)
              </button>
              <button type="button" className="btn" onClick={() => manual({ handsUsed: 1, activeHand: "left", approachSide: "unknown", spanBand: "unknown", regraspObserved: false, trackingLossCount: 0 })}>
                One hand (left)
              </button>
              <button type="button" className="btn" onClick={() => manual({ handsUsed: 2, activeHand: "both", approachSide: "unknown", spanBand: "unknown", regraspObserved: false, trackingLossCount: 0 })}>
                Both hands
              </button>
            </div>
          </fieldset>
          <button type="button" className="btn btn--ghost" onClick={actions.leaveLeapCheck}>Cancel</button>
        </>
      )}

      {check.phase === "capturing" && check.source !== "manual" && (
        <div className="capture">
          <p className={`tag ${check.source === "recorded" ? "tag--warn" : "tag--ok"}`} role="status">
            {check.source === "recorded" ? "Recorded session — not live" : `Live · ${Math.ceil(remaining / 1000)} s`}
          </p>
          <Skeleton frame={frame} />
        </div>
      )}

      {(check.phase === "observed" || check.phase === "saved") && check.observation && (
        <div className="observed">
          <p ref={check.phase === "observed" ? outcomeRef : undefined} tabIndex={-1} className="observed__headline" role="status">{describeObservation(check.observation)}</p>
          {check.source === "recorded" && <p className="tag tag--warn">From the recorded session, not live tracking</p>}
          {check.source === "manual" && <p className="tag tag--info">From your answer, not tracking</p>}
          {check.source === "live" && <p className="tag tag--ok">From live tracking</p>}
          <dl className="observed__facts">
            <dt>Hands used</dt><dd>{check.observation.handsUsed}</dd>
            <dt>Active hand</dt><dd>{check.observation.activeHand}</dd>
            <dt>Approach</dt><dd>{check.observation.approachSide}</dd>
            <dt>Hand span</dt><dd>{check.observation.spanBand}</dd>
            <dt>Regrasp</dt><dd>{check.observation.regraspObserved ? "yes" : "no"}</dd>
            <dt>Tracking losses</dt><dd>{check.observation.trackingLossCount}</dd>
          </dl>
          <p className="caption">Affinity only sees hand count and motion. It doesn’t recognize objects or measure force, comfort, or pain.</p>

          {check.phase === "observed" && check.observation.handsUsed > 0 && (
            <>
              <h2 className="subhead" id="classify-q">Was that:</h2>
              <div className="row" role="group" aria-labelledby="classify-q">
                <button type="button" className="btn btn--large" disabled={Boolean(state.busy)} onClick={() => actions.classifyObservation("required")}>Required</button>
                <button type="button" className="btn btn--large" disabled={Boolean(state.busy)} onClick={() => actions.classifyObservation("preferred")}>Preferred</button>
                <button type="button" className="btn btn--large" disabled={Boolean(state.busy)} onClick={() => actions.classifyObservation("incidental")}>Just what happened</button>
              </div>
              <p className="caption">Nothing is saved until you answer.</p>
            </>
          )}
          {check.phase === "observed" && check.observation.handsUsed === 0 && (
            <button type="button" className="btn" onClick={() => actions.startLeapCheck(check.productId)}>Try again</button>
          )}

          {check.phase === "saved" && (
            <>
              <p ref={outcomeRef} tabIndex={-1} className="banner banner--ok" role="status">
                {check.classification === "required"
                  ? `Saved: ${check.observation.handsUsed === 1 ? "one-hand" : "two-hand"} operation is now a confirmed requirement for you.`
                  : check.classification === "preferred"
                    ? `Saved: you prefer ${check.observation.handsUsed === 1 ? "one-hand" : "two-hand"} operation. It won’t block products.`
                    : "Nothing was saved. That was just what happened."}
              </p>
              <div className="row">
                <button type="button" className="btn btn--primary btn--large" onClick={() => actions.findSavings()}>Continue: look for savings</button>
                <button type="button" className="btn" onClick={actions.leaveLeapCheck}>Back to mission</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Top-down hand view: palms and fingertips projected onto x/z. Not a claim about the object. */
function Skeleton({ frame }: { frame: CompactFrame | null }) {
  const toX = (x: number) => 150 + x * 0.9;
  const toY = (z: number) => 110 + z * 0.9;
  return (
    <svg className="skeleton" viewBox="0 0 300 220" role="img" aria-label={frame ? `${frame.hands.length} hand${frame.hands.length === 1 ? "" : "s"} tracked` : "Waiting for hands"}>
      <rect x="1" y="1" width="298" height="218" rx="12" className="skeleton__bg" />
      {frame?.hands.map((hand, i) => (
        <g key={i} className={`skeleton__hand skeleton__hand--${hand.side}`}>
          {hand.fingertips.map((tip, j) => (
            <line key={j} x1={toX(hand.palm[0])} y1={toY(hand.palm[2])} x2={toX(tip[0])} y2={toY(tip[2])} />
          ))}
          <circle cx={toX(hand.palm[0])} cy={toY(hand.palm[2])} r={10 + hand.grab * 6} />
          {hand.fingertips.map((tip, j) => (
            <circle key={`t${j}`} cx={toX(tip[0])} cy={toY(tip[2])} r={4} />
          ))}
        </g>
      ))}
      {!frame?.hands.length && <text x="150" y="115" textAnchor="middle" className="skeleton__empty">Waiting for hands…</text>}
    </svg>
  );
}
