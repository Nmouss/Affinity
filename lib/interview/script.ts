import type { InterviewQuestion } from "./types";

// The interview is one open prompt: the person just talks about themselves for a bit, and the
// extractor listens for what they enjoy, what they avoid, and how they come across. Open on purpose:
// asking what they *want* gets a shopping list; asking who they are gets something true.

export const QUESTIONS: readonly InterviewQuestion[] = [
  {
    id: "about",
    spoken: "Tell me a bit about yourself. What do you love doing, what are you into lately, and what would you never spend money on?",
    hint: "Just talk. Hobbies, weekends, favourite places, pet peeves. Anything counts.",
    feeds: "loves",
  },
];

export function introFor(name: string): string {
  return `Nice to meet you, ${name}. Tell me a bit about yourself, out loud or typed, and I'll get a feel for you.`;
}

export function closingFor(name: string): string {
  return `Thanks, ${name}. Give me a second.`;
}
