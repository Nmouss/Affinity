"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- classic JSX runtime needs React in scope
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { getCircle, getLook, getPerson, MAX_PEOPLE, useRoster } from "@/lib/people/roster";
import { playBlip } from "@/components/maker/sound";
import type { MakerAction, PersonPreferences } from "@/components/maker/flow";
import type { CharacterLook, Circle } from "@/types/character";
import { PLAZA_DROP_ATTR, usePlaza, type PlazaDrop } from "./plazaState";
import { DinnerPlanIcon, HelpIcon, InterviewIcon, MoveIcon, NewIcon, ShopTogetherIcon } from "./plazaIcons";
import { HelpOverlay } from "./HelpOverlay";
import { GiftPickBar } from "./GiftPickBar";
import { giftPickBack, giftPickNext, invitedForPicks, personForKey, pickGiftPerson, startGiftPick } from "./giftPick";
import styles from "./PlazaRails.module.css";

// Replaces the old text-button toolbar and the Family/Friends name panels: the plaza now shows only
// big round Mii-Maker-style icon buttons down the left and right edges (names live as 3D hover tags
// over people's heads, owned by the scene track). Selection, hover, and drag all live in usePlaza
// (the seam store) so the 3D scene and these rails agree on who's selected without either owning
// the other. Edit/Remove/Move also read `dropAction`: when the scene reports a person dropped on
// one of these icons, we run the same action the icon's own click would.

/** Looks a person up by id; production passes the roster's getPerson/getLook/getCircle, tests pass
 * plain fakes — see resolvePlazaDrop below and tests/unit/maker/plazaRails.test.ts. */
export interface PersonLookup {
  getPerson: (id: string) => { name: string; relationship: string; loves?: string[]; avoids?: string[]; personality?: string[] } | undefined;
  getLook: (id: string) => CharacterLook | undefined;
  getCircle: (id: string) => Circle | undefined;
}

export type PlazaDropResult =
  | { kind: "editPerson"; id: string; name: string; circle: Circle; relationship: string; look: CharacterLook }
  | { kind: "interviewPerson"; id: string; name: string; circle: Circle; relationship: string; look: CharacterLook; preferences: PersonPreferences }
  | { kind: "requestRemove"; id: string }
  | { kind: "move"; id: string; from: Circle; to: Circle }
  | null;

export type DinnerPlanAction =
  | { kind: "emptyRoster" }
  | { kind: "open" }
  | { kind: "needsPeople" }
  | { kind: "launch"; invitedIds: string[] };

/** The dinner card first opens participant selection, then launches once people are in the circle. */
export function resolveDinnerPlanAction(
  dinnerOpen: boolean,
  peopleIds: readonly string[],
  missionMemberIds: readonly string[],
): DinnerPlanAction {
  if (peopleIds.length === 0) return { kind: "emptyRoster" };
  if (!dinnerOpen) return { kind: "open" };
  const knownIds = new Set(peopleIds);
  const invitedIds = missionMemberIds.filter((id) => knownIds.has(id));
  return invitedIds.length === 0 ? { kind: "needsPeople" } : { kind: "launch", invitedIds };
}

/**
 * Pure mapping from a scene-reported drop (someone dragged onto a rail icon) to what should happen
 * — the same thing that icon's own click handler does. `null` means the drop can't be resolved
 * (the person vanished between the drop and this read) and should be ignored.
 */
export function resolvePlazaDrop(action: PlazaDrop, personId: string, lookup: PersonLookup): PlazaDropResult {
  if (action === "edit") {
    const person = lookup.getPerson(personId);
    const look = lookup.getLook(personId);
    const circle = lookup.getCircle(personId);
    if (!person || !look || !circle) return null;
    return { kind: "editPerson", id: personId, name: person.name, circle, relationship: person.relationship, look };
  }
  if (action === "interview") {
    const person = lookup.getPerson(personId);
    const look = lookup.getLook(personId);
    const circle = lookup.getCircle(personId);
    if (!person || !look || !circle) return null;
    return {
      kind: "interviewPerson",
      id: personId,
      name: person.name,
      circle,
      relationship: person.relationship,
      look,
      preferences: { loves: [...(person.loves ?? [])], avoids: [...(person.avoids ?? [])], personality: [...(person.personality ?? [])] },
    };
  }
  if (action === "remove") {
    return { kind: "requestRemove", id: personId };
  }
  const circle = lookup.getCircle(personId);
  if (!circle) return null;
  return { kind: "move", id: personId, from: circle, to: circle === "family" ? "friend" : "family" };
}

export interface PlazaRailsProps {
  dispatch: (action: MakerAction) => void;
  onLaunch: (mode: "shopping" | "plan", invitedIds: string[], recipientIds?: string[]) => void;
  /** Hide the bottom mission bar so agent bubbles aren’t trapped under it. */
  hideMissions?: boolean;
}

const HINT_MS = 1600;

function RailButton({
  targetId,
  dropAction,
  label,
  dim,
  disabled,
  active,
  onClick,
  children,
}: {
  targetId: string;
  dropAction?: PlazaDrop;
  label: string;
  /** Visually muted (no selection to act on) but still clickable, so a hand pinch-tap can surface the hint. */
  dim?: boolean;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const dropProps = dropAction ? { [PLAZA_DROP_ATTR]: dropAction } : {};
  return (
    <div className={styles.iconWrap}>
      <button
        type="button"
        data-hand-target={targetId}
        {...dropProps}
        className={[styles.iconButton, active ? styles.iconButtonActive : "", dim ? styles.iconButtonDim : ""]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </button>
      <span className={styles.tooltip}>{label}</span>
    </div>
  );
}

export function PlazaRails({ dispatch, onLaunch, hideMissions = false }: PlazaRailsProps) {
  const selectedId = usePlaza((s) => s.selectedId);
  const dropAction = usePlaza((s) => s.dropAction);
  const clearDrop = usePlaza((s) => s.clearDrop);
  const missionMemberIds = usePlaza((s) => s.missionMemberIds);

  const total = useRoster((s) => s.people.length);
  const people = useRoster((s) => s.people);
  const setCircle = useRoster((s) => s.setCircle);
  const selectedCircle = useRoster((s) => (selectedId ? s.circles[selectedId] : undefined));

  const [helpOpen, setHelpOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const giftPick = usePlaza((s) => s.giftPick);
  const setGiftPick = usePlaza((s) => s.setGiftPick);
  const missionMode = usePlaza((s) => s.missionMode);
  const setMissionMode = usePlaza((s) => s.setMissionMode);
  const dinnerOpen = missionMode === "plan";
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  function showHint(text: string) {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  }

  // The scene dropped a dragged person on one of our icons (or used it like a click): do what that
  // icon's own click handler would, then tell the seam we've consumed it.
  useEffect(() => {
    if (!dropAction) return;
    const result = resolvePlazaDrop(dropAction.action, dropAction.personId, { getPerson, getLook, getCircle });
    if (result?.kind === "editPerson") {
      playBlip("select");
      dispatch({ type: "editPerson", id: result.id, name: result.name, circle: result.circle, relationship: result.relationship, look: result.look });
    } else if (result?.kind === "interviewPerson") {
      playBlip("select");
      dispatch({ type: "interviewPerson", id: result.id, name: result.name, circle: result.circle, relationship: result.relationship, look: result.look, preferences: result.preferences });
    } else if (result?.kind === "requestRemove") {
      dispatch({ type: "requestRemove", id: result.id });
    } else if (result?.kind === "move") {
      playBlip("select");
      setCircle(result.id, result.to);
    }
    clearDrop();
  }, [dropAction, dispatch, setCircle, clearDrop]);

  function startGiftPickFlow() {
    if (people.length === 0) {
      showHint("Add someone to your world first");
      return;
    }
    // Gifts are picked in the Plaza itself: who it's for, then who's buying. Every gift starts
    // from a clean slate; the mission circle is dinner-plan furniture and never pre-fills buyers.
    playBlip("select");
    usePlaza.getState().select(null);
    setMissionMode(null);
    setGiftPick(startGiftPick());
  }

  function handleDinnerPlan() {
    const action = resolveDinnerPlanAction(
      dinnerOpen,
      people.map((person) => person.id),
      missionMemberIds,
    );
    if (action.kind === "emptyRoster") {
      showHint("Add someone to your world first");
      return;
    }
    if (action.kind === "open") {
      playBlip("select");
      setGiftPick(null);
      setMissionMode("plan");
      return;
    }
    if (action.kind === "needsPeople") {
      showHint("Drag people into the mission circle first");
      return;
    }
    playBlip("select");
    onLaunch("plan", action.invitedIds);
  }

  // While picking, a click (or pinch) on a character in the scene is a pick, not a selection.
  useEffect(() => {
    if (!giftPick || !selectedId) return;
    if (!people.some((person) => person.id === selectedId)) return;
    playBlip("select");
    setGiftPick(pickGiftPerson(giftPick, selectedId));
    usePlaza.getState().select(null);
  }, [giftPick, selectedId, people, setGiftPick]);

  function giftNext() {
    if (!giftPick?.recipientId) {
      showHint("Click the person the gift is for");
      return;
    }
    playBlip("select");
    setGiftPick(giftPickNext(giftPick));
  }

  function giftBack() {
    if (!giftPick) return;
    playBlip("select");
    setGiftPick(giftPickBack(giftPick));
  }

  function giftLaunch() {
    if (!giftPick?.recipientId) return;
    const invited = invitedForPicks(giftPick).filter((id) => people.some((person) => person.id === id));
    if (invited.length === 0) return;
    playBlip("select");
    // The picked people are the mission: they take their places in the mission circle so the
    // council gathers around them exactly as it does for a dragged-in circle.
    const plaza = usePlaza.getState();
    for (const person of people) plaza.setMissionMember(person.id, invited.includes(person.id));
    setGiftPick(null);
    onLaunch("shopping", invited, [invited[0]!]);
  }

  // Keyboard while picking: number keys pick in roster order, Enter moves on, Escape steps back.
  useEffect(() => {
    if (!giftPick) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const picked = personForKey(event.key, people.map((person) => person.id));
      if (picked) {
        event.preventDefault();
        playBlip("select");
        setGiftPick(pickGiftPerson(giftPick, picked));
        return;
      }
      if (event.key === "Enter" && !(target && target.tagName === "BUTTON")) {
        event.preventDefault();
        if (giftPick.step === "recipient") giftNext();
        else giftLaunch();
      } else if (event.key === "Escape") {
        event.preventDefault();
        giftBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // giftNext/giftBack/giftLaunch close over the same giftPick/people captured here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giftPick, people, setGiftPick]);

  // Leaving the plaza (editor, council) always ends picking.
  useEffect(() => () => setGiftPick(null), [setGiftPick]);

  function handleNew() {
    playBlip("select");
    dispatch({ type: "newPerson" });
  }

  /** (Re)run the getting-to-know-you interview for the selected person. */
  function handleInterview() {
    if (!selectedId) {
      showHint("Pick someone first");
      return;
    }
    const result = resolvePlazaDrop("interview", selectedId, { getPerson, getLook, getCircle });
    if (result?.kind !== "interviewPerson") return;
    playBlip("select");
    dispatch({ type: "interviewPerson", id: result.id, name: result.name, circle: result.circle, relationship: result.relationship, look: result.look, preferences: result.preferences });
  }

  function handleMove() {
    if (!selectedId) {
      showHint("Pick someone first");
      return;
    }
    const circle = getCircle(selectedId);
    if (!circle) return;
    playBlip("select");
    setCircle(selectedId, circle === "family" ? "friend" : "family");
  }

  return (
    <>
      <div className={styles.railLeft}>
        <RailButton targetId="plaza-new" label="New person" disabled={total >= MAX_PEOPLE} onClick={handleNew}>
          <NewIcon />
        </RailButton>
        <RailButton targetId="plaza-help" label="Help" active={helpOpen} onClick={() => setHelpOpen((was) => !was)}>
          <HelpIcon />
        </RailButton>
      </div>

      {!hideMissions && !giftPick && (
      <div className={styles.missionActions} aria-label="Plan with your connections">
        <p className={styles.missionLabel}>
          {!dinnerOpen
            ? "Plan with your people"
            : missionMemberIds.length === 0
              ? "Drag people into the mission circle"
              : `${missionMemberIds.length} ${missionMemberIds.length === 1 ? "person" : "people"} ready for dinner`}
        </p>
        <button type="button" data-hand-target="plaza-shop" className={`${styles.missionButton} ${styles.shopMission}`} onClick={startGiftPickFlow}>
          <span className={styles.missionIcon}><ShopTogetherIcon size={28} /></span>
          <span><strong>Shop for a gift</strong><small>Pick who it's for, then who's buying</small></span>
        </button>
        <button
          type="button"
          data-hand-target="plaza-dinner"
          className={`${styles.missionButton} ${styles.planMission} ${dinnerOpen ? styles.planMissionActive : ""}`}
          aria-pressed={dinnerOpen}
          onClick={handleDinnerPlan}
        >
          <span className={styles.missionIcon}><DinnerPlanIcon size={28} /></span>
          <span>
            <strong>{dinnerOpen ? "Start dinner plan" : "Make dinner plans"}</strong>
            <small>
              {dinnerOpen
                ? missionMemberIds.length === 0
                  ? "Drag people into the circle first"
                  : `Continue with ${missionMemberIds.length} ${missionMemberIds.length === 1 ? "person" : "people"}`
                : "Choose a place and activity"}
            </small>
          </span>
        </button>
      </div>
      )}

      <div className={styles.railRight}>
        <RailButton targetId="plaza-interview" dropAction="interview" label="Interview" dim={!selectedId} onClick={handleInterview}>
          <InterviewIcon />
        </RailButton>
        <RailButton
          targetId="plaza-move"
          dropAction="move"
          label={`Move to ${selectedCircle === "family" ? "Friends" : "Family"}`}
          dim={!selectedId}
          onClick={handleMove}
        >
          <MoveIcon />
        </RailButton>
      </div>

      {hint && (
        <div className={styles.hintBubble} role="status">
          {hint}
        </div>
      )}

      {giftPick && !hideMissions && (
        <GiftPickBar
          pick={giftPick}
          names={Object.fromEntries(people.map((person) => [person.id, person.name]))}
          onNext={giftNext}
          onBack={giftBack}
          onLaunch={giftLaunch}
        />
      )}

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </>
  );
}
