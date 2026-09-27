"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- classic JSX runtime needs React in scope
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCircle, getLook, getPerson, MAX_PEOPLE, useRoster } from "@/lib/people/roster";
import { playBlip, playWhistle } from "@/components/maker/sound";
import type { MakerAction, MakerState } from "@/components/maker/flow";
import type { CharacterLook, Circle } from "@/types/character";
import { PLAZA_DROP_ATTR, usePlaza, type PlazaDrop, type WhistleSort } from "./plazaState";
import {
  BackIcon,
  EditIcon,
  HelpIcon,
  MoveIcon,
  NewIcon,
  RemoveIcon,
  SortCircleIcon,
  SortNameIcon,
  WhistleIcon,
} from "./plazaIcons";
import { HelpOverlay } from "./HelpOverlay";
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
  state: MakerState;
  dispatch: (action: MakerAction) => void;
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

export function PlazaRails({ state, dispatch }: PlazaRailsProps) {
  const router = useRouter();

  const selectedId = usePlaza((s) => s.selectedId);
  const select = usePlaza((s) => s.select);
  const dropAction = usePlaza((s) => s.dropAction);
  const clearDrop = usePlaza((s) => s.clearDrop);
  const whistle = usePlaza((s) => s.whistle);
  const setWhistle = usePlaza((s) => s.setWhistle);

  const total = useRoster((s) => s.people.length);
  const setCircle = useRoster((s) => s.setCircle);
  const selectedPerson = useRoster((s) => (selectedId ? s.people.find((p) => p.id === selectedId) ?? null : null));
  const selectedCircle = useRoster((s) => (selectedId ? s.circles[selectedId] : undefined));
  const confirmPerson = useRoster((s) =>
    state.plazaConfirmRemoveId ? s.people.find((p) => p.id === state.plazaConfirmRemoveId) ?? null : null,
  );

  const [helpOpen, setHelpOpen] = useState(false);
  const [whistleMenuOpen, setWhistleMenuOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
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

  function handleBack() {
    playBlip("save");
    router.push("/");
  }

  function handleEdit() {
    if (!selectedId) {
      showHint("Pick someone first");
      return;
    }
    const person = getPerson(selectedId);
    const look = getLook(selectedId);
    const circle = getCircle(selectedId);
    if (!person || !look || !circle) return;
    playBlip("select");
    dispatch({ type: "editPerson", id: selectedId, name: person.name, circle, relationship: person.relationship, look });
  }

  function handleNew() {
    playBlip("select");
    dispatch({ type: "newPerson" });
  }

  const confirmingSelected = selectedId !== null && state.plazaConfirmRemoveId === selectedId;

  function handleRemoveClick() {
    if (!selectedId) {
      showHint("Pick someone first");
      return;
    }
    playBlip("select");
    if (confirmingSelected) {
      dispatch({ type: "confirmRemove" });
      select(null);
    } else {
      dispatch({ type: "requestRemove", id: selectedId });
    }
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

  function handleConfirmRemove() {
    playBlip("select");
    dispatch({ type: "confirmRemove" });
    select(null);
  }

  function handleCancelRemove() {
    playBlip("select");
    dispatch({ type: "cancelRemove" });
  }

  function handleWhistleClick() {
    if (whistle.on) {
      playBlip("select");
      setWhistle({ on: false });
      setWhistleMenuOpen(false);
      return;
    }
    setWhistleMenuOpen((was) => !was);
  }

  function pickSort(sort: WhistleSort) {
    playWhistle();
    setWhistle({ on: true, sort });
    setWhistleMenuOpen(false);
  }

  return (
    <>
      <div className={styles.railLeft}>
        <RailButton targetId="plaza-back" label="Done" onClick={handleBack}>
          <BackIcon />
        </RailButton>
        <RailButton targetId="plaza-edit" dropAction="edit" label="View/Edit" dim={!selectedId} onClick={handleEdit}>
          <EditIcon />
        </RailButton>
        <RailButton targetId="plaza-new" label="New person" disabled={total >= MAX_PEOPLE} onClick={handleNew}>
          <NewIcon />
        </RailButton>
        <RailButton
          targetId="plaza-remove"
          dropAction="remove"
          label={confirmingSelected ? "Remove?" : "Remove"}
          dim={!selectedId}
          active={confirmingSelected}
          onClick={handleRemoveClick}
        >
          <RemoveIcon />
        </RailButton>
        <RailButton targetId="plaza-help" label="Help" active={helpOpen} onClick={() => setHelpOpen((was) => !was)}>
          <HelpIcon />
        </RailButton>
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

      <div className={styles.whistleWrap}>
        {whistleMenuOpen && !whistle.on && (
          <div className={styles.whistleMenu} role="menu" aria-label="Sort everyone by">
            <button
              type="button"
              data-hand-target="plaza-sort-name"
              className={styles.sortButton}
              aria-label="Sort by name"
              onClick={() => pickSort("name")}
            >
              <SortNameIcon size={30} />
            </button>
            <button
              type="button"
              data-hand-target="plaza-sort-circle"
              className={styles.sortButton}
              aria-label="Sort by circle"
              onClick={() => pickSort("circle")}
            >
              <SortCircleIcon size={30} />
            </button>
          </div>
        )}
        <RailButton
          targetId="plaza-whistle"
          label={whistle.on ? `Stop lining up (${whistle.sort === "name" ? "A-Z" : "Circle"})` : "Whistle"}
          active={whistle.on}
          onClick={handleWhistleClick}
        >
          <WhistleIcon />
        </RailButton>
      </div>

      {hint && (
        <div className={styles.hintBubble} role="status">
          {hint}
        </div>
      )}

      {selectedPerson && !state.plazaConfirmRemoveId && <div className={styles.selectedChip}>{selectedPerson.name}</div>}

      {state.plazaConfirmRemoveId && (
        <div className={styles.confirmOverlay} role="alertdialog" aria-modal="true" aria-label="Remove person?">
          <div className={styles.confirmDialog}>
            <p className={styles.confirmMessage}>Remove {confirmPerson?.name ?? "them"}?</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                data-hand-target="plaza-confirm-remove"
                className={`${styles.confirmButton} ${styles.confirmDanger}`}
                onClick={handleConfirmRemove}
              >
                Remove
              </button>
              <button type="button" data-hand-target="plaza-cancel-remove" className={styles.confirmButton} onClick={handleCancelRemove}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </>
  );
}
