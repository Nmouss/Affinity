import type { ExtractedPreferences, InterviewAnswer, Preferences } from "./types";

// Deterministic fallback extractor: a themed lexicon turns everyday answers into short noun phrases,
// and a chunk heuristic catches hobbies the lexicon has never heard of. Product heuristic, not
// science; the backend model does the same job better when a key is configured.

export const CAPS = { loves: 6, avoids: 3, personality: 3 } as const;

interface LoveEntry {
  pattern: RegExp;
  love?: string;
  personality?: string[];
}

interface AvoidEntry {
  pattern: RegExp;
  avoid?: string;
  personality?: string[];
}

/** Activities, topics, and places. Each hit adds a love and, often, a personality note. */
const LOVES: readonly LoveEntry[] = [
  { pattern: /\b(hik(e|ed|ing|es)|trails?|camp(ed|ing)?|backpack(ing)?)\b/, love: "hiking", personality: ["outdoorsy"] },
  { pattern: /\b(gym|lift(ed|ing|s)?|workouts?|work(ed|ing)? out|crossfit|weights)\b/, love: "gym", personality: ["athletic"] },
  { pattern: /\b(run(ning|s)?|ran|jog(ging|ged)?|marathon|5k)\b/, love: "running", personality: ["athletic"] },
  { pattern: /\b(yoga|pilates|stretch(ing)?|meditat(e|ion|ing))\b/, love: "yoga", personality: ["calm"] },
  { pattern: /\b(bik(e|ed|ing)|cycl(e|ed|ing)|bicycle)\b/, love: "cycling", personality: ["outdoorsy", "athletic"] },
  { pattern: /\b(swim(ming|s)?|swam|pool|laps)\b/, love: "swimming", personality: ["athletic"] },
  { pattern: /\b(climb(ed|ing|s)?|boulder(ing)?)\b/, love: "climbing", personality: ["adventurous", "athletic"] },
  { pattern: /\b(basketball|hoops)\b/, love: "basketball", personality: ["athletic"] },
  { pattern: /\b(soccer|football)\b/, love: "soccer", personality: ["athletic"] },
  { pattern: /\b(tennis|pickleball|badminton)\b/, love: "tennis", personality: ["athletic"] },
  { pattern: /\b(golf(ed|ing)?)\b/, love: "golf", personality: ["easygoing"] },
  { pattern: /\b(ski(ed|ing|s)?|snowboard(ed|ing)?)\b/, love: "skiing", personality: ["adventurous"] },
  { pattern: /\b(surf(ed|ing|s)?|paddle ?board(ing)?|kayak(ed|ing)?)\b/, love: "water sports", personality: ["adventurous"] },
  { pattern: /\b(fish(ed|ing)?)\b/, love: "fishing", personality: ["patient", "outdoorsy"] },
  { pattern: /\b(beach|ocean|lake|seaside|coast)\b/, love: "the water", personality: ["outdoorsy"] },
  { pattern: /\b(mountains?|forest|woods|nature|outdoors|park)\b/, love: "nature", personality: ["outdoorsy"] },
  { pattern: /\b(garden(ed|ing)?|plants?|greenhouse|flowers?)\b/, love: "gardening", personality: ["patient"] },
  { pattern: /\b(cook(ed|ing|s)?|bak(e|ed|ing|es)|recipes?|kitchen|meal prep)\b/, love: "cooking", personality: ["homebody"] },
  { pattern: /\b(restaurants?|brunch|dinner out|eating out|foodie|tacos|ramen|sushi|pizza)\b/, love: "good food", personality: ["social"] },
  { pattern: /\b(coffee|cafe|espresso|latte|barista)\b/, love: "coffee", personality: ["easygoing"] },
  { pattern: /\b(tea|matcha)\b/, love: "tea", personality: ["calm"] },
  { pattern: /\b(wine|brewery|beer|cocktails?)\b/, love: "drinks with friends", personality: ["social"] },
  { pattern: /\b(read(ing|s)?|books?|novels?|library|bookstore|kindle)\b/, love: "books", personality: ["curious"] },
  { pattern: /\b(podcasts?)\b/, love: "podcasts", personality: ["curious"] },
  { pattern: /\b(movies?|films?|cinema|theater|theatre)\b/, love: "movies", personality: ["homebody"] },
  { pattern: /\b(netflix|binge(d|ing)?|tv|shows?|series|streaming|anime)\b/, love: "tv shows", personality: ["homebody"] },
  { pattern: /\b(couch|stayed in|stayed home|lazy|nap(ped|ping)?|pajamas)\b/, love: "quiet weekends", personality: ["homebody"] },
  { pattern: /\b(video ?games?|gaming|gamer|xbox|playstation|nintendo|switch|steam|minecraft|zelda)\b/, love: "video games", personality: ["playful"] },
  { pattern: /\b(board ?games?|puzzles?|chess|cards|dungeons|d&d)\b/, love: "board games", personality: ["playful", "social"] },
  { pattern: /\b(music|concerts?|gigs?|playlists?|vinyl|records|spotify|band)\b/, love: "music", personality: ["expressive"] },
  { pattern: /\b(guitar|piano|drums|sing(ing)?|choir|violin|ukulele)\b/, love: "playing music", personality: ["creative"] },
  { pattern: /\b(danc(e|ed|ing)|salsa|ballet)\b/, love: "dancing", personality: ["expressive"] },
  { pattern: /\b(art|draw(ing)?|paint(ed|ing)?|sketch(ing)?|watercolor|illustrat)/, love: "drawing", personality: ["creative"] },
  { pattern: /\b(photograph(y|s)?|camera|photos?)\b/, love: "photography", personality: ["creative"] },
  { pattern: /\b(crafts?|knit(ting)?|crochet|sew(ing)?|pottery|ceramics|woodwork(ing)?)\b/, love: "crafts", personality: ["creative", "patient"] },
  { pattern: /\b(writ(e|ing)|journal(ing)?|poetry|poems?|blog)\b/, love: "writing", personality: ["creative", "reflective"] },
  { pattern: /\b(tech|coding|programming|computers?|gadgets?|software|apps?|ai)\b/, love: "technology", personality: ["curious"] },
  { pattern: /\b(science|space|astronomy|physics|biology)\b/, love: "science", personality: ["curious"] },
  { pattern: /\b(history|museums?|documentar(y|ies))\b/, love: "history", personality: ["curious"] },
  { pattern: /\b(politics|philosophy|economics|news)\b/, love: "big ideas", personality: ["curious"] },
  { pattern: /\b(travel(ed|ing|led|ling)?|trips?|abroad|flights?|road ?trip|explor(e|ing))\b/, love: "travel", personality: ["adventurous"] },
  { pattern: /\b(friends?|hang(ing)? out|party|parties|game night|hosting)\b/, love: "time with friends", personality: ["social"] },
  { pattern: /\b(family|kids?|grandma|grandpa|parents|siblings?|cousins?)\b/, love: "family time", personality: ["warm"] },
  { pattern: /\b(dogs?|puppy|cats?|kitten|pets?)\b/, love: "pets", personality: ["warm"] },
  { pattern: /\b(cars?|motorcycle|racing|f1|formula)\b/, love: "cars", personality: ["adventurous"] },
  { pattern: /\b(sneakers|fashion|thrift(ing|ed)?|vintage|outfits?|clothes)\b/, love: "fashion", personality: ["expressive"] },
  { pattern: /\b(shopping|mall|markets?|farmers market)\b/, love: "browsing markets", personality: ["social"] },
  { pattern: /\b(volunteer(ing|ed)?|church|community)\b/, love: "community", personality: ["warm"] },
  { pattern: /\b(sports?|game|match|watching the)\b/, love: "watching sports", personality: ["social"] },
  { pattern: /\b(home|apartment|my room|bedroom|living room)\b/, love: "home", personality: ["homebody"] },
  { pattern: /\b(cabin|countryside|farm)\b/, love: "the countryside", personality: ["calm", "outdoorsy"] },
  { pattern: /\b(city|downtown|rooftop|nightlife)\b/, love: "the city", personality: ["social"] },
  { pattern: /\b(cleaning|organiz(e|ing)|tidying|decluttering)\b/, love: "a tidy home", personality: ["practical"] },
  { pattern: /\b(diy|fixing|repairs?|tools|building things)\b/, love: "diy projects", personality: ["practical"] },
  { pattern: /\b(cars|bikes|engines)\b/, love: "tinkering", personality: ["practical"] },
  { pattern: /\b(languages?|duolingo|spanish|french|japanese)\b/, love: "languages", personality: ["curious"] },
  { pattern: /\b(baseball|hockey|volleyball|rugby|cricket)\b/, love: "team sports", personality: ["athletic", "social"] },
  { pattern: /\b(skat(e|ing|eboard)|rollerblad)/, love: "skating", personality: ["playful"] },
  { pattern: /\b(comedy|stand-?up|memes|jokes)\b/, love: "comedy", personality: ["playful"] },
  { pattern: /\b(spa|bath|candles|self-?care)\b/, love: "cozy evenings", personality: ["calm"] },
];

/** Things people would not pay for. Each hit adds an avoid and a money-attitude note. */
const AVOIDS: readonly AvoidEntry[] = [
  { pattern: /\b(designer|brand ?names?|luxury|overpriced|fancy|high-?end|bougie)\b/, avoid: "luxury brands", personality: ["practical"] },
  { pattern: /\b(handbags?|purses?)\b/, avoid: "designer handbags", personality: ["practical"] },
  { pattern: /\b(bottled water)\b/, avoid: "bottled water", personality: ["thrifty"] },
  { pattern: /\b(coffee out|starbucks|expensive coffee|lattes?)\b/, avoid: "overpriced coffee", personality: ["thrifty"] },
  { pattern: /\b(gambl(e|ing)|lottery|casino|betting)\b/, avoid: "gambling", personality: ["practical"] },
  { pattern: /\b(cable|subscriptions?|streaming services?)\b/, avoid: "subscriptions", personality: ["thrifty"] },
  { pattern: /\b(new cars?|car payments?)\b/, avoid: "new cars", personality: ["practical"] },
  { pattern: /\b(crypto|nfts?|bitcoin|meme stocks?)\b/, avoid: "crypto", personality: ["practical"] },
  { pattern: /\b(fast fashion|trendy clothes|shein)\b/, avoid: "fast fashion", personality: ["practical"] },
  { pattern: /\b(gadgets?|latest phone|new phone|upgrades?)\b/, avoid: "the latest gadgets", personality: ["practical"] },
  { pattern: /\b(extended warrant(y|ies)|insurance add-?ons?)\b/, avoid: "extended warranties", personality: ["practical"] },
  { pattern: /\b(first class|business class|valet)\b/, avoid: "upgrades", personality: ["thrifty"] },
  { pattern: /\b(jewelry|watches|diamonds?)\b/, avoid: "jewelry", personality: ["practical"] },
  { pattern: /\b(candles|decor|knick-?knacks|clutter|souvenirs?)\b/, avoid: "clutter", personality: ["minimalist"] },
  { pattern: /\b(concert tickets|resale|ticket fees)\b/, avoid: "marked-up tickets", personality: ["thrifty"] },
  { pattern: /\b(delivery fees?|door ?dash|uber eats|takeout)\b/, avoid: "delivery fees", personality: ["thrifty"] },
  { pattern: /\b(cheap|deals?|secondhand|thrift|used|bargain|sale)\b/, personality: ["thrifty"] },
  { pattern: /\b(nothing|anything if|whatever|i'd buy)\b/, personality: ["easygoing"] },
];

const FILLER = new Set([
  "i", "we", "my", "me", "our", "went", "go", "going", "to", "the", "a", "an", "just", "like", "love", "loved", "really",
  "probably", "maybe", "um", "uh", "mostly", "kind", "of", "some", "sort", "pretty", "much", "very", "so", "then", "with",
  "for", "on", "in", "at", "and", "or", "it", "its", "that", "this", "was", "were", "is", "am", "been", "being", "did", "do",
  "doing", "had", "have", "has", "also", "too", "well", "yeah", "yes", "no", "not", "never", "ever", "would", "spend",
  "money", "buy", "pay", "thing", "things", "something", "anything", "stuff", "honestly", "basically", "actually",
]);

const EMOJI = /\p{Extended_Pictographic}|️|‍/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim();
}

function normalizeText(text: string): string {
  return stripEmoji(text).toLowerCase().replace(/[^\p{L}\p{N}'&\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function cleanPhrase(item: string): string {
  return stripEmoji(item)
    .toLowerCase()
    .replace(/["“”‘’`]/g, "")
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(items: readonly string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = cleanPhrase(raw);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/** Lowercase, strip quotes/trailing punctuation/emoji, dedupe case-insensitively, cap each list. */
export function normalizePreferences(prefs: Preferences, caps: { loves: number; avoids: number; personality: number } = CAPS): Preferences {
  return {
    loves: dedupe(prefs.loves, caps.loves),
    avoids: dedupe(prefs.avoids, caps.avoids),
    personality: dedupe(prefs.personality, caps.personality),
  };
}

/** Free-text answers the lexicon didn't recognise: short noun-ish chunks, up to two per answer. */
export function chunkFallback(answer: string, max = 2): string[] {
  const chunks = normalizeText(answer)
    .split(/\s*(?:,|\.|;|\band\b|\bor\b|\bthen\b|\bbut\b)\s*/)
    .map((chunk) =>
      chunk
        .split(" ")
        .filter((word) => word && !FILLER.has(word))
        .join(" ")
        .trim(),
    )
    .filter((chunk) => {
      const words = chunk.split(" ").length;
      return chunk.length > 1 && chunk.length <= 32 && words >= 1 && words <= 3 && !/\d/.test(chunk);
    });
  return dedupe(chunks, max);
}

/** Runs the lexicon for one answer; `feeds` decides whether unmatched chunks become loves or avoids. */
function extractAnswer(answer: InterviewAnswer, out: { loves: string[]; avoids: string[]; personality: string[] }): void {
  const text = normalizeText(answer.answer);
  if (!text) return;
  const avoidQuestion = answer.questionId === "never";
  let matched = false;
  if (avoidQuestion) {
    for (const entry of AVOIDS) {
      if (!entry.pattern.test(text)) continue;
      if (entry.avoid) {
        out.avoids.push(entry.avoid);
        matched = true;
      }
      if (entry.personality) out.personality.push(...entry.personality);
    }
  } else {
    for (const entry of LOVES) {
      if (!entry.pattern.test(text)) continue;
      if (entry.love) {
        out.loves.push(entry.love);
        matched = true;
      }
      if (entry.personality) out.personality.push(...entry.personality);
    }
  }
  if (!matched) {
    const chunks = chunkFallback(answer.answer);
    if (avoidQuestion) out.avoids.push(...chunks);
    else out.loves.push(...chunks);
  }
}

function joinNames(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const EMPTY_SUMMARY = "Not much to go on yet. Add a few chips below.";

/** One plain sentence about the person, built from whatever the lists hold. */
export function summarize(name: string, prefs: Preferences): string {
  const loves = prefs.loves.slice(0, 3);
  const avoid = prefs.avoids[0];
  if (loves.length === 0 && !avoid) {
    return prefs.personality.length > 0 ? `${name} comes across as ${joinNames(prefs.personality.slice(0, 2))}.` : EMPTY_SUMMARY;
  }
  if (loves.length === 0) return `${name} steers clear of ${avoid}.`;
  const into = `${name} is into ${joinNames(loves)}`;
  return avoid ? `${into}, and steers clear of ${avoid}.` : `${into}.`;
}

/** The deterministic extractor: lexicon first, chunk fallback second, then normalize and summarize. */
export function extractLocally(name: string, answers: readonly InterviewAnswer[]): ExtractedPreferences {
  const out = { loves: [] as string[], avoids: [] as string[], personality: [] as string[] };
  for (const answer of answers) extractAnswer(answer, out);
  const prefs = normalizePreferences(out);
  return { ...prefs, summary: stripEmoji(summarize(name, prefs)), source: "local" };
}

/** Existing chips first, then anything new, deduped and capped, for the review screen. */
export function mergeForReview(existing: Preferences, fresh: Preferences): Preferences {
  return normalizePreferences({
    loves: [...existing.loves, ...fresh.loves],
    avoids: [...existing.avoids, ...fresh.avoids],
    personality: [...existing.personality, ...fresh.personality],
  });
}
