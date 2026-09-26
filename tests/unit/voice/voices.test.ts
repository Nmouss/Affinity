import { describe, expect, it } from "vitest";
import { pickVoice, splitSentences, VOICE_PERSONAS, type VoiceLike } from "@/lib/voice/voices";

function voice(name: string, opts: Partial<VoiceLike> = {}): VoiceLike {
  return { name, lang: "en-US", localService: true, default: false, ...opts };
}

describe("pickVoice", () => {
  it("matches a preferred name exactly", () => {
    const voices = [voice("Samantha"), voice("Fred")];
    expect(pickVoice("wife", voices)?.name).toBe("Samantha");
  });

  it("matches a preferred name case-insensitively and by prefix/contains", () => {
    const voices = [voice("samantha (enhanced)")];
    expect(pickVoice("wife", voices)?.name).toBe("samantha (enhanced)");
  });

  it("falls back to a localService en-* voice when no preferred name is present", () => {
    const voices = [voice("Some Remote Voice", { localService: false, lang: "en-GB" }), voice("Local English", { lang: "en-GB" })];
    expect(pickVoice("wife", voices)?.name).toBe("Local English");
  });

  it("falls back to any en-* voice when nothing local matches", () => {
    const voices = [voice("Remote English", { localService: false }), voice("Voix Francaise", { lang: "fr-FR" })];
    expect(pickVoice("wife", voices)?.name).toBe("Remote English");
  });

  it("falls back to the platform default voice when nothing else matches", () => {
    const voices = [voice("Voix Francaise", { lang: "fr-FR" }), voice("Deutsche Stimme", { lang: "de-DE", default: true })];
    expect(pickVoice("wife", voices)?.name).toBe("Deutsche Stimme");
  });

  it("returns null for an empty voice list", () => {
    expect(pickVoice("wife", [])).toBeNull();
  });

  it("returns null when nothing matches at all", () => {
    expect(pickVoice("wife", [voice("Voix Francaise", { lang: "fr-FR", localService: false, default: false })])).toBeNull();
  });

  it("gives the three family personas distinct voices when the list has enough local English options", () => {
    const voices = [voice("Local One"), voice("Local Two"), voice("Local Three"), voice("Local Four")];
    const wife = pickVoice("wife", voices);
    const daughter = pickVoice("daughter", voices);
    const son = pickVoice("son", voices);
    const names = [wife?.name, daughter?.name, son?.name];
    expect(new Set(names).size).toBe(3);
  });

  it("prefers a name from another persona's own preferred list over an unclaimed local voice", () => {
    // wife's own preferred name should still win over the "unclaimed" fallback logic.
    const voices = [voice("Samantha"), voice("Karen"), voice("Fred")];
    expect(pickVoice("wife", voices)?.name).toBe("Samantha");
    expect(pickVoice("daughter", voices)?.name).toBe("Karen");
    expect(pickVoice("son", voices)?.name).toBe("Fred");
  });

  it("uses the DEFAULT persona (no preferred names) for an unknown sprite id", () => {
    const voices = [voice("Local English")];
    expect(pickVoice("stranger", voices)?.name).toBe("Local English");
  });
});

describe("VOICE_PERSONAS", () => {
  it("defines the three family personas with distinct pitch/rate", () => {
    expect(VOICE_PERSONAS.wife).toMatchObject({ pitch: 1.0, rate: 0.95 });
    expect(VOICE_PERSONAS.daughter).toMatchObject({ pitch: 1.4, rate: 1.05 });
    expect(VOICE_PERSONAS.son).toMatchObject({ pitch: 1.6, rate: 1.15 });
  });
});

describe("splitSentences", () => {
  it("returns an empty array for empty or blank text", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   ")).toEqual([]);
  });

  it("splits plain text on sentence punctuation", () => {
    expect(splitSentences("Hello there. How are you? Great!")).toEqual(["Hello there.", "How are you?", "Great!"]);
  });

  it("merges a tiny fragment into a neighboring sentence", () => {
    const sentences = splitSentences("Mr. Smith bought a tree.");
    expect(sentences.length).toBe(1);
    expect(sentences[0]).toContain("Mr.");
    expect(sentences[0]).toContain("Smith bought a tree.");
  });

  it("hard-wraps a sentence longer than ~180 chars", () => {
    const longSentence = `This is a very long sentence about the family Christmas mission that goes on and on, ${"describing ornaments and lights and garlands and stockings and wreaths and ribbons ".repeat(2)}and it never seems to stop at all.`;
    const parts = splitSentences(longSentence);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(181);
    }
    // No words should be lost or duplicated by the wrap.
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(longSentence.replace(/\s+/g, " "));
  });

  it("keeps short text as a single sentence when there's no terminal punctuation", () => {
    expect(splitSentences("find christmas decorations under two hundred dollars")).toEqual([
      "find christmas decorations under two hundred dollars",
    ]);
  });
});
