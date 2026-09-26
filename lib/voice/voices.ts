// Pure voice-picking and text-shaping helpers — no DOM access, so they're trivial to unit test.
// The director only calls pickVoice/splitSentences; speaker.ts wires them into speechSynthesis.

export interface VoicePersona {
  /** Names to look for in speechSynthesis.getVoices(), best match first. */
  preferred: string[];
  pitch: number;
  rate: number;
}

/** Maya (wife): calm, practical. Ava (daughter): bright, sparkly. Leo (son): excited, silly. */
export const VOICE_PERSONAS: Record<string, VoicePersona> = {
  wife: {
    preferred: ["Samantha", "Ava (Premium)", "Ava (Enhanced)", "Allison", "Google US English"],
    pitch: 1.0,
    rate: 0.95,
  },
  daughter: {
    preferred: ["Karen", "Moira", "Tessa", "Victoria", "Google UK English Female"],
    pitch: 1.4,
    rate: 1.05,
  },
  son: {
    preferred: ["Fred", "Junior", "Daniel", "Alex", "Google UK English Male"],
    pitch: 1.6,
    rate: 1.15,
  },
};

/** Used for any sprite id that isn't one of the three family members. */
export const DEFAULT_PERSONA: VoicePersona = { preferred: [], pitch: 1.0, rate: 1.0 };

export function personaFor(spriteId: string): VoicePersona {
  return VOICE_PERSONAS[spriteId] ?? DEFAULT_PERSONA;
}

/** The slice of SpeechSynthesisVoice that pickVoice needs — lets tests pass plain objects. */
export type VoiceLike = Pick<SpeechSynthesisVoice, "name" | "lang" | "localService" | "default">;

function isEnglish(voice: VoiceLike): boolean {
  return voice.lang.toLowerCase().startsWith("en");
}

/** Case-insensitive "is this voice a match for that preferred name" — browsers add suffixes like "(Enhanced)". */
function matchesPreferred(voice: VoiceLike, preferredName: string): boolean {
  const name = voice.name.toLowerCase();
  const preferred = preferredName.toLowerCase();
  return name === preferred || name.startsWith(preferred) || name.includes(preferred);
}

/** The order the three family personas claim a fallback voice in, so each one lands on a different index. */
const PERSONA_ORDER = ["wife", "daughter", "son"];

function personaOffset(spriteId: string): number {
  const index = PERSONA_ORDER.indexOf(spriteId);
  return index >= 0 ? index : 0;
}

/**
 * Picks a voice for a sprite: preferred name match first, then a localService en-* voice not already
 * claimed by another persona's preferred list — offset by the persona's position so the three sprites
 * land on different candidates when several are equally generic — then any en-* voice, then the
 * platform default, then null if the list is empty.
 */
export function pickVoice(spriteId: string, voices: VoiceLike[]): VoiceLike | null {
  if (voices.length === 0) return null;
  const persona = personaFor(spriteId);

  for (const preferredName of persona.preferred) {
    const match = voices.find((voice) => matchesPreferred(voice, preferredName));
    if (match) return match;
  }

  const otherPreferredNames = new Set(
    Object.entries(VOICE_PERSONAS)
      .filter(([id]) => id !== spriteId)
      .flatMap(([, other]) => other.preferred)
      .map((name) => name.toLowerCase()),
  );
  const localEnglish = voices.filter((voice) => voice.localService && isEnglish(voice));
  const unclaimedLocalEnglish = localEnglish.filter((voice) => !otherPreferredNames.has(voice.name.toLowerCase()));
  const localEnglishPool = unclaimedLocalEnglish.length > 0 ? unclaimedLocalEnglish : localEnglish;
  if (localEnglishPool.length > 0) {
    return localEnglishPool[personaOffset(spriteId) % localEnglishPool.length];
  }

  const anyEnglish = voices.find(isEnglish);
  if (anyEnglish) return anyEnglish;

  const platformDefault = voices.find((voice) => voice.default);
  if (platformDefault) return platformDefault;

  return null;
}

const MAX_UTTERANCE_CHARS = 180;

/** Sentence punctuation, kept with its sentence (lookbehind keeps this a single split, not two). */
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

/** A merged-in fragment is short enough that it reads oddly as its own utterance (e.g. "Mr." or "$5"). */
const MIN_FRAGMENT_CHARS = 6;

/** Chrome silently cuts off long utterances after ~15s of speech, so anything long is hard-wrapped here. */
function wrapLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_UTTERANCE_CHARS) return [sentence];
  const chunks: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_UTTERANCE_CHARS) {
    const window = rest.slice(0, MAX_UTTERANCE_CHARS + 1);
    // Cut *after* the separator (comma+space preferred over a bare space) so it stays glued to the
    // chunk before it, instead of orphaning a leading ", " or " " on the next chunk.
    const commaCut = window.lastIndexOf(", ");
    const spaceCut = window.lastIndexOf(" ");
    let cut = commaCut >= 0 ? commaCut + 2 : spaceCut >= 0 ? spaceCut + 1 : -1;
    if (cut <= 0) cut = MAX_UTTERANCE_CHARS;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Splits spoken text into utterance-sized sentences: split on sentence punctuation, merge fragments
 * that are too short to stand alone, then hard-wrap anything still too long for one utterance.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const rawSentences = trimmed.split(SENTENCE_BOUNDARY).filter((sentence) => sentence.length > 0);

  // Tiny fragments (like "Mr." after splitting on the period) merge into a neighbor rather than
  // becoming their own utterance. Prefer merging forward; only fall back to the previous sentence
  // for a trailing fragment that has no "next" to join.
  const merged: string[] = [];
  let pending = "";
  for (const sentence of rawSentences) {
    pending = pending ? `${pending} ${sentence}` : sentence;
    if (pending.length >= MIN_FRAGMENT_CHARS) {
      merged.push(pending);
      pending = "";
    }
  }
  if (pending) {
    if (merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${pending}`;
    } else {
      merged.push(pending);
    }
  }

  return merged.flatMap(wrapLongSentence);
}
