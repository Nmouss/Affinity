// speechSynthesis text-to-speech, one queued utterance per sentence, styled per sprite persona.
// A minimal local shape stands in for the DOM's SpeechSynthesis/SpeechSynthesisUtterance so tests
// (running under vitest's node environment) can inject a fake without a real browser around them.
import type { CreateSpeaker, Speaker } from "./types";
import { personaFor, pickVoice, splitSentences, type VoiceLike } from "./voices";

export interface UtteranceLike {
  text: string;
  voice?: VoiceLike | null;
  pitch?: number;
  rate?: number;
  volume?: number;
  onend: ((event?: unknown) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
}

export interface SpeechSynthesisLike {
  getVoices(): VoiceLike[];
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  resume(): void;
  addEventListener(type: "voiceschanged", listener: () => void): void;
  removeEventListener(type: "voiceschanged", listener: () => void): void;
}

export interface SpeakerDeps {
  /** Defaults to the global `speechSynthesis`. Tests inject a fake (node has no Web Speech APIs). */
  synth?: SpeechSynthesisLike;
  /** Defaults to `new SpeechSynthesisUtterance(text)`. Tests inject a fake utterance factory. */
  createUtterance?: (text: string) => UtteranceLike;
}

/** Chrome can silently pause a long utterance queue; nudging resume() periodically works around it. */
const RESUME_WORKAROUND_MS = 10_000;

function resolveSynth(deps: SpeakerDeps): SpeechSynthesisLike | undefined {
  if (deps.synth) return deps.synth;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  return window.speechSynthesis as unknown as SpeechSynthesisLike;
}

function resolveCreateUtterance(deps: SpeakerDeps): (text: string) => UtteranceLike {
  if (deps.createUtterance) return deps.createUtterance;
  return (text: string) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike;
}

interface PendingSpeak {
  resolve: () => void;
  safetyTimer: ReturnType<typeof setTimeout> | null;
  resolved: boolean;
}

/** `createSpeaker` implements `CreateSpeaker`; the optional `deps` param is for test injection. */
export function createSpeaker(deps: SpeakerDeps = {}): Speaker {
  const synth = resolveSynth(deps);
  const createUtterance = resolveCreateUtterance(deps);
  const supported = Boolean(synth);

  let unlocked = false;
  let voices: VoiceLike[] = synth?.getVoices() ?? [];
  const pending = new Set<PendingSpeak>();
  let resumeTimer: ReturnType<typeof setInterval> | null = null;

  if (synth) {
    // Voices load asynchronously in most engines; refresh the cache whenever the list changes.
    synth.addEventListener("voiceschanged", () => {
      voices = synth.getVoices();
    });
  }

  function startResumeWorkaround() {
    if (resumeTimer !== null || !synth) return;
    resumeTimer = setInterval(() => synth.resume(), RESUME_WORKAROUND_MS);
  }

  function stopResumeWorkaroundIfIdle() {
    if (pending.size === 0 && resumeTimer !== null) {
      clearInterval(resumeTimer);
      resumeTimer = null;
    }
  }

  function unlock() {
    if (!supported || !synth) return;
    const utterance = createUtterance(" ");
    utterance.volume = 0;
    utterance.onerror = () => {
      // A zero-volume utterance can still report an error on some engines; harmless either way.
    };
    try {
      synth.speak(utterance);
    } catch {
      // Fall through — activation is sticky, so a real speak() later will confirm or correct this.
    }
    // Optimistic: a genuine "not-allowed" on a later real speak() flips this back off.
    unlocked = true;
  }

  function speak(spriteId: string, text: string): Promise<void> {
    if (!supported || !synth) return Promise.resolve();
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();

    const sentences = splitSentences(trimmed);
    if (sentences.length === 0) return Promise.resolve();

    const persona = personaFor(spriteId);
    const voice = pickVoice(spriteId, voices);

    return new Promise<void>((resolvePromise) => {
      const entry: PendingSpeak = { resolve: () => undefined, safetyTimer: null, resolved: false };

      const finish = () => {
        if (entry.resolved) return;
        entry.resolved = true;
        if (entry.safetyTimer !== null) clearTimeout(entry.safetyTimer);
        pending.delete(entry);
        stopResumeWorkaroundIfIdle();
        resolvePromise();
      };
      entry.resolve = finish;
      pending.add(entry);
      startResumeWorkaround();

      // A stuck engine (or a browser tab losing focus) can never fire `end`; cap how long we wait.
      const safetyMs = (trimmed.length / 10 + 2) * 1000;
      entry.safetyTimer = setTimeout(finish, safetyMs);

      let index = 0;
      const speakNext = () => {
        if (index >= sentences.length) {
          finish();
          return;
        }
        const utterance = createUtterance(sentences[index]);
        index += 1;
        if (voice) utterance.voice = voice;
        utterance.pitch = persona.pitch;
        utterance.rate = persona.rate;
        utterance.onend = () => speakNext();
        utterance.onerror = (event) => {
          if (event?.error === "not-allowed") unlocked = false;
          finish();
        };
        synth.speak(utterance);
      };
      speakNext();
    });
  }

  function cancel() {
    synth?.cancel();
    for (const entry of Array.from(pending)) {
      entry.resolve();
    }
  }

  return {
    supported,
    get unlocked() {
      return unlocked;
    },
    unlock,
    speak,
    cancel,
  };
}

// Documents the intended contract shape without narrowing createSpeaker's own (wider, DI-friendly) type.
const _typecheck: CreateSpeaker = createSpeaker;
void _typecheck;
