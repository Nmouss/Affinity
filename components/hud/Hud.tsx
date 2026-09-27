"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BundlePreview } from "@/components/bundle/BundlePreview";
import { HappinessMeter } from "@/components/bundle/HappinessMeter";
import { GestureStatus } from "@/components/controls/GestureStatus";
import { MandateButton } from "@/components/controls/MandateButton";
import { MissionForm } from "@/components/council/MissionForm";
import { PlanPreview } from "@/components/plan/PlanPreview";
import { ProfileCard } from "@/components/sprites/ProfileCard";
import { hasSavedRoster, usePeople, useRosterHydration } from "@/lib/people/roster";
import { DEFAULT_BUDGET } from "@/lib/director/mission";
import { useDirector } from "@/lib/director/useDirector";
import { emitGesture } from "@/lib/stage/bus";
import { participantIds } from "@/lib/stage/slices/council";
import { useStage } from "@/lib/stage/store";
import type { StagePhase } from "@/types/stage";
import { InviteChips } from "./InviteChips";
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

/** Phases where the council is actively working, shown as a persistent "still talking" banner. */
const DELIBERATING: readonly StagePhase[] = ["convening", "opinions", "merge", "conflict", "bundle", "scoring"];

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
  const bundle = useStage((state) => state.bundle);
  const plan = useStage((state) => state.plan);
  const searchPlan = useStage((state) => state.searchPlan);
  const scores = useStage((state) => state.scores);
  const mandate = useStage((state) => state.mandate);
  const receipt = useStage((state) => state.receipt);
  const carts = useStage((state) => state.carts);
  const notifications = useStage((state) => state.notifications);
  const preflight = useStage((state) => state.preflight);
  const repair = useStage((state) => state.repair);
  const profileOpenId = useStage((state) => state.profileOpenId);
  const error = useStage((state) => state.error);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => useStage.getState().setError(null), ERROR_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  // Nothing saved yet (a fresh browser): point new visitors at the People Maker once.
  useEffect(() => setShowMakerHint(!hasSavedRoster()), []);

  const closeProfile = useCallback(() => useStage.getState().openProfile(null), []);
  const approve = useCallback(() => emitGesture({ type: "handshakeComplete" }), []);

  const [swapping, setSwapping] = useState<string | null>(null);
  useEffect(() => {
    setSwapping(null);
  }, [bundle, plan]);
  const handleSwap = useCallback(
    (itemId: string) => {
      if (!director) return;
      setSwapping(itemId);
      void director.swapItem(itemId);
    },
    [director],
  );

  const openProfile = people.find((profile) => profile.id === profileOpenId);
  const participants = participantIds({ sprites, opinions, mission });
  const caption = CAPTIONS[phase];
  const deliberating = DELIBERATING.includes(phase);

  return (
    <div className={styles.hud}>
      {director && flags?.lab && <BeatTuner director={director} />}

      <header className={styles.top}>
        <strong className={styles.brand}>Affinity</strong>
        <span className={styles.phase}>{phase}</span>
        {flags?.cut90 && <span className={styles.badge}>90 s cut</span>}
        <span className={styles.gesture}>
          <GestureStatus />
        </span>
      </header>

      <nav className={flags?.lab ? styles.actionsLab : styles.actions} aria-label="Stage controls">
        <button type="button" className={styles.action} onClick={() => emitGesture({ type: "reset" })}>
          Reset <span className={styles.kbd}>R</span>
        </button>
      </nav>

      {deliberating && (
        <div className={styles.deliberating} role="status">
          <span className={styles.deliberatingDot} />
          The council is deliberating…
        </div>
      )}

      {error && (
        <p className={styles.toast} role="alert">
          {error}
        </p>
      )}

      <div className={styles.left}>
        {bundle && !plan && (
          <section className={styles.cart} aria-label="Cart and happiness">
            <h2 className={styles.title}>Cart</h2>
            <BundlePreview
              bundle={bundle}
              budget={mission?.budget ?? DEFAULT_BUDGET}
              family={people}
              onSwap={handleSwap}
              swapping={swapping}
            />
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
        {plan && (
          <section className={styles.cart} aria-label="Plan and happiness">
            <h2 className={styles.title}>Plan</h2>
            <PlanPreview plan={plan} family={people} onSwap={handleSwap} swapping={swapping} />
            <div className={styles.meters}>
              {participants.map((id) => {
                const profile = people.find((member) => member.id === id);
                return <HappinessMeter key={id} name={profile?.name ?? id} color={profile?.colors[0] ?? "#ffd18a"} score={scores[id]?.score ?? null} say={scores[id]?.say} pending={!SETTLED.includes(phase)} />;
              })}
            </div>
          </section>
        )}
      </div>

      <div className={styles.right}>
        {phase === "lobby" && openProfile && <ProfileCard profile={openProfile} onClose={closeProfile} />}
        {phase === "receipt" && mandate && receipt && (
          <Receipt receipt={receipt} mandate={mandate} carts={carts} notifications={notifications} />
        )}
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
        {caption && <p className={styles.caption}>{caption}</p>}
        {phase === "merge" && searchPlan && <p className={styles.caption}>Searching {searchPlan.slots.length} planned {searchPlan.slots.length === 1 ? "query group" : "query groups"}…</p>}
        {repair && phase !== "receipt" && <p className={styles.caption}>{repair.autonomous ? "The agent is finding another option…" : "Applying your replacement request…"}</p>}
        {preflight && phase === "signing" && <p className={styles.caption}>Preflight: {preflight.status}{preflight.changes.length ? ` · ${preflight.changes.join(" ")}` : ""}</p>}
        {phase === "awaitMandate" && (
          <div className={styles.mandate}>
            <MandateButton onApprove={approve} />
          </div>
        )}
      </div>
    </div>
  );
}
