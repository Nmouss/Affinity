"use client";

import { useEffect, useState } from "react";
import { ProductImage, ScreenHeading } from "@/components/mission/common";
import type { ComparisonChoice, Product } from "@/lib/mission/services/contracts";
import type { Controller } from "@/lib/mission/state/controller";
import { AXIS_SUMMARY, money, poleLabel, ruleEffect, signalStrength } from "@/lib/mission/state/labels";
import type { AppState, ChoiceFeedback } from "@/lib/mission/state/machine";
import { PushToTalk } from "@/components/mission/voice/PushToTalk";

interface ScreenProps {
  state: AppState;
  actions: Controller;
  /** Latest Leap swipe, if a controller is connected; buttons stay visible regardless. */
  leapSwipe?: { direction: "left" | "right"; at: number } | null;
}

const FACT_SKIP = new Set(["containsFragileGlass"]);

function Facts({ product }: { product: Product }) {
  const facts = Object.entries(product.facts).filter(([k]) => !FACT_SKIP.has(k));
  return (
    <ul className="facts">
      <li>{money(product.price)}</li>
      {facts.map(([k, v]) => (
        <li key={k}>{formatFact(k, v)}</li>
      ))}
    </ul>
  );
}

function formatFact(key: string, value: string | number | boolean) {
  const label = key.replace(/([A-Z])/g, " $1").toLowerCase();
  if (typeof value === "boolean") return `${label}: ${value ? "yes" : "no"}`;
  return `${label}: ${value}`;
}

export function feedbackText(feedback: ChoiceFeedback) {
  if (feedback.choice === "skip") return "Skipped — nothing learned.";
  if (!feedback.learnedAxis) return "Neither — no signal recorded.";
  return `${poleLabel(feedback.learnedAxis, feedback.direction)} +1 signal`;
}

/** Local grammar for this screen only ("left", "right", …); not a backend intent. */
function matchSpoken(text: string): ComparisonChoice | "difference" | null {
  const t = text.toLowerCase();
  if (/\b(difference|different)\b/.test(t)) return "difference";
  if (/\bneither\b|\bnone\b/.test(t)) return "neither";
  if (/\bskip\b/.test(t)) return "skip";
  if (/\b(left|first|product a|a)\b/.test(t)) return "left";
  if (/\b(right|second|product b|b)\b/.test(t)) return "right";
  return null;
}

export function QuickChoicesScreen({ state, actions, leapSwipe }: ScreenProps) {
  const pair = state.pairs[state.choiceIndex];
  const products = state.catalog?.products ?? [];
  const left = products.find((p) => p.id === pair?.leftProductId);
  const right = products.find((p) => p.id === pair?.rightProductId);
  const [showDifference, setShowDifference] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const last = state.choices[state.choices.length - 1];
  const busy = Boolean(state.busy);

  useEffect(() => setShowDifference(false), [state.choiceIndex]);

  useEffect(() => {
    if (leapSwipe && !busy) actions.choose(leapSwipe.direction === "left" ? "left" : "right");
    // Only react to a new swipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leapSwipe?.at]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      const map: Record<string, ComparisonChoice> = { ArrowLeft: "left", a: "left", ArrowRight: "right", b: "right", n: "neither", ArrowDown: "neither", s: "skip" };
      const choice = map[e.key];
      if (choice) {
        e.preventDefault();
        actions.choose(choice);
      } else if (e.key === "d") setShowDifference(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  if (!pair || !left || !right) return null;

  return (
    <section className="screen quick">
      <p className="eyebrow">Quick choices · {state.choiceIndex + 1} of {state.pairs.length}</p>
      <ScreenHeading>For this cabin trip, which would you put in the cart?</ScreenHeading>
      <div className="progress" aria-hidden="true">
        {state.pairs.map((p, i) => (
          <span key={p.pairId} className={i < state.choiceIndex ? "is-done" : i === state.choiceIndex ? "is-current" : ""} />
        ))}
      </div>

      <div className="pair" aria-live="off">
        <article className="pair__card" aria-label={`Product A: ${left.name}`}>
          <span className="pair__tag">A</span>
          <ProductImage product={left} size={160} />
          <h2>{left.name}</h2>
          <Facts product={left} />
        </article>
        <article className="pair__card" aria-label={`Product B: ${right.name}`}>
          <span className="pair__tag">B</span>
          <ProductImage product={right} size={160} />
          <h2>{right.name}</h2>
          <Facts product={right} />
        </article>
      </div>

      <div className="choice-controls" role="group" aria-label="Your choice">
        <button type="button" className="btn btn--large btn--choice" disabled={busy} onClick={() => actions.choose("left")}>
          <span aria-hidden="true">←</span> Product A
        </button>
        <button type="button" className="btn btn--large" disabled={busy} onClick={() => actions.choose("neither")}>
          Neither
        </button>
        <button type="button" className="btn btn--large btn--choice" disabled={busy} onClick={() => actions.choose("right")}>
          Product B <span aria-hidden="true">→</span>
        </button>
        <button type="button" className="btn btn--large btn--ghost" disabled={busy} onClick={() => actions.choose("skip")}>
          Skip
        </button>
      </div>

      <div className="row row--center">
        <button type="button" className="link" aria-expanded={showDifference} onClick={() => setShowDifference((v) => !v)}>
          Tell me the difference
        </button>
        <PushToTalk
          compact
          label="Hold to say left, right, neither, or skip"
          onTranscript={(text, source) => {
            if (source === "demo") return;
            setHeard(text);
            const match = matchSpoken(text);
            if (match === "difference") setShowDifference(true);
            else if (match) actions.choose(match);
          }}
        />
      </div>
      {heard && <p className="caption">You said: “{heard}”</p>}
      {showDifference && <p className="banner banner--info">{pair.difference}</p>}

      <div className="learning" role="status" aria-live="polite">
        {last && (
          <>
            <span className="learning__title">Learning your cabin taste…</span>{" "}
            <span className={last.learnedAxis ? "learning__signal" : "learning__none"}>{feedbackText(last)}</span>
          </>
        )}
      </div>
      <p className="kbd-hint">Keys: ← A · → B · N neither · S skip · D difference. Leap: swipe left or right.</p>
    </section>
  );
}

export function ProfileScreen({ state, actions }: ScreenProps) {
  const shopper = state.shopper;
  if (!shopper) return null;
  const axes = state.pairs.map((p) => p.axis);
  const buckets = { strong: [] as string[], weak: [] as string[], unknown: [] as string[] };
  for (const axis of axes) buckets[signalStrength(shopper, axis)].push(axis);
  const describe = (axis: string) => {
    const preference = shopper.preferences[axis] ?? 0;
    const [pos, neg, unknown] = AXIS_SUMMARY[axis] ?? [axis, axis, axis];
    return preference > 0 ? pos : preference < 0 ? neg : unknown;
  };
  const evidence = (axis: string) => {
    const n = shopper.evidenceCounts[axis] ?? 0;
    return `${n} ${n === 1 ? "choice" : "choices"}`;
  };
  const choicesMade = state.choices.length;

  return (
    <section className="screen screen--narrow profile">
      <ScreenHeading>Here’s my first read</ScreenHeading>
      <p className="supporting">Based on {choicesMade} cabin-shopping {choicesMade === 1 ? "choice" : "choices"}</p>

      <section aria-labelledby="taste-heading" className="profile__taste">
        <h2 id="taste-heading" className="subhead">Taste (learned from choices)</h2>
        {(["strong", "weak", "unknown"] as const).map((bucket) =>
          buckets[bucket].length ? (
            <div key={bucket} className={`signal-group signal-group--${bucket}`}>
              <h3>{bucket === "strong" ? "Strong signal" : bucket === "weak" ? "Weak signal" : "Still unknown"}</h3>
              <ul>
                {buckets[bucket].map((axis) => (
                  <li key={axis}>
                    {describe(axis)}
                    <span className="evidence"> · Evidence: {evidence(axis)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </section>

      <section aria-labelledby="rule-heading" className="profile__rules">
        <h2 id="rule-heading" className="subhead">Your rule (only changes when you edit it)</h2>
        <ul>
          {shopper.rules.length ? shopper.rules.map((r) => <li key={r}>{ruleEffect(r)}</li>) : <li>No rule</li>}
        </ul>
      </section>

      <p className="supporting">This is a starting point, not a permanent personality.</p>
      <ul className="privacy">
        <li>Save confirmed traits only</li>
        <li>Raw gestures are not stored</li>
      </ul>
      <div className="row">
        <button type="button" className="btn btn--primary btn--large" disabled={Boolean(state.busy)} onClick={actions.confirmProfile}>
          Looks right
        </button>
        <button type="button" className="btn" onClick={actions.editProfile}>Edit</button>
      </div>
    </section>
  );
}
