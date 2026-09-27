"use client";

import { useState, type FormEvent } from "react";
import { CrossIcon, KeyboardIcon, MicIcon, SpeakerIcon } from "@/components/hud/icons";
import { currentQuestion, progress, type Preferences } from "@/lib/interview";
import { playBlip } from "../sound";
import { useInterview } from "./useInterview";
import styles from "./InterviewPanel.module.css";

// The getting-to-know-you interview, beside the character in the editor shell. The question is
// spoken and shown; the mic opens after it; the answer ends on silence or Done; typing is always a
// tap away. The review step shows what was picked up as chips the person can trim or add to.

export interface InterviewPanelProps {
  name: string;
  existing: Preferences;
  onFinish: (preferences: Preferences | null) => void;
}

const ROWS: Array<{ list: keyof Preferences; label: string; chipClass?: string }> = [
  { list: "loves", label: "Loves" },
  { list: "avoids", label: "Avoids" },
  { list: "personality", label: "Personality" },
];

export function InterviewPanel({ name, existing, onFinish }: InterviewPanelProps) {
  const { state, send, nudge, engines } = useInterview({ name, existing, onFinish });
  const question = currentQuestion(state);
  const { index, total } = progress(state);
  const answering = state.phase === "listening" || state.phase === "typing";
  const typingNow = state.phase === "typing";

  const skipForNow = () => {
    playBlip("select");
    send({ type: "skip" });
  };

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    if (!state.typed.trim()) return;
    playBlip("select");
    send({ type: "submitTyped" });
  };

  const statusLine = (() => {
    if (state.phase === "intro" || state.phase === "asking") return { icon: <SpeakerIcon size={18} />, text: "Asking…", tone: styles.speaking };
    if (state.phase === "listening") return { icon: <MicIcon size={18} />, text: nudge ? "Still listening. Tap Done or type if it's easier." : "Listening… take your time, then tap Done", tone: styles.listening };
    if (state.phase === "typing") return { icon: <KeyboardIcon size={18} />, text: "Type your answer and press Send", tone: "" };
    return null;
  })();

  return (
    <section className={styles.panel} aria-label={`Getting to know ${name}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          {state.phase === "review" ? `Here's what I picked up` : state.script.knows ? `Getting to know ${name} better` : `Getting to know ${name}`}
        </h2>
        {total > 1 && state.phase !== "review" && state.phase !== "extracting" && state.phase !== "finished" && (
          <span className={styles.progress} aria-live="polite">
            {state.phase === "intro" || state.phase === "idle" ? "Hello" : `Question ${index + 1} of ${total}`}
          </span>
        )}
      </div>

      {total > 1 && state.phase !== "review" && state.phase !== "extracting" && (
        <div className={styles.dots} aria-hidden>
          {Array.from({ length: total }, (_, dot) => (
            <span key={dot} className={dot < index || state.phase === "finished" ? styles.dotDone : dot === index && state.phase !== "intro" ? styles.dotNow : styles.dot} />
          ))}
        </div>
      )}

      {(state.phase === "idle" || state.phase === "intro") && (
        <>
          <p className={styles.question}>{state.script.knows ? `Let's get to know ${name} a bit better.` : `Nice to meet you, ${name}. Tell me a bit about yourself.`}</p>
          <p className={styles.hint}>Out loud, or typed if you&apos;d rather.</p>
        </>
      )}

      {(state.phase === "asking" || answering) && question && (
        <>
          <p className={styles.question}>{question.spoken}</p>
          <p className={styles.hint}>{question.hint}</p>
        </>
      )}

      {statusLine && (
        <div className={`${styles.status} ${statusLine.tone}`} role="status">
          <span className={styles.statusIcon}>{statusLine.icon}</span>
          {statusLine.text}
        </div>
      )}

      {state.phase === "listening" && (
        <p className={`${styles.caption} ${state.interim ? "" : styles.captionEmpty}`} aria-live="polite">
          {state.interim || "Your words will appear here as you talk."}
        </p>
      )}

      {state.notice && (
        <p className={styles.notice} role="status">
          {state.notice}
        </p>
      )}

      {typingNow && (
        <form className={styles.typeRow} onSubmit={submitTyped}>
          <input
            className={styles.input}
            value={state.typed}
            onChange={(event) => send({ type: "typed", text: event.target.value })}
            placeholder="Type your answer"
            autoFocus
            autoComplete="off"
            aria-label="Your answer"
          />
          <button type="submit" className={styles.primary} data-hand-target="interview-send" disabled={!state.typed.trim()}>
            Send
          </button>
        </form>
      )}

      {answering && (
        <div className={styles.actions}>
          {state.phase === "listening" && (
            <>
              <button type="button" className={styles.primary} data-hand-target="interview-done" onClick={() => { playBlip("select"); send({ type: "done" }); }}>
                Done
              </button>
              <button type="button" className={styles.button} data-hand-target="interview-type" onClick={() => { playBlip("select"); send({ type: "useTyping" }); }}>
                <KeyboardIcon size={16} /> Type instead
              </button>
            </>
          )}
          <button type="button" className={styles.ghost} data-hand-target="interview-skip-question" onClick={() => { playBlip("select"); send({ type: "skipQuestion" }); }}>
            Skip question
          </button>
        </div>
      )}

      {state.phase === "extracting" && (
        <div className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden />
          Thanks, {name}. Give me a second.
        </div>
      )}

      {state.phase === "review" && state.result && (
        <>
          <p className={styles.summary}>{state.result.summary}</p>
          <p className={styles.hint}>Remove anything that&apos;s off, or add a chip.</p>
          <div className={styles.rows}>
            {ROWS.map((row) => (
              <ChipRow
                key={row.list}
                label={row.label}
                list={row.list}
                values={state.result![row.list]}
                onRemove={(value) => send({ type: "removeChip", list: row.list, value })}
                onAdd={(value) => send({ type: "addChip", list: row.list, value })}
              />
            ))}
          </div>
        </>
      )}

      <div className={styles.footer}>
        {state.phase === "review" ? (
          <>
            <button type="button" className={styles.ghost} data-hand-target="interview-skip" onClick={skipForNow}>
              Skip for now
            </button>
            <button type="button" className={styles.primary} data-hand-target="interview-save" onClick={() => { playBlip("save"); send({ type: "save" }); }}>
              Save
            </button>
          </>
        ) : (
          <>
            <span className={styles.hint}>
              {engines?.recognizer === "none" && engines?.speaker === "none" ? "Voice is off in this browser. Type your answers." : ""}
            </span>
            <button type="button" className={styles.ghost} data-hand-target="interview-skip" onClick={skipForNow} disabled={state.phase === "finished"}>
              Skip for now
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function ChipRow({
  label,
  list,
  values,
  onRemove,
  onAdd,
}: {
  label: string;
  list: keyof Preferences;
  values: string[];
  onRemove: (value: string) => void;
  onAdd: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const chipClass = list === "avoids" ? `${styles.chip} ${styles.chipAvoid}` : list === "personality" ? `${styles.chip} ${styles.chipTrait}` : styles.chip;
  const add = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    playBlip("select");
    onAdd(value);
    setDraft("");
  };
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.chips}>
        {values.map((value) => (
          <button key={value} type="button" className={chipClass} aria-label={`Remove ${value}`} title={`Remove ${value}`} onClick={() => { playBlip("select"); onRemove(value); }}>
            {value}
            <span className={styles.chipIcon} aria-hidden>
              <CrossIcon size={10} />
            </span>
          </button>
        ))}
        <form className={styles.addForm} onSubmit={add}>
          <input className={styles.addInput} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add" aria-label={`Add to ${label}`} />
        </form>
      </div>
    </div>
  );
}
