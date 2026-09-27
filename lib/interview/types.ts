// The spoken onboarding interview: four indirect questions after a character is saved, distilled into
// the person's loves, avoids, and personality. Pure contracts; the machine, extractor, and script
// live beside this file and the React hook/panel in components/maker/interview consume them.

export type QuestionId = "weekend" | "hours" | "place" | "never";

export interface InterviewQuestion {
  id: QuestionId;
  /** Read aloud and shown on the card. */
  spoken: string;
  /** Small text under the question. */
  hint: string;
  /** Which list this question's answer mostly feeds. */
  feeds: "loves" | "avoids";
}

export interface InterviewAnswer {
  questionId: QuestionId;
  question: string;
  answer: string;
}

export interface Preferences {
  loves: string[];
  avoids: string[];
  personality: string[];
}

export interface ExtractedPreferences extends Preferences {
  summary: string;
  /** Who produced it: the backend model, or the local lexicon fallback. */
  source: "llm" | "local";
}

export const EMPTY_PREFERENCES: Preferences = { loves: [], avoids: [], personality: [] };
