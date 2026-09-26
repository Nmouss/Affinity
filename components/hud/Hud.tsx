"use client";

import { useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { BundlePreview } from "@/components/bundle/BundlePreview";
import { HappinessMeter } from "@/components/bundle/HappinessMeter";
import { ConstraintBoard } from "@/components/constraints/ConstraintBoard";
import { GestureStatus } from "@/components/controls/GestureStatus";
import { MandateButton } from "@/components/controls/MandateButton";
import { MissionForm } from "@/components/council/MissionForm";
import { ProfileCard } from "@/components/sprites/ProfileCard";
import { DEFAULT_BUDGET } from "@/lib/director/mission";
import { useDirector } from "@/lib/director/useDirector";
import { emitGesture } from "@/lib/stage/bus";
import { CATALOG, FAMILY, participantIds } from "@/lib/stage/slices/council";
import { useStage } from "@/lib/stage/store";
import type { StagePhase } from "@/types/stage";
import { InviteChips } from "./InviteChips";
import { ReasoningPanel } from "./ReasoningPanel";
import { Receipt } from "./Receipt";
import styles from "./Hud.module.css";

const CAPTIONS: Record<StagePhase, string> = {
  lobby: "",
  convening: "The council is gathering by the hearth…",
  opinions: "Each sprite shares what matters to them",
  merge: "Merging wishes with house rules",
  conflict: "A house rule vetoes a wish",
  bundle: "The shopper builds a cart within budget",
  scoring: "The council scores the cart",
  awaitMandate: "Look it over, then hold a handshake to approve",
  signing: "Signing the cart mandate…",
  receipt: "",
};

const ERROR_TIMEOUT_MS = 4500;

/** Phases after which no more scores arrive. */
const SETTLED: readonly StagePhase[] = ["awaitMandate", "signing", "receipt"];

// Lab-only leva sliders; loaded on demand so leva stays out of the main bundle.
const BeatTuner = dynamic(() => import("./BeatTuner").then((module) => module.BeatTuner), { ssr: false });

// DOM overlay around the edges of the room: panels hug the sides so the council ring stays clear.
// Mounting the Hud mounts the director.
export function Hud() {
  const { director, flags } = useDirector();
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
  const receiptId = useStage((state) => state.receiptId);
  const reasoningVisible = useStage((state) => state.reasoningVisible);
  const profileOpenId = useStage((state) => state.profileOpenId);
  const councilSource = useStage((state) => state.councilSource);
  const error = useStage((state) => state.error);
  const handSource = useStage((state) => state.hand.source);
  const handPresent = useStage((state) => state.hand.present);
  const hoverTarget = useStage((state) => state.hand.hoverTarget);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => useStage.getState().setError(null), ERROR_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  const closeProfile = useCallback(() => useStage.getState().openProfile(null), []);
  const approve = useCallback(() => emitGesture({ type: "handshakeComplete" }), []);

  const openProfile = FAMILY.find((profile) => profile.id === profileOpenId);
  const participants = participantIds({ sprites, opinions, mission });
  const showBoard = phase !== "lobby" && phase !== "receipt" && (constraints !== null || Object.keys(opinions).length > 0);
  const caption = CAPTIONS[phase];

  return (
    <div className={styles.hud}>
      {director && flags?.lab && <BeatTuner director={director} />}

      <header className={styles.top}>
        <strong className={styles.brand}>Affinity</strong>
        <span className={styles.phase}>{phase}</span>
        {councilSource && (
          <span className={councilSource === "live" ? styles.pipLive : styles.pipReplay} title="Council source">
            {councilSource === "live" ? "live council" : "replay"}
          </span>
        )}
        {flags?.cut90 && <span className={styles.badge}>90 s cut</span>}
        <span className={styles.gesture}>
          <GestureStatus connected={handPresent && handSource !== "keyboard"} gesture={hoverTarget ?? undefined} />
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
        <p className={styles.toast} role="alert">
          {error}
        </p>
      )}

      <div className={styles.left}>
        {bundle && (
          <section className={styles.cart} aria-label="Cart and happiness">
            <h2 className={styles.title}>Cart</h2>
            <BundlePreview bundle={bundle} budget={mission?.budget ?? DEFAULT_BUDGET} family={FAMILY} />
            <div className={styles.meters}>
              {participants.map((id) => {
                const profile = FAMILY.find((member) => member.id === id);
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
            family={FAMILY}
            catalog={CATALOG}
          />
        )}
        {phase === "receipt" && mandate && receiptId && <Receipt receiptId={receiptId} mandate={mandate} />}
      </div>

      <div className={styles.bottom}>
        {phase === "lobby" && (
          <>
            <InviteChips />
            <MissionForm />
          </>
        )}
        {caption && <p className={styles.caption}>{caption}</p>}
        {phase === "awaitMandate" && (
          <div className={styles.mandate}>
            <MandateButton onApprove={approve} />
          </div>
        )}
      </div>
    </div>
  );
}
