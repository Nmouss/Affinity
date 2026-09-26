"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getCircle, getLook, getPerson, MAX_PEOPLE, useCircle, useRoster } from "@/lib/people/roster";
import type { Circle } from "@/types/character";
import type { MakerAction } from "./flow";
import { playBlip } from "./sound";
import styles from "./PlazaPanel.module.css";

export interface PlazaPanelProps {
  dispatch: (action: MakerAction) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function PersonChip({ id, name, selected, onSelect }: { id: string; name: string; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      data-hand-target={`person:${id}`}
      className={selected ? `${styles.chip} ${styles.chipSelected}` : styles.chip}
      aria-pressed={selected}
      onClick={() => {
        playBlip("select");
        onSelect(id);
      }}
    >
      {name}
    </button>
  );
}

function Corner({
  title,
  people,
  selectedId,
  onSelect,
}: {
  title: string;
  people: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.corner}>
      <h2 className={styles.cornerTitle}>{title}</h2>
      <div className={styles.chips}>
        {people.length === 0 && <p className={styles.empty}>Nobody here yet.</p>}
        {people.map((person) => (
          <PersonChip key={person.id} id={person.id} name={person.name} selected={selectedId === person.id} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

export function PlazaPanel({ dispatch, selectedId, onSelect }: PlazaPanelProps) {
  const router = useRouter();
  const family = useCircle("family");
  const friends = useCircle("friend");
  const removePerson = useRoster((state) => state.removePerson);
  const setCircle = useRoster((state) => state.setCircle);
  const total = family.length + friends.length;
  const [confirmRemove, setConfirmRemove] = useState(false);

  function handleNewPerson() {
    playBlip("select");
    dispatch({ type: "newPerson" });
  }

  function handleEdit() {
    if (!selectedId) return;
    const person = getPerson(selectedId);
    const look = getLook(selectedId);
    const circle = getCircle(selectedId);
    if (!person || !look || !circle) return;
    playBlip("select");
    dispatch({ type: "editPerson", id: selectedId, name: person.name, circle, relationship: person.relationship, look });
  }

  function handleMove() {
    if (!selectedId) return;
    const circle: Circle | undefined = getCircle(selectedId);
    if (!circle) return;
    playBlip("select");
    setCircle(selectedId, circle === "family" ? "friend" : "family");
  }

  function handleRemove() {
    if (!selectedId) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    playBlip("select");
    removePerson(selectedId);
    onSelect(null);
    setConfirmRemove(false);
  }

  function handleDone() {
    playBlip("save");
    router.push("/");
  }

  const hasSelection = selectedId !== null;

  return (
    <div className={styles.plaza}>
      <div className={styles.corners}>
        <Corner title="Family" people={family} selectedId={selectedId} onSelect={onSelect} />
        <Corner title="Friends" people={friends} selectedId={selectedId} onSelect={onSelect} />
      </div>

      <div className={styles.toolbar}>
        <button type="button" data-hand-target="plaza-new" className={styles.button} disabled={total >= MAX_PEOPLE} onClick={handleNewPerson}>
          New person
        </button>
        <button type="button" data-hand-target="plaza-edit" className={styles.button} disabled={!hasSelection} onClick={handleEdit}>
          Edit
        </button>
        <button type="button" data-hand-target="plaza-move" className={styles.button} disabled={!hasSelection} onClick={handleMove}>
          Move to {selectedId && getCircle(selectedId) === "family" ? "Friends" : "Family"}
        </button>
        <button
          type="button"
          data-hand-target="plaza-remove"
          className={confirmRemove ? `${styles.button} ${styles.danger}` : styles.button}
          disabled={!hasSelection}
          onClick={handleRemove}
        >
          {confirmRemove ? "Remove?" : "Remove"}
        </button>
        <button type="button" data-hand-target="plaza-done" className={`${styles.button} ${styles.done}`} onClick={handleDone}>
          Done &rarr; Living room
        </button>
      </div>
    </div>
  );
}
