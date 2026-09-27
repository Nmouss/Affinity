import type { InterviewQuestion, Preferences } from "./types";

// The interview is one open prompt. For a brand-new character the person just talks about
// themselves. For someone we already know, the helper recaps what it has learned and asks what's
// new or wrong, so the conversation builds on the character instead of starting over. Open on
// purpose: asking what they *want* gets a shopping list; asking who they are gets something true.

export interface InterviewScript {
  intro: string;
  question: InterviewQuestion;
  closing: string;
  /** True when the prompt builds on known preferences (the Plaza's Interview rail). */
  knows: boolean;
}

export const QUESTIONS: readonly InterviewQuestion[] = [
  {
    id: "about",
    spoken: "Tell me a bit about yourself. What do you love doing, what are you into lately, and what would you never spend money on?",
    hint: "Just talk. Hobbies, weekends, favourite places, pet peeves. Anything counts.",
    feeds: "loves",
  },
];

function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** One spoken sentence summing up what we know: loves, avoids, and how they come across. */
export function recapFor(name: string, existing: Preferences): string {
  const parts: string[] = [];
  if (existing.loves.length) parts.push(`they love ${list(existing.loves.slice(0, 4))}`);
  if (existing.avoids.length) parts.push(`they steer clear of ${list(existing.avoids.slice(0, 3))}`);
  if (existing.personality.length) parts.push(`they come across as ${list(existing.personality.slice(0, 3))}`);
  return parts.length ? `Here's what I know about ${name} so far: ${list(parts)}.` : "";
}

export function hasPreferences(existing: Preferences): boolean {
  return existing.loves.length + existing.avoids.length + existing.personality.length > 0;
}

/** The script for this person: a first meeting, or getting to know someone we already have notes on. */
export function scriptFor(name: string, existing: Preferences): InterviewScript {
  if (!hasPreferences(existing)) {
    return { intro: introFor(name), question: QUESTIONS[0]!, closing: closingFor(name), knows: false };
  }
  return {
    intro: `Let's get to know ${name} a bit better.`,
    question: {
      id: "about",
      spoken: `${recapFor(name, existing)} What else should I know? Anything new, or anything I've got wrong?`,
      hint: "Add to it, or set me straight. You can remove chips on the next screen.",
      feeds: "loves",
    },
    closing: closingFor(name),
    knows: true,
  };
}

export function introFor(name: string): string {
  return `Nice to meet you, ${name}. Tell me a bit about yourself, out loud or typed, and I'll get a feel for you.`;
}

export function closingFor(name: string): string {
  return `Thanks, ${name}. Give me a second.`;
}
