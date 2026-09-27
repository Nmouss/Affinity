"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- classic JSX runtime needs React in scope
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { getCircle, getLook, getPerson, MAX_PEOPLE, useRoster } from "@/lib/people/roster";
import { playBlip } from "@/components/maker/sound";
import type { MakerAction } from "@/components/maker/flow";
import type { CharacterLook, Circle } from "@/types/character";
import { PLAZA_DROP_ATTR, usePlaza, type PlazaDrop } from "./plazaState";
import { DinnerPlanIcon, HelpIcon, MoveIcon, NewIcon, ShopTogetherIcon } from "./plazaIcons";
import { HelpOverlay } from "./HelpOverlay";
import { RecipientPicker } from "./RecipientPicker";
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
  getPerson: (id: string) => { name: string; relationship: string } | undefined;
  getLook: (id: string) => CharacterLook | undefined;
  getCircle: (id: string) => Circle | undefined;
}

export type PlazaDropResult =
  | { kind: "editPerson"; id: string; name: string; circle: Circle; relationship: string; look: CharacterLook }
  | { kind: "requestRemove"; id: string }
  | { kind: "move"; id: string; from: Circle; to: Circle }
  | null;

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
  dropAction?: "edit" | "remove" | "move";
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

export function PlazaRails({ dispatch, onLaunch }: PlazaRailsProps) {
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
  const [shopPicker, setShopPicker] = useState<{ invited: string[]; selected: string[] } | null>(null);
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
    } else if (result?.kind === "requestRemove") {
      dispatch({ type: "requestRemove", id: result.id });
    } else if (result?.kind === "move") {
      playBlip("select");
      setCircle(result.id, result.to);
    }
    clearDrop();
  }, [dropAction, dispatch, setCircle, clearDrop]);

  function launchCouncil(mode: "shopping" | "plan") {
    if (people.length === 0) {
      showHint("Add someone to your world first");
      return;
    }
    const knownIds = new Set(people.map((person) => person.id));
    const invited = missionMemberIds.filter((id) => knownIds.has(id));
    if (invited.length === 0) {
      showHint("Drag people into the mission circle first");
      return;
    }
    playBlip("select");
    if (mode === "shopping") {
      if (invited.length === 1) {
        onLaunch(mode, invited, invited);
        return;
      }
      setShopPicker({ invited, selected: [] });
      return;
    }
    onLaunch(mode, invited);
  }

  function handleNew() {
    playBlip("select");
    dispatch({ type: "newPerson" });
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

      <div className={styles.missionActions} aria-label="Plan with your connections">
        <p className={styles.missionLabel}>
          {missionMemberIds.length === 0
            ? "Build your mission circle"
            : `${missionMemberIds.length} ${missionMemberIds.length === 1 ? "person" : "people"} in this mission`}
        </p>
        <button type="button" data-hand-target="plaza-shop" className={`${styles.missionButton} ${styles.shopMission}`} onClick={() => launchCouncil("shopping")}>
          <span className={styles.missionIcon}><ShopTogetherIcon size={28} /></span>
          <span><strong>Shop together</strong><small>Choose who the gifts are for</small></span>
        </button>
        <button type="button" data-hand-target="plaza-dinner" className={`${styles.missionButton} ${styles.planMission}`} onClick={() => launchCouncil("plan")}>
          <span className={styles.missionIcon}><DinnerPlanIcon size={28} /></span>
          <span><strong>Make dinner plans</strong><small>Choose a place and activity</small></span>
        </button>
      </div>

      <div className={styles.railRight}>
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

      {shopPicker && (
        <RecipientPicker
          candidateIds={shopPicker.invited}
          selectedIds={shopPicker.selected}
          onToggle={(id) =>
            setShopPicker((current) => {
              if (!current) return current;
              const on = current.selected.includes(id);
              return {
                ...current,
                selected: on ? current.selected.filter((entry) => entry !== id) : [...current.selected, id],
              };
            })
          }
          onConfirm={() => {
            if (shopPicker.selected.length === 0) return;
            playBlip("select");
            onLaunch("shopping", shopPicker.invited, shopPicker.selected);
            setShopPicker(null);
          }}
          onCancel={() => setShopPicker(null)}
        />
      )}

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </>
  );
}
