"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BundlePreview } from "@/components/bundle/BundlePreview";
import { HappinessMeter } from "@/components/bundle/HappinessMeter";
import { ProductPanel } from "@/components/bundle/ProductPanel";
import { ConstraintBoard } from "@/components/constraints/ConstraintBoard";
import { GestureStatus } from "@/components/controls/GestureStatus";
import { MandateButton } from "@/components/controls/MandateButton";
import { MissionForm } from "@/components/council/MissionForm";
import { ProfileCard } from "@/components/sprites/ProfileCard";
import { PlazaButton } from "@/components/ui";
import { hasSavedRoster, usePeople, useRosterHydration } from "@/lib/people/roster";
import { DEFAULT_BUDGET } from "@/lib/director/mission";
import { useDirector } from "@/lib/director/useDirector";
import { isTreeBundle } from "@/lib/product/media";
import { emitGesture } from "@/lib/stage/bus";
import { CATALOG, participantIds } from "@/lib/stage/slices/council";
import { useStage } from "@/lib/stage/store";
import type { StagePhase } from "@/types/stage";
import { InviteChips } from "./InviteChips";
import { ReasoningPanel } from "./ReasoningPanel";
import { Receipt } from "./Receipt";
import live from "./LiveCouncil.module.css";
import styles from "./Hud.module.css";

const CAPTIONS: Record<StagePhase, string> = {
  lobby: "",
  convening: "The council is gathering by the hearth…",
  opinions: "Each character shares what matters to them",
  merge: "Weighing wishes against the house rules",
  deliberating: "The characters talk it over",
  conflict: "A house rule vetoes a wish",
  searching: "The shopper is out looking",
  bundle: "The shopper brings back a pick within budget",
  scoring: "The council scores the pick",
  revising: "Not quite right yet; the council is looking again",
  awaitMandate: "Look it over, then hold a handshake to approve",
  signing: "Sending your approval to the council…",
  preflight: "Checking prices and stock with the shop…",
  receipt: "",
  checkout: "",
};

const ERROR_TIMEOUT_MS = 4500;

/** Phases after which no more scores arrive. */
const SETTLED: readonly StagePhase[] = ["awaitMandate", "signing", "preflight", "receipt", "checkout"];

/** Phases where the proposal panel stays up on the left. */
const SHOWS_CART: readonly StagePhase[] = ["bundle", "scoring", "revising", "awaitMandate", "signing", "preflight", "receipt", "checkout"];

// Lab-only leva sliders; loaded on demand so leva stays out of the main bundle.
const BeatTuner = dynamic(() => import("./BeatTuner").then((module) => module.BeatTuner), { ssr: false });

// DOM overlay around the edges of the room: panels hug the sides so the council ring stays clear.
// Mounting the Hud mounts the director.
export function Hud() {
  useRosterHydration();
  const { director, flags } = useDirector();
  const people = usePeople();
  const [showMakerHint, setShowMakerHint] = useState(false);
  const phase = useStage((state) => state.phase);
  const sprites = useStage((state) => state.sprites);
  const opinions = useStage((state) => state.opinions);
  const mission = useStage((state) => state.mission);
  const constraints = useStage((state) => state.constraints);
  const veto = useStage((state) => state.veto);
  const conflict = useStage((state) => state.conflict);
  const bundle = useStage((state) => state.bundle);
  const scores = useStage((state) => state.scores);
  const mandate = useStage((state) => state.mandate);
  const receipt = useStage((state) => state.receipt);
  const carts = useStage((state) => state.carts);
  const runStatus = useStage((state) => state.runStatus);
  const reasoningVisible = useStage((state) => state.reasoningVisible);
  const profileOpenId = useStage((state) => state.profileOpenId);
  const councilSource = useStage((state) => state.councilSource);
  const error = useStage((state) => state.error);
  const retryable = useStage((state) => state.retryable);
  const notice = useStage((state) => state.notice);

  // Passing errors fade; a retryable one stays until the user acts on it.
  useEffect(() => {
    if (!error || retryable) return;
    const timer = window.setTimeout(() => useStage.getState().setError(null), ERROR_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [error, retryable]);

  // Nothing saved yet (a fresh browser): point new visitors at the People Maker once.
  useEffect(() => setShowMakerHint(!hasSavedRoster()), []);

  const closeProfile = useCallback(() => useStage.getState().openProfile(null), []);
  const approve = useCallback(() => emitGesture({ type: "handshakeComplete" }), []);

  const openProfile = people.find((profile) => profile.id === profileOpenId);
  const participants = participantIds({ sprites, opinions, mission });
  const showBoard = phase !== "lobby" && phase !== "receipt" && phase !== "checkout" && (constraints !== null || Object.keys(opinions).length > 0);
  const caption = CAPTIONS[phase];
  const budget = mission?.budget ?? DEFAULT_BUDGET;
  const showCart = bundle !== null && SHOWS_CART.includes(phase);
  const treeBundle = bundle !== null && isTreeBundle(bundle);
  const finished = (phase === "receipt" || phase === "checkout") && receipt !== null;

  return (
    <div className={styles.hud}>
      {director && flags?.lab && <BeatTuner director={director} />}

      <header className={styles.top}>
        <strong className={styles.brand}>Affinity</strong>
        {flags?.lab && <span className={styles.phase}>{phase}</span>}
        {councilSource && (
          <span className={councilSource === "live" ? styles.pipLive : styles.pipReplay} title="Where the council is running">
            {councilSource === "live" ? "Live council" : "Demo replay"}
          </span>
        )}
        {flags?.cut90 && <span className={styles.badge}>90 s cut</span>}
        <span className={styles.gesture}>
          <GestureStatus />
        </span>
      </header>

      <nav className={flags?.lab ? styles.actionsLab : styles.actions} aria-label="Stage controls">
        <button
          type="button"
          className={styles.action}
          aria-pressed={reasoningVisible}
          onClick={() => emitGesture({ type: "toggleReasoning" })}
        >
          Reasoning <span className={styles.kbd}>D</span>
        </button>
        <button type="button" className={styles.action} onClick={() => emitGesture({ type: "reset" })}>
          Reset <span className={styles.kbd}>R</span>
        </button>
      </nav>

      {error && (
        <div className={`${styles.toast} ${live.toastRow}`} role="alert">
          <span>{error}</span>
          {retryable && (
            <span className={live.toastActions}>
              <PlazaButton variant="primary" onClick={() => emitGesture({ type: "retry" })}>
                Try again
              </PlazaButton>
              <PlazaButton variant="ghost" onClick={() => emitGesture({ type: "reset" })}>
                Start over
              </PlazaButton>
            </span>
          )}
        </div>
      )}

      <div className={styles.left}>
        {showCart && bundle && (
          <section className={styles.cart} aria-label="Proposal and happiness">
            <h2 className={styles.title}>{treeBundle ? "Cart" : "The council's pick"}</h2>
            {treeBundle ? (
              <BundlePreview bundle={bundle} budget={budget} family={people} />
            ) : (
              <div className={live.products}>
                {bundle.items.map((item) => (
                  <ProductPanel key={item.id} item={item} bundle={bundle} budget={budget} />
                ))}
              </div>
            )}
            <div className={styles.meters}>
              {participants.map((id) => {
                const profile = people.find((member) => member.id === id);
                return (
                  <HappinessMeter
                    key={id}
                    name={profile?.name ?? id}
                    color={profile?.colors[0] ?? "#ffd18a"}
                    score={scores[id]?.score ?? null}
                    say={scores[id]?.say}
                    pending={!SETTLED.includes(phase)}
                  />
                );
              })}
            </div>
          </section>
        )}
        {reasoningVisible && <ReasoningPanel />}
      </div>

      <div className={styles.right}>
        {phase === "lobby" && openProfile && <ProfileCard profile={openProfile} onClose={closeProfile} />}
        {showBoard && (
          <ConstraintBoard
            constraints={constraints}
            opinions={opinions}
            veto={veto}
            conflict={conflict}
            family={people}
            catalog={CATALOG}
          />
        )}
        {finished && receipt && <Receipt receipt={receipt} carts={carts} mandate={mandate} mission={mission} runStatus={runStatus} />}
      </div>

      <div className={styles.bottom}>
        {phase === "lobby" && (
          <>
            <div className={styles.makerRow}>
              <Link href="/create" className={styles.makerLink}>
                People Maker
              </Link>
              {showMakerHint && <span className={styles.hint}>Make your family and friends in the People Maker</span>}
            </div>
            <InviteChips />
            <MissionForm />
          </>
        )}
        {notice && (
          <p className={live.notice} role="status">
            {notice}
          </p>
        )}
        {caption && <p className={styles.caption}>{caption}</p>}
        {phase === "awaitMandate" && (
          <div className={`${styles.mandate} ${live.mandateRow}`}>
            <MandateButton onApprove={approve} />
            <PlazaButton variant="ghost" onClick={() => emitGesture({ type: "reject" })} aria-label="Decline this proposal">
              Decline
            </PlazaButton>
          </div>
        )}
      </div>
    </div>
  );
}
