"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Busy, ConfirmDialog, ErrorBanner, Toast } from "@/components/mission/common";
import { startLeap, swipeDetector, useLeapFrames, useLeapStatus } from "@/components/mission/leap/leapStore";
import { type AffinityApi, createAffinityApi } from "@/lib/mission/services/affinityApi";
import { useAffinity } from "@/lib/mission/state/controller";
import { money, nameFor, ruleLabel } from "@/lib/mission/state/labels";
import type { AppState, PendingConfirmation } from "@/lib/mission/state/machine";
import { LeapCheckScreen } from "@/components/mission/screens/LeapCheck";
import { HomeScreen, MissionBriefScreen, ParticipantScreen, ShopperCreationScreen, TranscriptScreen } from "@/components/mission/screens/MissionEntry";
import { MissionSpaceScreen } from "@/components/mission/screens/MissionSpace";
import { CompleteScreen, SubstitutionScreen } from "@/components/mission/screens/Substitution";
import { ProfileScreen, QuickChoicesScreen } from "@/components/mission/screens/Taste";
import { preloadModels } from "@/components/mission/three/MissionRoom";
import { SceneSlot, webglAvailable } from "@/components/mission/three/SceneSlot";
import "./mission.css";
import { speechSupported } from "@/components/mission/voice/speech";

const MODE_LABEL = { mock: "Mock mode", core: "Engine: local", http: "Engine: HTTP" } as const;

interface AppProps {
  api?: AffinityApi;
  /** Skip the Leap socket (tests, or presenters without hardware). */
  leap?: boolean;
  initialState?: Partial<AppState>;
}

export default function App({ api: injected, leap = true, initialState }: AppProps) {
  const api = useMemo(() => injected ?? createAffinityApi(), [injected]);
  const { state, actions } = useAffinity(api, initialState);
  const [reducedMotion, setReducedMotion] = useState(() => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const leapStatus = useLeapStatus();
  const [swipe, setSwipe] = useState<{ direction: "left" | "right"; at: number } | null>(null);

  useEffect(() => {
    if (leap) startLeap();
  }, [leap]);

  // Fetch every local product GLB up front so nothing loads mid-demo.
  useEffect(() => {
    if (webglAvailable()) preloadModels();
  }, []);

  const swipeListener = useMemo(() => swipeDetector((direction) => setSwipe({ direction, at: Date.now() })), []);
  useLeapFrames(state.screen === "QUICK_CHOICES" && leapStatus === "open" ? swipeListener : null);

  // Presenter reset: Shift+Escape returns to Home from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.shiftKey) actions.reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  const dismissUndo = useCallback(() => actions.dismissUndo(), [actions]);
  const dismissNotice = useCallback(() => actions.clearNotice(), [actions]);

  const screen = (() => {
    const props = { state, actions };
    switch (state.screen) {
      case "HOME": return <HomeScreen {...props} />;
      case "TRANSCRIPT_CONFIRMATION": return <TranscriptScreen {...props} />;
      case "MISSION_BRIEF": return <MissionBriefScreen {...props} />;
      case "PARTICIPANT_RESOLUTION": return <ParticipantScreen {...props} />;
      case "SHOPPER_CREATION": return <ShopperCreationScreen {...props} />;
      case "QUICK_CHOICES": return <QuickChoicesScreen {...props} leapSwipe={swipe} />;
      case "PROFILE_CONFIRMATION": return <ProfileScreen {...props} />;
      case "MISSION_SPACE": return <MissionSpaceScreen {...props} scene={<SceneSlot state={state} actions={actions} reducedMotion={reducedMotion} />} />;
      case "LEAP_CHECK": return <LeapCheckScreen {...props} />;
      case "SUBSTITUTION_APPROVAL": return <SubstitutionScreen {...props} />;
      case "COMPLETE": return <CompleteScreen {...props} />;
    }
  })();

  return (
    <div className={`app${reducedMotion ? " reduce-motion" : ""}`} data-screen={state.screen}>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="app__bar">
        <span className="brand">Affinity</span>
        <ul className="chips chips--status" aria-label="System status">
          <li className={`chip chip--${api.mode === "mock" ? "info" : "ok"}`}>{MODE_LABEL[api.mode]}</li>
          <li className="chip">{speechSupported() ? "Voice: push-to-talk" : "Voice: demo transcript"}</li>
          <li className={`chip${leapStatus === "open" ? " chip--ok" : ""}`}>Leap: {leapStatus === "open" ? "connected" : "not connected — buttons active"}</li>
        </ul>
        <label className="toggle">
          <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} /> Reduce motion
        </label>
        {state.screen !== "HOME" && (
          <button type="button" className="btn btn--small btn--ghost" onClick={actions.reset} title="Shift+Escape">Restart</button>
        )}
      </header>

      <main id="main" className="app__main">
        {state.error && <ErrorBanner message={state.error} onDismiss={actions.clearError} />}
        {screen}
        <Busy label={state.busy} />
      </main>

      {state.undo && (
        <Toast key={state.undo.id} message={state.undo.message} actionLabel="Undo" onAction={actions.undo} onDismiss={dismissUndo} />
      )}
      {state.notice && !state.undo && <Toast key={state.notice} message={state.notice} onDismiss={dismissNotice} />}

      {state.pending && <PendingDialog pending={state.pending} state={state} actions={actions} />}
    </div>
  );
}

function PendingDialog({ pending, state, actions }: { pending: PendingConfirmation; state: AppState; actions: ReturnType<typeof useAffinity>["actions"] }) {
  const cancel = actions.cancelPending;
  const said = (t: string) => (t ? <p className="caption">You said: “{t}”</p> : null);

  if (pending.kind === "add_rule") {
    return (
      <ConfirmDialog
        title={`Add “${ruleLabel(pending.rule)}” as a rule for this mission?`}
        onCancel={cancel}
        actions={[
          { label: "Confirm", variant: "primary", onClick: () => actions.confirmPending("confirm") },
          { label: "Only hide them", onClick: () => actions.confirmPending("alternate") },
          { label: "Cancel", onClick: cancel },
        ]}
      >
        {said(pending.transcript)}
        <p>A rule removes every product with {pending.material} for you on this mission and can change the group’s pick. Hiding only changes what you see.</p>
      </ConfirmDialog>
    );
  }
  if (pending.kind === "mission_change") {
    return (
      <ConfirmDialog
        title={`Change the mission ${pending.field === "sharedBudget" ? "budget" : pending.field}${pending.value !== undefined ? ` to ${money(pending.value)}` : ""}?`}
        onCancel={cancel}
        actions={[
          { label: "Confirm", variant: "primary", onClick: () => actions.confirmPending("confirm") },
          { label: "Cancel", onClick: cancel },
        ]}
      >
        {said(pending.transcript)}
        <p>This affects everyone in the mission.</p>
      </ConfirmDialog>
    );
  }
  if (pending.kind === "request_approval") {
    const total = state.cartIds.map((id) => state.catalog?.products.find((p) => p.id === id)?.price ?? 0).reduce((a, b) => a + b, 0);
    const others = state.shoppers.filter((s) => s.id !== state.shopper?.id).map((s) => s.name);
    return (
      <ConfirmDialog
        title="Ask everyone for approval?"
        onCancel={cancel}
        actions={[
          { label: "Ask everyone", variant: "primary", onClick: () => actions.confirmPending("confirm") },
          { label: "Cancel", onClick: cancel },
        ]}
      >
        {said(pending.transcript)}
        <p>{others.join(", ") || "The group"} will be asked to approve the {money(total)} shared cart.</p>
        <p className="tag tag--info">Mock authorization — no payment is made.</p>
      </ConfirmDialog>
    );
  }
  const sub = state.substitution;
  const products = state.catalog?.products ?? [];
  const replacement = products.find((p) => p.id === sub?.replacementProductId);
  const affected = sub?.result.affectedShopperId ? nameFor(sub.result.affectedShopperId, state.shoppers) : "a shopper";
  return (
    <ConfirmDialog
      tone="danger"
      title={`Override ${affected}’s requirement?`}
      onCancel={cancel}
      actions={[
        { label: "Override with my approval", variant: "danger", onClick: () => actions.confirmPending("confirm") },
        { label: "Cancel", onClick: cancel },
      ]}
    >
      <p>
        {replacement?.name ?? "The replacement"} conflicts with {affected}’s confirmed requirement:{" "}
        <strong>{sub?.result.violatedRequirement ? ruleLabel(sub.result.violatedRequirement) : "unknown"}</strong>.
      </p>
      <p>The override is recorded on the cart and shown to {affected}.</p>
    </ConfirmDialog>
  );
}
