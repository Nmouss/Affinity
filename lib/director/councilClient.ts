import { STAGE_TIMELINE, type TimedCouncilEvent } from "@/lib/demo/stageTranscript";
import type { CouncilEvent, ResumeRunRequest, StartRunRequest } from "@/types/domain";
import type { CouncilSource } from "@/lib/stage/slices/council";
import { readSseStream, type SseParserOptions } from "./sse";

type FetchLike = typeof fetch;

export const START_PATH = "/api/council";
export const RESUME_PATH = "/api/council/resume";

async function* postSse(
  path: string,
  body: unknown,
  signal: AbortSignal,
  fetchImpl: FetchLike,
  parser?: SseParserOptions,
): AsyncGenerator<CouncilEvent> {
  const response = await fetchImpl(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`Council request failed (${response.status})`);
  yield* readSseStream(response.body, parser);
}

/** POSTs the {threadId, mission, profiles} envelope to /api/council and yields the backend's events. */
export function startCouncil(
  envelope: StartRunRequest,
  signal: AbortSignal,
  fetchImpl: FetchLike = fetch,
  parser?: SseParserOptions,
): AsyncGenerator<CouncilEvent> {
  return postSse(START_PATH, envelope, signal, fetchImpl, parser);
}

/** Resumes the interrupted thread through /api/council/resume; approve, replace_agent, or reject. */
export function resumeCouncil(
  request: ResumeRunRequest,
  signal: AbortSignal,
  fetchImpl: FetchLike = fetch,
  parser?: SseParserOptions,
): AsyncGenerator<CouncilEvent> {
  return postSse(RESUME_PATH, request, signal, fetchImpl, parser);
}

function abortError(): Error {
  return new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Plays a timed transcript with its recorded latencies (scaled by `speed`). */
export async function* replayCouncil(
  signal: AbortSignal,
  timeline: readonly TimedCouncilEvent[] = STAGE_TIMELINE,
  speed = 1,
): AsyncGenerator<CouncilEvent> {
  for (const { afterMs, event } of timeline) {
    await sleep(afterMs / speed, signal);
    yield structuredClone(event);
  }
}

/** Identity of an event for deduping when replay takes over mid-stream. */
export function eventKey(event: CouncilEvent): string {
  switch (event.type) {
    case "opinion":
    case "score":
    case "deliberation":
    case "revision":
      return `${event.type}:${event.payload.spriteId}`;
    default:
      return event.type;
  }
}

export interface CouncilRunOptions {
  signal: AbortSignal;
  /** Skip the network and play the stage transcript (the `?demo` URL flag). */
  preferReplay?: boolean;
  /** Give up on the live stream if its first event takes longer than this. */
  stallMs?: number;
  replaySpeed?: number;
  fetchImpl?: FetchLike;
  timeline?: readonly TimedCouncilEvent[];
  parser?: SseParserOptions;
  onSource?: (source: CouncilSource) => void;
  onFallback?: (reason: string) => void;
}

const LIVE_STALL_MS = 4000;

type Next = IteratorResult<CouncilEvent> | { stalled: true };

/**
 * The council as one event stream: live when it works, replay when it's asked for, fails, or stays
 * silent too long. A mid-stream failure hands over to replay without repeating what already played.
 * A backend `error` frame is not a transport failure: it is yielded as-is for the stage to show.
 */
export async function* runCouncil(envelope: StartRunRequest, options: CouncilRunOptions): AsyncGenerator<CouncilEvent> {
  const { signal, stallMs = LIVE_STALL_MS } = options;
  const replay = (skip: Set<string>) => {
    options.onSource?.("replay");
    return filterSeen(replayCouncil(signal, options.timeline, options.replaySpeed), skip);
  };

  if (options.preferReplay) {
    yield* replay(new Set());
    return;
  }

  const live = new AbortController();
  const forwardAbort = () => live.abort();
  signal.addEventListener("abort", forwardAbort, { once: true });
  const seen = new Set<string>();
  let fallbackReason: string | null = null;

  try {
    options.onSource?.("live");
    const stream = startCouncil(envelope, live.signal, options.fetchImpl, options.parser);
    let first = true;
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stall = new Promise<Next>((resolve) => {
        if (first) timer = setTimeout(() => resolve({ stalled: true }), stallMs);
      });
      const pending = stream.next();
      // If the stall wins, aborting the live request rejects this read later; nobody awaits it then.
      pending.catch(() => undefined);
      const next = await Promise.race([pending, stall]).finally(() => clearTimeout(timer));
      if ("stalled" in next) {
        fallbackReason = `Live council was silent for ${Math.round(stallMs / 1000)} s`;
        break;
      }
      if (next.done) {
        if (first) fallbackReason = "Live council sent no events";
        break;
      }
      first = false;
      seen.add(eventKey(next.value));
      yield next.value;
    }
  } catch (error) {
    if (signal.aborted) throw error;
    fallbackReason = error instanceof Error ? error.message : "Live council failed";
  } finally {
    signal.removeEventListener("abort", forwardAbort);
    live.abort();
  }

  if (fallbackReason && !signal.aborted) {
    options.onFallback?.(fallbackReason);
    yield* replay(seen);
  }
}

async function* filterSeen(events: AsyncGenerator<CouncilEvent>, seen: Set<string>): AsyncGenerator<CouncilEvent> {
  for await (const event of events) if (!seen.has(eventKey(event))) yield event;
}
