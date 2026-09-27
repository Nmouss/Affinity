"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BundlePreview } from "@/components/bundle/BundlePreview";
import { HappinessMeter } from "@/components/bundle/HappinessMeter";
import { GestureStatus } from "@/components/controls/GestureStatus";
import { MandateButton } from "@/components/controls/MandateButton";
import { handTarget } from "@/components/hands/makerHitTest";
import { MissionForm } from "@/components/council/MissionForm";
import { PlanPreview } from "@/components/plan/PlanPreview";
import { ProfileCard } from "@/components/sprites/ProfileCard";
import { hasSavedRoster, usePeople, useRosterHydration } from "@/lib/people/roster";
import { DEFAULT_BUDGET } from "@/lib/director/mission";
import { useDirector } from "@/lib/director/useDirector";
import { FAST_FORWARD_PACE } from "@/lib/director/director";
import { FastForwardIcon, SkipForwardIcon } from "./icons";
import { SupporterRow } from "./SupporterRow";
import { supportersForProposal } from "./supporters";
import { emitGesture } from "@/lib/stage/bus";
import { participantIds } from "@/lib/stage/slices/council";
import { useStage } from "@/lib/stage/store";
import type { StagePhase } from "@/types/stage";
import { InviteChips } from "./InviteChips";
import { Receipt } from "./Receipt";
import { CartRejected, CartReview } from "./CartReview";
import { ItemRanking } from "./ItemRanking";
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
export function Hud({ plaza = false }: { plaza?: boolean }) {
  useRosterHydration();
  const { director, flags } = useDirector();
  const people = usePeople();
  const [showMakerHint, setShowMakerHint] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
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
    setSwapping(null);
    const timer = window.setTimeout(() => useStage.getState().setError(null), ERROR_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  // Nothing saved yet (a fresh browser): point new visitors at the People Maker once.
  useEffect(() => setShowMakerHint(!hasSavedRoster()), []);

  const closeProfile = useCallback(() => useStage.getState().openProfile(null), []);
  // Shared onApprove for both mandate flows. MandateButton calls it after the handshake meter (hand
  // pose, Space, or holding the button) has already emitted handshakeComplete and the director's bus
  // listener has signed the mandate, so it must not emit again (that would re-enter every listener).
  // Checkout opens later from the Receipt, once a real checkoutUrl exists.
  const approve = useCallback(() => {}, []);

  useEffect(() => {
    setSwapping(null);
  }, [bundle, plan]);
  const handleSwap = useCallback(
    (itemId: string, prompt?: string) => {
      if (!director) return;
      setSwapping(itemId);
      void director.swapItem(itemId, prompt);
    },
    [director],
  );
  const handleCancelCart = useCallback(
    (itemId: string) => {
      if (!director) return;
      void director.cancelProposal(itemId);
    },
    [director],
  );

  const openProfile = people.find((profile) => profile.id === profileOpenId);
  const participants = participantIds({ sprites, opinions, mission });
  const rankingAgents = participants
    .map((id) => people.find((member) => member.id === id))
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
  const caption = CAPTIONS[phase];
  const deliberating = DELIBERATING.includes(phase);
  const shoppingDecision = phase === "awaitMandate" && Boolean(bundle) && !plan;
  const planDecision = phase === "awaitMandate" && Boolean(plan);
  const receiptDecision =
    phase === "receipt" && (receipt?.status === "rejected" || (receipt?.status === "approved" && Boolean(mandate)));
  const decisionOpen = shoppingDecision || planDecision || receiptDecision;

  // Fast-forward is a per-run choice: it clears when the council goes home.
  const [fastForward, setFastForward] = useState(false);
  useEffect(() => {
    if (phase === "lobby") setFastForward(false);
  }, [phase]);
  const toggleFastForward = useCallback(() => {
    if (!director) return;
    const next = !fastForward;
    setFastForward(next);
    director.setPace(next ? FAST_FORWARD_PACE : 1);
  }, [director, fastForward]);
  const skipTalk = useCallback(() => {
    if (!director) return;
    setFastForward(true);
    director.skipTalk();
  }, [director]);
  const talking = DELIBERATING.includes(phase);

  return (
    <div className={`${styles.hud} ${plaza ? styles.plazaHud : ""}`}>
      {director && flags?.lab && <BeatTuner director={director} />}

      {director && talking && (
        <nav className={styles.pace} aria-label="Council pace">
          <button
            type="button"
            className={styles.paceButton}
            data-hand-target="pace-fast"
            aria-pressed={fastForward}
            title={fastForward ? "Back to normal speed" : "Play the council's talk faster"}
            onClick={toggleFastForward}
          >
            <span className={styles.paceIcon}>
              <FastForwardIcon size={18} />
            </span>
            {fastForward ? "Fast" : "Fast forward"}
          </button>
          <button
            type="button"
            className={styles.paceButton}
            data-hand-target="pace-skip"
            title="Skip the talk and go straight to the pick"
            onClick={skipTalk}
          >
            <span className={styles.paceIcon}>
              <SkipForwardIcon size={18} />
            </span>
            Skip the chat
          </button>
        </nav>
      )}

      {!plaza && <header className={styles.top}>
        <strong className={styles.brand}>Affinity</strong>
        <span className={styles.phase}>{phase}</span>
        {flags?.cut90 && <span className={styles.badge}>90 s cut</span>}
        <span className={styles.gesture}>
          <GestureStatus />
        </span>
      </header>}

      {!plaza && <nav className={flags?.lab ? styles.actionsLab : styles.actions} aria-label="Stage controls">
        <button
          type="button"
          className={styles.action}
          {...handTarget("hud-reset")}
          onClick={() => emitGesture({ type: "reset" })}
        >
          Reset <span className={styles.kbd}>R</span>
        </button>
      </nav>}

      {!plaza && deliberating && (
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
        {plaza && !decisionOpen && bundle && !plan && phase !== "lobby" && (
          <ItemRanking
            title="Items"
            items={bundle.items.map((item) => ({
              id: item.id,
              name: item.name,
              imageUrl: item.imageUrl,
              forName: people.find((member) => bundle.serves[member.id]?.includes(item.id))?.name ?? null,
            }))}
            agents={rankingAgents}
            scores={scores}
            pending={!SETTLED.includes(phase)}
          />
        )}
        {!plaza && bundle && !plan && (
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
        {plan && !planDecision && (
          <section className={styles.cart} aria-label="Affinity's plan and who likes it">
            <h2 className={styles.title}>Affinity&apos;s plan</h2>
            <PlanPreview plaza={plaza} compact plan={plan} family={people} onSwap={handleSwap} swapping={swapping} />
            <div className={styles.meters}>
              <SupporterRow
                supporters={supportersForProposal(participants, {}, scores)}
                nameOf={(id) => people.find((member) => member.id === id)?.name ?? id}
                ariaLabel="Who likes this plan so far"
              />
            </div>
          </section>
        )}
      </div>

      <div className={styles.right}>
        {phase === "lobby" && openProfile && <ProfileCard profile={openProfile} onClose={closeProfile} />}
      </div>

      {decisionOpen && (
        <div className={styles.decisionOverlay} role="dialog" aria-modal="true" aria-label="Your decision">
          {shoppingDecision && bundle && (
            <CartReview
              plaza={plaza}
              bundle={bundle}
              swapping={swapping}
              onSwap={handleSwap}
              onCancel={handleCancelCart}
              onApproveCart={approve}
            />
          )}
          {planDecision && plan && (
            <section className={styles.decisionCard} aria-label="Your decision">
              <h2 className={styles.title}>Your decision</h2>
              <p className={styles.decisionHeading}>Affinity&apos;s plan</p>
              <PlanPreview plaza={plaza} plan={plan} family={people} onSwap={handleSwap} swapping={swapping} />
              <div className={styles.meters}>
                <SupporterRow
                  size="lg"
                  supporters={supportersForProposal(participants, {}, scores)}
                  nameOf={(id) => people.find((member) => member.id === id)?.name ?? id}
                  ariaLabel="Who likes this plan"
                />
              </div>
              <div className={styles.mandate}>
                <MandateButton
                  plaza={plaza}
                  onApprove={approve}
                  label={plaza ? "Hold to approve" : undefined}
                />
              </div>
            </section>
          )}
          {phase === "receipt" && receipt?.status === "rejected" && <CartRejected plaza={plaza} />}
          {phase === "receipt" && receipt?.status === "approved" && mandate && (
            <Receipt plaza={plaza} receipt={receipt} mandate={mandate} carts={carts} notifications={notifications} />
          )}
        </div>
      )}

      <div className={styles.bottom}>
        {!plaza && phase === "lobby" && (
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
        {!plaza && caption && <p className={styles.caption}>{caption}</p>}
        {!plaza && phase === "merge" && searchPlan && <p className={styles.caption}>Searching {searchPlan.slots.length} planned {searchPlan.slots.length === 1 ? "query group" : "query groups"}…</p>}
        {repair && phase !== "receipt" && (
          <p className={styles.caption}>
            {repair.autonomous ? "Finding another option…" : "Applying your replacement request…"}
          </p>
        )}
        {preflight && phase === "signing" && (
          <p className={styles.caption}>
            {plaza
              ? `Checking availability${preflight.changes.length ? ` · ${preflight.changes.join(" ")}` : "…"}`
              : `Preflight: ${preflight.status}${preflight.changes.length ? ` · ${preflight.changes.join(" ")}` : ""}`}
          </p>
        )}
      </div>
    </div>
  );
}
