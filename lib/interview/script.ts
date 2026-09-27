import type { InterviewQuestion } from "./types";

// The interview script. Questions are indirect on purpose: they ask what the person does and where
// they go, never what they want, so the answers say something true about them.

export const QUESTIONS: readonly InterviewQuestion[] = [
  { id: "weekend", spoken: "What did you get up to last weekend?", hint: "Anything counts, even a quiet one.", feeds: "loves" },
  { id: "hours", spoken: "What's something you could talk about for hours?", hint: "A hobby, a subject, a show, anything.", feeds: "loves" },
  {
    id: "place",
    spoken: "Where's your happy place? Somewhere you go to feel like yourself.",
    hint: "A room, a trail, a gym, a cafe.",
    feeds: "loves",
  },
  { id: "never", spoken: "What's one thing you'd never spend money on?", hint: "Be honest, nobody is judging.", feeds: "avoids" },
];

export function introFor(name: string): string {
  return `Nice to meet you, ${name}. Four quick questions so I get a feel for you. Answer out loud, or type if you'd rather.`;
}

export function closingFor(name: string): string {
  return `Thanks, ${name}. Give me a second.`;
}
