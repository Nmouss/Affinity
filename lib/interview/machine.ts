import { normalizePreferences } from "./extract";
import { scriptFor, type InterviewScript } from "./script";
import { EMPTY_PREFERENCES } from "./types";
import type { ExtractedPreferences, InterviewAnswer, InterviewQuestion, Preferences } from "./types";

// The interview as a pure state machine. UI and voice engines dispatch events; the reducer returns
// the next state plus effects (speak, listen, extract, finish) for the hook to run. Nothing here
// touches React, the DOM, or a microphone, so the whole conversation is exercised in machine.test.ts.

export type Phase = "idle" | "intro" | "asking" | "listening" | "typing" | "extracting" | "review" | "finished";
export type Mode = "voice" | "typed";

export interface Capabilities {
  canSpeak: boolean;
  canListen: boolean;
}

export interface InterviewState {
  phase: Phase;
  mode: Mode;
  /** Which prompt we're on (one per run today). */
  index: number;
  /** One recorded answer per question, "" when skipped. */
  answers: string[];
  /** Live transcript while listening. */
  interim: string;
  /** The typed draft while in typing mode. */
  typed: string;
  /** How many times the current question heard nothing. */
  retries: number;
  /** True between asking the recognizer to stop and receiving its final transcript. */
  stopping: boolean;
  notice: string | null;
  result: ExtractedPreferences | null;
  capabilities: Capabilities;
  /** The words for this run: first-meeting or getting-to-know-you-better. Set on start. */
  script: InterviewScript;
}

export type InterviewEvent =
  | { type: "start"; capabilities: Capabilities; mode?: Mode }
  | { type: "speakEnd" }
  | { type: "speechStart" }
  | { type: "interim"; text: string }
  | { type: "silence" }
  | { type: "done" }
  | { type: "final"; text: string }
  | { type: "typed"; text: string }
  | { type: "submitTyped" }
  | { type: "useTyping" }
  | { type: "skipQuestion" }
  | { type: "micError"; code: string }
  | { type: "extracted"; result: ExtractedPreferences }
  | { type: "removeChip"; list: keyof Preferences; value: string }
  | { type: "addChip"; list: keyof Preferences; value: string }
  | { type: "save" }
  | { type: "skip" };

export type Effect =
  | { type: "speak"; text: string }
  | { type: "listen" }
  | { type: "stopListening" }
  | { type: "extract"; answers: InterviewAnswer[] }
  | { type: "finish"; result: Preferences | null }
  | { type: "cancel" };

export interface Step {
  state: InterviewState;
  effects: Effect[];
}

export const NOTICES = {
  retry: "Didn't catch that. Say it again, or type your answer.",
  micUnavailable: "Mic unavailable. Type your answers instead.",
  voiceOff: "Voice is off in this browser. Type your answers.",
} as const;

export function initialInterviewState(): InterviewState {
  return {
    phase: "idle",
    mode: "voice",
    index: 0,
    answers: [],
    interim: "",
    typed: "",
    retries: 0,
    stopping: false,
    notice: null,
    result: null,
    capabilities: { canSpeak: false, canListen: false },
    script: scriptFor("", EMPTY_PREFERENCES),
  };
}

export function currentQuestion(state: Pick<InterviewState, "index" | "script">): InterviewQuestion | null {
  return state.index === 0 ? state.script.question : null;
}

/** One prompt per run. */
export const QUESTION_COUNT = 1;

export function progress(state: Pick<InterviewState, "index">): { index: number; total: number } {
  return { index: Math.min(state.index, QUESTION_COUNT - 1), total: QUESTION_COUNT };
}

const ANSWERING: readonly Phase[] = ["listening", "typing"];

const same = (state: InterviewState): Step => ({ state, effects: [] });

/** Whether this run hears the person: voice mode and a working recognizer. */
function hears(state: InterviewState): boolean {
  return state.mode === "voice" && state.capabilities.canListen;
}

/** After a question has been asked: open the mic, or the keyboard when the mic is out. */
function answerPhase(state: InterviewState): Step {
  if (hears(state)) return { state: { ...state, phase: "listening", interim: "", stopping: false }, effects: [{ type: "listen" }] };
  return { state: { ...state, phase: "typing", typed: "" }, effects: [] };
}

/** Speaks `text` when there's a voice; otherwise the line is shown and we move on at once. */
function ask(state: InterviewState, text: string, then: (state: InterviewState) => Step): Step {
  if (state.capabilities.canSpeak) return { state, effects: [{ type: "speak", text }] };
  return then(state);
}

function askQuestion(state: InterviewState): Step {
  const question = currentQuestion(state);
  if (!question) return same(state);
  const asking: InterviewState = { ...state, phase: "asking", interim: "", typed: "", stopping: false };
  return ask(asking, question.spoken, answerPhase);
}

function answersOf(state: InterviewState): InterviewAnswer[] {
  const question = state.script.question;
  return [{ questionId: question.id, question: question.spoken, answer: state.answers[0] ?? "", feeds: question.feeds }];
}

/** Records the answer for the current question and moves to the next one, or to extraction. */
function record(state: InterviewState, answer: string): Step {
  const answers = [...state.answers];
  answers[state.index] = answer.trim();
  const next: InterviewState = { ...state, answers, retries: 0, notice: null, interim: "", typed: "", stopping: false };
  if (state.index + 1 < QUESTION_COUNT) return askQuestion({ ...next, index: state.index + 1 });
  const extracting: InterviewState = { ...next, phase: "extracting" };
  const extract: Effect = { type: "extract", answers: answersOf(extracting) };
  if (extracting.capabilities.canSpeak) return { state: extracting, effects: [{ type: "speak", text: state.script.closing }, extract] };
  return { state: extracting, effects: [extract] };
}

export interface ReducerOptions {
  /** The person's name, for the spoken intro and closing. */
  name: string;
  /** What the roster already knows; when there is anything, the prompt builds on it. */
  existing?: Preferences;
}

export function interviewReducer(state: InterviewState, event: InterviewEvent, options: ReducerOptions = { name: "" }): Step {
  const { name, existing = EMPTY_PREFERENCES } = options;
  switch (event.type) {
    case "start": {
      if (state.phase !== "idle") return same(state);
      const mode: Mode = event.mode ?? (event.capabilities.canListen ? "voice" : "typed");
      const started: InterviewState = {
        ...initialInterviewState(),
        phase: "intro",
        mode,
        capabilities: event.capabilities,
        notice: !event.capabilities.canListen && !event.capabilities.canSpeak ? NOTICES.voiceOff : null,
        script: scriptFor(name, existing),
      };
      return ask(started, started.script.intro, askQuestion);
    }

    case "speakEnd": {
      if (state.phase === "intro") return askQuestion(state);
      if (state.phase === "asking") return answerPhase(state);
      return same(state);
    }

    case "speechStart":
      return state.phase === "listening" ? { state: { ...state, notice: null }, effects: [] } : same(state);

    case "interim":
      return state.phase === "listening" ? { state: { ...state, interim: event.text }, effects: [] } : same(state);

    case "silence":
    case "done": {
      if (state.phase !== "listening" || state.stopping) return same(state);
      return { state: { ...state, stopping: true }, effects: [{ type: "stopListening" }] };
    }

    case "final": {
      if (state.phase !== "listening") return same(state);
      const text = event.text.trim();
      if (!text && state.retries === 0) {
        return {
          state: { ...state, retries: 1, notice: NOTICES.retry, interim: "", stopping: false },
          effects: [{ type: "listen" }],
        };
      }
      return record(state, text);
    }

    case "typed":
      return state.phase === "typing" ? { state: { ...state, typed: event.text }, effects: [] } : same(state);

    case "submitTyped": {
      if (state.phase !== "typing") return same(state);
      const text = state.typed.trim();
      if (!text) return same(state);
      return record(state, text);
    }

    case "useTyping": {
      if (!ANSWERING.includes(state.phase) && state.phase !== "asking") return same(state);
      const typed: InterviewState = { ...state, mode: "typed", phase: "typing", typed: "", interim: "", stopping: false, notice: null };
      return { state: typed, effects: state.phase === "listening" ? [{ type: "stopListening" }] : [] };
    }

    case "skipQuestion": {
      if (!ANSWERING.includes(state.phase) && state.phase !== "asking") return same(state);
      const step = record(state, "");
      return state.phase === "listening" ? { state: step.state, effects: [{ type: "stopListening" }, ...step.effects] } : step;
    }

    case "micError": {
      if (!ANSWERING.includes(state.phase) && state.phase !== "asking") return same(state);
      const typed: InterviewState = {
        ...state,
        mode: "typed",
        phase: "typing",
        typed: "",
        interim: "",
        stopping: false,
        notice: NOTICES.micUnavailable,
        capabilities: { ...state.capabilities, canListen: false },
      };
      return { state: typed, effects: [] };
    }

    case "extracted":
      return state.phase === "extracting" ? { state: { ...state, phase: "review", result: event.result }, effects: [] } : same(state);

    case "removeChip": {
      if (state.phase !== "review" || !state.result) return same(state);
      const list = state.result[event.list].filter((item) => item !== event.value);
      return { state: { ...state, result: { ...state.result, [event.list]: list } }, effects: [] };
    }

    case "addChip": {
      if (state.phase !== "review" || !state.result) return same(state);
      const merged = normalizePreferences(
        { ...state.result, [event.list]: [...state.result[event.list], event.value] },
        { loves: 12, avoids: 8, personality: 6 },
      );
      return { state: { ...state, result: { ...state.result, [event.list]: merged[event.list] } }, effects: [] };
    }

    case "save": {
      if (state.phase !== "review" || !state.result) return same(state);
      const { loves, avoids, personality } = state.result;
      return { state: { ...state, phase: "finished" }, effects: [{ type: "finish", result: { loves, avoids, personality } }] };
    }

    case "skip": {
      if (state.phase === "finished") return same(state);
      return { state: { ...state, phase: "finished", stopping: false }, effects: [{ type: "cancel" }, { type: "finish", result: null }] };
    }

    default:
      return same(state);
  }
}
