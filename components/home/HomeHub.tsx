"use client";

import { useCallback, useEffect, useMemo, useReducer, useState, type FormEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MakerHands } from "@/components/hands/MakerHands";
import { BackIcon, GRABBING_CURSOR_CSS, PLAZA_ICON_STROKE, POINTER_CURSOR_CSS } from "@/components/maker/plaza/plazaIcons";
import { usePlaza } from "@/components/maker/plaza/plazaState";
import { playBlip } from "@/components/maker/sound";
import { PlazaButton, PlazaPanel, RailButton } from "@/components/ui";
import { usePeople, useRoster, useRosterHydration } from "@/lib/people/roster";
import { storePendingMission } from "@/lib/stage/handoff";
import { useStage } from "@/lib/stage/store";
import { summarize, type TasteProfile } from "@/lib/taste";
import {
  defaultQuery,
  DETAILS_STEP_BACK,
  formationForPicks,
  giftFlowReducer,
  initialGiftFlow,
  missionFromFlow,
  personForKey,
  roleOf,
  type HubStep,
  type PickRole,
} from "./giftFlow";
import styles from "./HomeHub.module.css";

// The Plaza home. Your characters wander the tiled plaza (the same scene as /create); the rails hold
// a few big activity tiles; the Christmas gift flow picks a recipient and advisors right there among
// the physical characters, then hands the mission to the living-room council at /council.

const HubCanvas = dynamic(() => import("./HubCanvas"), { ssr: false });

const PROMPTS: Record<HubStep, string> = {
  home: "Who are we shopping for this Christmas?",
  recipient: "Who is the gift for? Pick a character.",
  advisors: "Who should help choose? Pick any advisors.",
  details: "Almost there. What should the council look for?",
};

const STEPS: HubStep[] = ["recipient", "advisors", "details"];

/** Taste summary for a person when the roster has one; guarded because the taste map lands separately. */
function useTasteSummary(id: string | null): string | null {
  const profile = useRoster((state) => {
    if (!id) return undefined;
    const map = (state as unknown as { tasteProfiles?: Record<string, TasteProfile> }).tasteProfiles;
    return map?.[id];
  });
  return profile ? summarize(profile) : null;
}

/** The plaza's pointing-hand / grabbing-fist cursor over the whole hub, like PeopleMaker. */
function usePlazaCursor(): string | null {
  const hovered = usePlaza((state) => state.hoveredId !== null);
  const grabbing = usePlaza((state) => state.grabbing && state.hoveredId !== null);
  const dragging = usePlaza((state) => state.draggingId !== null);
  if (dragging || grabbing) return GRABBING_CURSOR_CSS;
  return hovered ? POINTER_CURSOR_CSS : null;
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={PLAZA_ICON_STROKE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="8" y="19" width="32" height="21" rx="4" fill="#ffd0d0" />
      <rect x="5" y="13" width="38" height="8" rx="3" fill="#ff9e9e" />
      <path d="M24 13v27" />
      <path d="M24 13c-4-7-12-7-12-2s8 2 12 2zm0 0c4-7 12-7 12-2s-8 2-12 2z" fill="#ffe3bd" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={PLAZA_ICON_STROKE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="24" cy="16" r="8" fill="#ffedce" />
      <path d="M10 41c1-9 7-13 14-13s13 4 14 13z" fill="#5bc8f0" />
      <path d="M24 33v8" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke={PLAZA_ICON_STROKE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M24 6l9 12h-5l8 10h-6l8 10H10l8-10h-6l8-10h-5z" fill="#8fd14f" />
      <rect x="21" y="38" width="6" height="6" fill="#8a5a36" />
      <circle cx="20" cy="26" r="1.8" fill="#e0312b" stroke="none" />
      <circle cx="28" cy="32" r="1.8" fill="#f7d63a" stroke="none" />
    </svg>
  );
}

function Ornament({ color }: { color: string }) {
  return (
    <svg className={styles.ornament} viewBox="0 0 24 24" aria-hidden>
      <rect x="9" y="1" width="6" height="4" rx="1" fill="#6f7470" />
      <circle cx="12" cy="14" r="8.5" fill={color} stroke="#6f7470" strokeWidth="1.5" />
      <path d="M6 12c2-1 4-1 6 0s4 1 6 0" stroke="#fffaf1" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function Tile({
  icon,
  label,
  sub,
  href,
  onClick,
  primary,
  target,
}: {
  icon: ReactNode;
  label: string;
  sub?: ReactNode;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  target: string;
}) {
  const className = [styles.tile, primary ? styles.tilePrimary : ""].filter(Boolean).join(" ");
  const body = (
    <>
      <span className={styles.tileIcon}>{icon}</span>
      <span>{label}</span>
      {sub && <span className={styles.tileSub}>{sub}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className} data-hand-target={target} onClick={() => playBlip("select")}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={className} data-hand-target={target} onClick={onClick}>
      {body}
    </button>
  );
}

export function HomeHub() {
  useRosterHydration();
  const router = useRouter();
  const people = usePeople();
  const circles = useRoster((state) => state.circles);
  const [flow, dispatch] = useReducer(giftFlowReducer, initialGiftFlow);
  const [leaving, setLeaving] = useState(false);
  const cursor = usePlazaCursor();

  // Family first, then friends, both in roster order: what the number keys follow (like the stage's chips).
  const orderedIds = useMemo(() => {
    const family = people.filter((profile) => circles[profile.id] === "family").map((profile) => profile.id);
    const friends = people.filter((profile) => circles[profile.id] !== "family").map((profile) => profile.id);
    return [...family, ...friends];
  }, [people, circles]);
  const names = useMemo(() => Object.fromEntries(people.map((profile) => [profile.id, profile.name])), [people]);
  const recipient = people.find((profile) => profile.id === flow.recipientId) ?? null;
  const recipientTaste = useTasteSummary(flow.recipientId);

  const picking = flow.step === "recipient" || flow.step === "advisors" || flow.step === "details";
  const roles = useMemo(() => {
    const out: Record<string, PickRole> = {};
    if (!picking) return out;
    for (const id of orderedIds) {
      const role = roleOf(flow, id);
      if (role) out[id] = role;
    }
    return out;
  }, [picking, orderedIds, flow]);
  // While the details panel is open the line-up steps back so the panel never covers anyone.
  const slots = useMemo(
    () => (picking ? formationForPicks(orderedIds, flow.recipientId, flow.advisorIds, flow.step === "details" ? DETAILS_STEP_BACK : 0) : null),
    [picking, orderedIds, flow.recipientId, flow.advisorIds, flow.step],
  );

  // The picked characters walk to their slots through the plaza's whistle formation mode.
  useEffect(() => {
    usePlaza.getState().setWhistle({ on: slots !== null });
    return () => usePlaza.getState().setWhistle({ on: false });
  }, [slots]);

  const pick = useCallback(
    (id: string) => {
      if (flow.step === "recipient") {
        playBlip("select");
        dispatch({ type: "pickPerson", id });
        dispatch({ type: "next" });
      } else if (flow.step === "advisors") {
        playBlip("select");
        dispatch({ type: "pickPerson", id });
      }
    },
    [flow.step],
  );

  // Taps on characters arrive through the plaza seam (mouse and Leap alike). Consume and clear each one
  // so tapping the same person again toggles them as an advisor.
  useEffect(() => {
    if (!picking) return;
    return usePlaza.subscribe((state, previous) => {
      const id = state.selectedId;
      if (!id || id === previous.selectedId) return;
      usePlaza.getState().select(null);
      pick(id);
    });
  }, [picking, pick]);

  // Everything the mouse can do, the keyboard can: number keys pick, Enter confirms, Esc goes back.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (event.key === "Escape") {
        if (flow.step !== "home") {
          playBlip("save");
          dispatch({ type: "back" });
        }
        return;
      }
      if (typing) return;
      if (flow.step === "home") {
        if (event.key === "Enter" || event.key.toLowerCase() === "g") startGift();
        return;
      }
      const id = personForKey(event.key, orderedIds);
      if (id) {
        pick(id);
        return;
      }
      if (event.key === "Enter") {
        if (flow.step === "details") void gather();
        else if (flow.step === "advisors") {
          playBlip("select");
          dispatch({ type: "next" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // gather/startGift are stable closures over the latest flow via refs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.step, orderedIds, pick]);

  function startGift() {
    playBlip("select");
    usePlaza.getState().select(null);
    dispatch({ type: "startGift" });
  }

  async function gather() {
    if (!recipient || leaving) return;
    const mission = missionFromFlow(flow, recipient.name, recipientTaste);
    if (!mission) return;
    setLeaving(true);
    playBlip("save");
    const stage = useStage.getState();
    stage.resetCouncil();
    stage.setMission(mission);
    stage.setMissionText(mission.freeText);
    storePendingMission(mission);
    router.push("/council");
  }

  const onDetails = (event: FormEvent) => {
    event.preventDefault();
    void gather();
  };

  const stepIndex = STEPS.indexOf(flow.step);
  const queryPlaceholder = recipient ? defaultQuery(recipientTaste, recipient.name) : "";

  return (
    <div className={styles.root} style={cursor ? { cursor } : undefined}>
      <div className={styles.canvas} data-orbit-zone>
        <HubCanvas slots={slots} roles={roles} names={names} />
      </div>
      <MakerHands />

      <header className={styles.top}>
        <span className={styles.brand}>
          <Ornament color="#e0312b" />
          Affinity
          <Ornament color="#f7d63a" />
        </span>
        <p className={styles.prompt} role="status" aria-live="polite">
          {PROMPTS[flow.step]}
        </p>
      </header>

      {flow.step === "home" ? (
        <nav className={styles.railLeft} aria-label="Activities">
          <Tile icon={<GiftIcon />} label="Christmas gifts" sub="Pick who it's for" primary onClick={startGift} target="hub-gifts" />
          <Tile icon={<PersonIcon />} label="Make a character" sub="People Maker" href="/create" target="hub-make" />
          <Tile
            icon={<TreeIcon />}
            label="Family tree council"
            sub={<span className={styles.demoChip}>Demo replay</span>}
            href="/council?demo"
            target="hub-tree-demo"
          />
        </nav>
      ) : (
        <nav className={styles.railRight} aria-label="Gift flow controls">
          <RailButton
            label="Back"
            side="right"
            icon={<BackIcon size={40} />}
            data-hand-target="hub-back"
            onClick={() => dispatch({ type: "back" })}
          />
        </nav>
      )}

      <div className={styles.bottom}>
        {flow.step === "home" && (
          <p className={styles.hint}>
            Point at a character to meet them · press <span className={styles.kbd}>Enter</span> to start Christmas gifts
          </p>
        )}

        {picking && (
          <PlazaPanel className={styles.panel} aria-label="Gift picks" as="section">
            <div className={styles.panelRow}>
              <span className={styles.steps} aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
                {STEPS.map((step, index) => (
                  <span
                    key={step}
                    className={[styles.stepDot, index === stepIndex ? styles.stepDotActive : "", index < stepIndex ? styles.stepDotDone : ""]
                      .filter(Boolean)
                      .join(" ")}
                  />
                ))}
              </span>
              <ul className={styles.picks} aria-label="Chosen characters">
                {recipient && (
                  <li className={styles.pick}>
                    <span className={`${styles.pickRole} ${styles.pickRecipient}`}>Recipient</span>
                    {recipient.name}
                    {recipientTaste && <span className={styles.pickTaste}>· {recipientTaste}</span>}
                  </li>
                )}
                {flow.advisorIds.map((id) => (
                  <li key={id} className={styles.pick}>
                    <span className={`${styles.pickRole} ${styles.pickAdvisor}`}>Advisor</span>
                    {names[id] ?? id}
                  </li>
                ))}
                {!recipient && <li className={styles.pickTaste}>Nobody picked yet</li>}
              </ul>
            </div>

            {flow.step === "details" ? (
              <form className={styles.fields} onSubmit={onDetails}>
                <label className={styles.label} htmlFor="gift-budget">
                  Budget
                </label>
                <span className={styles.budgetWrap}>
                  <span aria-hidden>$</span>
                  <input
                    id="gift-budget"
                    className={styles.input}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={flow.budget}
                    onChange={(event) => dispatch({ type: "setBudget", budget: Number(event.target.value) })}
                  />
                </span>
                <label className={styles.label} htmlFor="gift-query">
                  Look for
                </label>
                <input
                  id="gift-query"
                  className={styles.input}
                  type="text"
                  value={flow.query}
                  placeholder={queryPlaceholder}
                  autoComplete="off"
                  onChange={(event) => dispatch({ type: "setQuery", query: event.target.value })}
                />
                <label className={styles.label} htmlFor="gift-note">
                  Anything else
                </label>
                <input
                  id="gift-note"
                  className={styles.input}
                  type="text"
                  value={flow.note}
                  placeholder="Optional: a hint for the council"
                  autoComplete="off"
                  onChange={(event) => dispatch({ type: "setNote", note: event.target.value })}
                />
                <span />
                <span className={styles.actions}>
                  <PlazaButton type="submit" variant="primary" size="lg" data-hand-target="hub-gather" disabled={leaving}>
                    {leaving ? "Gathering…" : "Gather the council"}
                  </PlazaButton>
                </span>
              </form>
            ) : (
              <div className={styles.panelRow}>
                <p className={styles.hint}>
                  {flow.step === "recipient" ? (
                    <>
                      Click a character, or press <span className={styles.kbd}>1</span> <span className={styles.kbd}>2</span>{" "}
                      <span className={styles.kbd}>3</span>…
                    </>
                  ) : (
                    <>
                      Click characters to add or remove advisors · <span className={styles.kbd}>Enter</span> when ready
                    </>
                  )}
                </p>
                {flow.step === "advisors" && (
                  <span className={styles.actions}>
                    <PlazaButton variant="primary" data-hand-target="hub-next" onClick={() => dispatch({ type: "next" })}>
                      {flow.advisorIds.length === 0 ? "No advisors, continue" : "Continue"}
                    </PlazaButton>
                  </span>
                )}
              </div>
            )}
          </PlazaPanel>
        )}
      </div>
    </div>
  );
}
