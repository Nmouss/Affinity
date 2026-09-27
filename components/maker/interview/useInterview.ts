"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  closingFor,
  extractLocally,
  initialInterviewState,
  interviewReducer,
  introFor,
  mergeForReview,
  QUESTIONS,
  type Effect,
  type ExtractedPreferences,
  type InterviewAnswer,
  type InterviewEvent,
  type InterviewState,
  type Preferences,
} from "@/lib/interview";
import { chooseEngines, createEngines, detectCapabilities, type DeepgramSpeakerDeps, type Recognizer, type Speaker } from "@/lib/voice";
import { setVoiceReaction } from "../reactions";
import { sharedVoiceAudio } from "./voiceUnlock";

// React wiring for the interview: runs the pure machine, executes its effects against the voice
// engines, owns the timers (silence, answer cap, "still listening" nudge), asks the backend for the
// extraction and falls back to the local extractor, and moves the character's mood along.
//
// Effects run from `send`, a plain function called by handlers and engine callbacks, never inside a
// React reducer (Strict Mode double-invokes those). The mount effect is guarded by a session counter
// so its cleanup/re-run in development leaves exactly one live engine set.

export const SILENCE_MS = 1500;
export const ANSWER_CAP_MS = 20_000;
export const NUDGE_MS = 8000;
export const EXTRACT_TIMEOUT_MS = 8000;

export interface Engines {
  recognizer: Recognizer;
  speaker: Speaker;
}

export interface UseInterviewOptions {
  name: string;
  existing: Preferences;
  onFinish: (preferences: Preferences | null) => void;
  /** Tests and stories inject engines; the app detects and creates them. */
  engines?: Engines;
  fetchImpl?: typeof fetch;
}

export interface UseInterviewResult {
  state: InterviewState;
  send: (event: InterviewEvent) => void;
  /** True after the mic has been open a while with nothing heard. */
  nudge: boolean;
  /** Which engines this run ended up with, for the status line. */
  engines: { speaker: "deepgram" | "browser" | "none"; recognizer: "deepgram" | "deepgramBatch" | "browser" | "none" } | null;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export function useInterview({ name, existing, onFinish, engines: injected, fetchImpl }: UseInterviewOptions): UseInterviewResult {
  const [state, setState] = useState<InterviewState>(initialInterviewState);
  const [nudge, setNudge] = useState(false);
  const [choice, setChoice] = useState<UseInterviewResult["engines"]>(null);
  const stateRef = useRef(state);
  const enginesRef = useRef<Engines | null>(injected ?? null);
  const session = useRef(0);
  const timers = useRef<{ silence?: ReturnType<typeof setTimeout>; cap?: ReturnType<typeof setTimeout>; nudge?: ReturnType<typeof setTimeout> }>({});
  const tokenRef = useRef<TokenCache | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  const clearTimers = useCallback(() => {
    const { silence, cap, nudge: nudgeTimer } = timers.current;
    if (silence) clearTimeout(silence);
    if (cap) clearTimeout(cap);
    if (nudgeTimer) clearTimeout(nudgeTimer);
    timers.current = {};
    setNudge(false);
  }, []);

  /** 503 means no Deepgram key at all; anything else means the key exists (prerecorded still works). */
  const configuredRef = useRef<boolean | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const cached = tokenRef.current;
    if (cached && cached.expiresAt - Date.now() > 10_000) return cached.token;
    try {
      const response = await doFetch("/api/voice/token", { method: "POST" });
      configuredRef.current = response.status !== 503;
      if (!response.ok) return null;
      const body = (await response.json()) as { token?: string; expiresIn?: number };
      if (!body.token) return null;
      tokenRef.current = { token: body.token, expiresAt: Date.now() + (body.expiresIn ?? 300) * 1000 };
      return body.token;
    } catch {
      return null;
    }
  }, [doFetch]);

  const sendRef = useRef<(event: InterviewEvent) => void>(() => undefined);

  const runEffect = useCallback(
    (effect: Effect, mySession: number) => {
      const engines = enginesRef.current;
      const alive = () => mySession === session.current;
      switch (effect.type) {
        case "speak": {
          setVoiceReaction("hearingQuestion");
          const speaker = engines?.speaker;
          if (!speaker) {
            sendRef.current({ type: "speakEnd" });
            return;
          }
          void speaker.speak(effect.text).then(() => {
            if (alive()) sendRef.current({ type: "speakEnd" });
          });
          return;
        }
        case "listen": {
          setVoiceReaction("answering");
          clearTimers();
          const recognizer = engines?.recognizer;
          if (!recognizer) {
            sendRef.current({ type: "micError", code: "unsupported" });
            return;
          }
          const armSilence = () => {
            if (timers.current.silence) clearTimeout(timers.current.silence);
            timers.current.silence = setTimeout(() => alive() && sendRef.current({ type: "silence" }), SILENCE_MS);
          };
          timers.current.cap = setTimeout(() => alive() && sendRef.current({ type: "done" }), ANSWER_CAP_MS);
          timers.current.nudge = setTimeout(() => alive() && setNudge(true), NUDGE_MS);
          recognizer.start({
            onInterim: (text) => {
              if (!alive()) return;
              setNudge(false);
              if (timers.current.nudge) clearTimeout(timers.current.nudge);
              sendRef.current({ type: "interim", text });
              armSilence();
            },
            onSpeechStart: () => alive() && sendRef.current({ type: "speechStart" }),
            onSilence: () => alive() && sendRef.current({ type: "silence" }),
            onFinal: (text) => alive() && sendRef.current({ type: "final", text }),
            onError: (code) => alive() && sendRef.current({ type: "micError", code }),
          });
          return;
        }
        case "stopListening":
          clearTimers();
          engines?.recognizer.stop();
          return;
        case "extract": {
          setVoiceReaction("idle");
          void extract(effect.answers, mySession);
          return;
        }
        case "finish":
          setVoiceReaction("idle");
          clearTimers();
          onFinishRef.current(effect.result);
          return;
        case "cancel":
          setVoiceReaction("idle");
          clearTimers();
          engines?.speaker.cancel();
          engines?.recognizer.abort();
          return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extract is defined below and stable per session
    [clearTimers],
  );

  async function extract(answers: InterviewAnswer[], mySession: number) {
    let fresh: ExtractedPreferences | null = null;
    try {
      const response = await doFetch("/api/interview/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, answers }),
        signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
      });
      if (response.ok) {
        const body = (await response.json()) as Partial<ExtractedPreferences>;
        if (body.source === "llm" && Array.isArray(body.loves)) {
          fresh = {
            loves: body.loves ?? [],
            avoids: body.avoids ?? [],
            personality: body.personality ?? [],
            summary: body.summary ?? "",
            source: "llm",
          };
        }
      }
    } catch {
      // Backend down, demo mode, or slow: the local extractor answers instead.
    }
    if (mySession !== session.current) return;
    const result = fresh ?? extractLocally(name, answers);
    const merged = mergeForReview(existing, result);
    sendRef.current({ type: "extracted", result: { ...merged, summary: result.summary, source: result.source } });
  }

  const send = useCallback(
    (event: InterviewEvent) => {
      const mySession = session.current;
      const step = interviewReducer(stateRef.current, event, { name });
      if (step.state !== stateRef.current) {
        stateRef.current = step.state;
        setState(step.state);
      }
      for (const effect of step.effects) runEffect(effect, mySession);
    },
    [name, runEffect],
  );
  sendRef.current = send;

  useEffect(() => {
    const mySession = ++session.current;
    (async () => {
      let engines = injected ?? null;
      let picked: UseInterviewResult["engines"] = null;
      if (!engines) {
        const tokens = (await getToken()) !== null;
        const configured = configuredRef.current ?? tokens;
        if (mySession !== session.current) return;
        const capabilities = detectCapabilities(typeof window === "undefined" ? undefined : window, configured, tokens);
        const choices = chooseEngines(capabilities);
        picked = choices;
        engines = createEngines(choices, {
          deepgramRecognizer: { getToken },
          deepgramBatch: {},
          deepgramSpeaker: {
            // The shared element was primed inside the Save click; HTMLAudioElement satisfies the engine's shape.
            createAudio: (() => sharedVoiceAudio() ?? document.createElement("audio")) as unknown as NonNullable<DeepgramSpeakerDeps["createAudio"]>,
          },
        });
      } else {
        picked = { speaker: engines.speaker.supported ? "browser" : "none", recognizer: engines.recognizer.supported ? "browser" : "none" };
      }
      if (mySession !== session.current) return;
      enginesRef.current = engines;
      setChoice(picked);
      engines.speaker.prefetch?.([introFor(name), ...QUESTIONS.map((question) => question.spoken), closingFor(name)]);
      const canSpeak = engines.speaker.supported;
      const canListen = engines.recognizer.supported;
      sendRef.current({ type: "start", capabilities: { canSpeak, canListen }, mode: canListen ? "voice" : "typed" });
    })();
    return () => {
      session.current += 1;
      clearTimers();
      setVoiceReaction("idle");
      enginesRef.current?.speaker.cancel();
      enginesRef.current?.recognizer.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one interview per mount; name/existing are fixed for its lifetime
  }, []);

  return { state, send, nudge, engines: choice };
}
