import { STAGE_TIMELINE, type TimedCouncilEvent } from "@/lib/demo/stageTranscript";
import type { CouncilEvent, FamilyProfile, Mission } from "@/types/domain";
import type { CouncilSource } from "@/lib/stage/slices/council";
import { readSseStream } from "./sse";

type FetchLike = typeof fetch;

/** POSTs the mission and invited profiles to /api/council and yields CouncilEvents as they arrive. */
export async function* startCouncil(
  mission: Mission,
  profiles: FamilyProfile[],
  threadId: string,
  signal: AbortSignal,
  fetchImpl: FetchLike = fetch,
): AsyncGenerator<CouncilEvent> {
  const response = await fetchImpl("/api/council", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ mission, profiles, threadId }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`Council request failed (${response.status})`);
  yield* readSseStream(response.body);
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

export interface CouncilRunOptions {
  signal: AbortSignal;
  threadId: string;
  /** Skip the network and play the stage transcript (the `?demo` URL flag). */
  preferReplay?: boolean;
  /** Give up on the live stream if its first event takes longer than this. */
  stallMs?: number;
  replaySpeed?: number;
  fetchImpl?: FetchLike;
  timeline?: readonly TimedCouncilEvent[];
  onSource?: (source: CouncilSource) => void;
}

// Live model/tool calls can legitimately take several seconds. The backend emits a `mission`
// acknowledgement immediately; this ceiling catches a dead/cold backend without ever replacing a
// user's mission with the unrelated recorded demo.
const LIVE_STALL_MS = 15000;

type Next = IteratorResult<CouncilEvent> | { stalled: true };

/**
 * The council as one event stream. Replay is opt-in (`?demo`) because its recorded people and
 * constraints must never be presented as the result of a live, user-authored mission.
 */
export async function* runCouncil(
  mission: Mission,
  profiles: FamilyProfile[],
  options: CouncilRunOptions,
): AsyncGenerator<CouncilEvent> {
  const { signal, stallMs = LIVE_STALL_MS } = options;
  const replay = () => {
    options.onSource?.("replay");
    return replayCouncil(signal, options.timeline, options.replaySpeed);
  };

  if (options.preferReplay) {
    yield* replay();
    return;
  }

  const live = new AbortController();
  const forwardAbort = () => live.abort();
  signal.addEventListener("abort", forwardAbort, { once: true });
  try {
    options.onSource?.("live");
    const stream = startCouncil(mission, profiles, options.threadId, live.signal, options.fetchImpl);
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
        throw new Error(`Live council was silent for ${Math.round(stallMs / 1000)} seconds`);
      }
      if (next.done) {
        if (first) throw new Error("Live council sent no events");
        break;
      }
      first = false;
      yield next.value;
    }
  } finally {
    signal.removeEventListener("abort", forwardAbort);
    live.abort();
  }
}
