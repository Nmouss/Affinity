import { useEffect, useRef, useState } from "react";
import { type SpeechSession, speechSupported, startSpeech } from "./speech";

type Phase = "idle" | "recording" | "transcribing" | "error";

interface Props {
  /** Called with the captured transcript once the button is released. */
  onTranscript: (text: string, source: "live" | "demo") => void;
  /** Preloaded transcript used when live speech is unavailable or fails. */
  demoTranscript?: string;
  label?: string;
  compact?: boolean;
}

/**
 * Hold-to-talk button. Pointer: press and hold. Keyboard: hold Space or Enter while focused.
 * The mic is never opened without a press. When speech isn't available the same button produces
 * the preloaded demo transcript, clearly labeled as such on the confirmation screen.
 */
export function PushToTalk({ onTranscript, demoTranscript, label = "Hold to talk", compact }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const session = useRef<SpeechSession | null>(null);
  const holding = useRef(false);
  const supported = speechSupported();

  useEffect(() => () => session.current?.cancel(), []);

  function begin() {
    if (holding.current || phase === "transcribing") return;
    holding.current = true;
    setMessage(null);
    if (!supported) return;
    session.current = startSpeech(setInterim);
    if (!session.current) {
      setPhase("error");
      setMessage("Microphone unavailable.");
      return;
    }
    setInterim("");
    setPhase("recording");
  }

  async function end() {
    if (!holding.current) return;
    holding.current = false;
    if (!supported || !session.current) {
      if (demoTranscript) onTranscript(demoTranscript, "demo");
      else if (!supported) setMessage("Voice isn’t available in this browser. Type instead, or use the buttons.");
      setPhase("idle");
      return;
    }
    setPhase("transcribing");
    try {
      const text = await session.current.stop();
      session.current = null;
      if (text) {
        setPhase("idle");
        onTranscript(text, "live");
      } else {
        setPhase("error");
        setMessage("I didn’t hear anything. Hold the button while you speak.");
      }
    } catch (error) {
      session.current = null;
      setPhase("error");
      setMessage(`Speech failed (${error instanceof Error ? error.message : "unknown"}).`);
    }
  }

  const buttonLabel =
    phase === "recording" ? "Recording… release to stop" : phase === "transcribing" ? "Transcribing…" : supported ? label : `${label} (demo transcript)`;

  return (
    <div className={compact ? "ptt ptt--compact" : "ptt"}>
      <button
        type="button"
        className={`btn btn--voice${phase === "recording" ? " is-recording" : ""}`}
        aria-pressed={phase === "recording"}
        aria-describedby="ptt-hint"
        disabled={phase === "transcribing"}
        onPointerDown={(e) => {
          e.preventDefault();
          begin();
        }}
        onPointerUp={end}
        onPointerLeave={() => phase === "recording" && end()}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            begin();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            end();
          }
        }}
      >
        <span aria-hidden="true" className="ptt__dot" />
        {buttonLabel}
      </button>
      <span id="ptt-hint" className="sr-only">
        Press and hold to record. Release to stop. You will see and can edit the transcript before anything happens.
      </span>
      <div aria-live="polite" className="ptt__status">
        {phase === "recording" && <span>{interim ? `“${interim}”` : "Listening…"}</span>}
        {message && (
          <span className="ptt__error">
            {message}{" "}
            {demoTranscript && (
              <button type="button" className="link" onClick={() => onTranscript(demoTranscript, "demo")}>
                Use demo transcript
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
