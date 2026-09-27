import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as councilRoute } from "@/app/api/council/route";
import { POST as mandateRoute } from "@/app/api/mandate/route";
import { STAGE_TIMELINE, STAGE_TRANSCRIPT } from "@/lib/demo/stageTranscript";
import { CUT90_BEATS, CUT90_READ_PAUSE_MS, DEFAULT_BEATS, READ_PAUSE_MS, beatHoldMs } from "@/lib/director/beats";
import { createDirector, type Director, type DirectorOptions } from "@/lib/director/director";
import { emitGesture } from "@/lib/stage/bus";
import { useStage } from "@/lib/stage/store";
import type { CouncilEvent } from "@/types/domain";

const state = () => useStage.getState();

function hold(event: CouncilEvent, beats = DEFAULT_BEATS, pause = READ_PAUSE_MS): number {
  return beatHoldMs({ kind: "event", event }, beats, pause);
}

function sse(events: CouncilEvent[]): Response {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`).join("");
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

/** Routes the director's fetches to the real Next route handlers (or overrides for /api/council). */
function fakeFetch(
  council?: (init?: RequestInit) => Promise<Response>,
  resume?: (init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const request = new Request(new URL(url, "http://localhost"), init);
    if (url.endsWith("/api/council/resume")) {
      if (resume) return resume(init);
      const requestBody = JSON.parse(String(init?.body)) as { threadId: string };
      return sse([
        { type: "preflight", payload: { status: "ready", changes: [], total: 103 } },
        { type: "receipt", payload: { status: "approved", threadId: requestBody.threadId, total: 103 } },
        {
          type: "carts",
          payload: [{ merchantDomain: "merchant.example", cartId: "cart-1", checkoutUrl: "https://merchant.example/cart/1" }],
        },
      ]);
    }
    if (url.endsWith("/api/council")) return council ? council(init) : councilRoute(request);
    if (url.endsWith("/api/mandate")) return mandateRoute(request);
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

let director: Director | null = null;
const log = vi.fn();

function start(options: Partial<DirectorOptions> = {}): Director {
  director = createDirector({
    store: useStage,
    fetchImpl: fakeFetch(async () => sse(STAGE_TRANSCRIPT)),
    log,
    ...options,
  });
  return director;
}

function seatAllAndConvene() {
  state().setMissionText("Family Christmas tree, under $200");
  for (const spriteId of ["son", "wife", "daughter"]) emitGesture({ type: "seat", spriteId });
  expect(emitGesture({ type: "convene" })).toBe(true);
}

const appliedTypes = () => state().eventLog.map((entry) => entry.event.type);

beforeEach(() => {
  vi.useFakeTimers();
  state().resetCouncil();
  state().resetHand();
});

afterEach(() => {
  director?.dispose();
  director = null;
  vi.useRealTimers();
  log.mockReset();
});

describe("beat queue", () => {
  it("plays an instant dump as paced beats", async () => {
    start();
    seatAllAndConvene();
    expect(state().phase).toBe("convening");
    expect(state().mission?.invitedSpriteIds).toEqual(["son", "wife", "daughter"]);
    expect(state().sprites.son!.mood).toBe("thinking");

    await vi.advanceTimersByTimeAsync(0);
    expect(appliedTypes()).toEqual(["opinion"]);
    expect(state().councilSource).toBe("live");

    const firstHold = hold(STAGE_TRANSCRIPT[0]!);
    await vi.advanceTimersByTimeAsync(firstHold - 1);
    expect(appliedTypes()).toEqual(["opinion"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(appliedTypes()).toEqual(["opinion", "opinion"]);
    expect(state().sprites.wife!.mood).toBe("listening");

    await vi.advanceTimersByTimeAsync(hold(STAGE_TRANSCRIPT[1]!) + hold(STAGE_TRANSCRIPT[2]!));
    expect(state().phase).toBe("merge");
    await vi.advanceTimersByTimeAsync(hold(STAGE_TRANSCRIPT[3]!));
    expect(state().phase).toBe("conflict");
    await vi.advanceTimersByTimeAsync(hold(STAGE_TRANSCRIPT[4]!) - 1);
    expect(state().phase).toBe("conflict");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().phase).toBe("bundle");
    await vi.advanceTimersByTimeAsync(hold(STAGE_TRANSCRIPT[5]!) + hold(STAGE_TRANSCRIPT[6]!) + hold(STAGE_TRANSCRIPT[7]!));
    expect(state().phase).toBe("scoring");
    await vi.advanceTimersByTimeAsync(hold(STAGE_TRANSCRIPT[8]!));
    expect(state().phase).toBe("awaitMandate");
    expect(appliedTypes()).toEqual(STAGE_TRANSCRIPT.map((event) => event.type));
  });

  it("uses the tighter ?cut=90 preset", async () => {
    start({ cut90: true });
    seatAllAndConvene();
    const total = STAGE_TRANSCRIPT.reduce(
      (sum, event) => sum + hold(event, CUT90_BEATS, CUT90_READ_PAUSE_MS),
      0,
    );
    await vi.advanceTimersByTimeAsync(total - 1);
    expect(state().phase).toBe("scoring");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().phase).toBe("awaitMandate");
  });

  it("clears the queue and aborts the stream on reset", async () => {
    start();
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(hold(STAGE_TRANSCRIPT[0]!));
    expect(emitGesture({ type: "reset" })).toBe(true);
    expect(state().phase).toBe("lobby");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("lobby");
    expect(state().eventLog).toEqual([]);
    expect(Object.values(state().sprites).every((sprite) => sprite.seat === null && sprite.mood === "idle")).toBe(true);
  });
});

describe("council transports", () => {
  it("replays the stage transcript with its latencies under ?demo", async () => {
    const council = vi.fn();
    start({ preferReplay: true, fetchImpl: fakeFetch(council) });
    seatAllAndConvene();
    expect(state().councilSource).toBe("replay");
    await vi.advanceTimersByTimeAsync(STAGE_TIMELINE[0]!.afterMs - 1);
    expect(state().phase).toBe("convening");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().phase).toBe("opinions");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("awaitMandate");
    expect(council).not.toHaveBeenCalled();
  });

  it("shows an honest error instead of replaying unrelated people when the live request fails", async () => {
    start({ fetchImpl: fakeFetch(() => Promise.reject(new Error("offline"))) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(0);
    expect(state().councilSource).toBe("live");
    expect(state().error).toContain("live council could not be reached");
    expect(appliedTypes()).toEqual([]);
    expect(log).toHaveBeenCalledWith("live council failed", expect.any(Error));
  });

  it("shows an honest error when the live stream stays silent for 15 s", async () => {
    start({ fetchImpl: fakeFetch((init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(state().councilSource).toBe("live");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().councilSource).toBe("live");
    expect(state().error).toContain("live council could not be reached");
    expect(appliedTypes()).toEqual([]);
  });

  it("keeps received live events but never splices in canned events after a mid-stream failure", async () => {
    const encoder = new TextEncoder();
    const [first, second] = STAGE_TRANSCRIPT;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of [first!, second!]) {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`));
        }
        controller.error(new Error("socket closed"));
      },
    });
    start({ fetchImpl: fakeFetch(async () => new Response(body)) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    // Depending on when the stream reader observes the socket error, it may
    // deliver zero, one, or both already-enqueued live events. It must never
    // append bundle/score events belonging to the recorded family.
    expect(appliedTypes().length).toBeLessThanOrEqual(2);
    expect(appliedTypes().every((type) => type === "opinion")).toBe(true);
    expect(state().councilSource).toBe("live");
    expect(state().error).toContain("live council could not be reached");
  });
});

describe("signing", () => {
  it("reaches awaitMandate from a live stream and signs through /api/mandate", async () => {
    start();
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(0);
    expect(emitGesture({ type: "handshakeComplete" })).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    // This test supplies the transcript as a live SSE response; explicit replay
    // behavior is covered separately above.
    expect(state().phase).toBe("awaitMandate");

    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
    expect(state().phase).toBe("signing");
    expect(emitGesture({ type: "pinchTap", target: "hearth" })).toBe(false);
    await vi.waitFor(() => expect(state().phase).toBe("receipt"));
    expect(state().receipt?.threadId).toMatch(/[0-9a-f-]{36}/);
    const signed = state().mandate;
    expect(signed && "bundle" in signed ? signed.bundle.total : null).toBe(103);
    expect(state().preflight?.status).toBe("ready");
    expect(state().carts[0]?.checkoutUrl).toBe("https://merchant.example/cart/1");
    expect(state().sprites.son!.mood).toBe("celebrating");
  });

  it("returns to awaitMandate with an error when the signature is rejected", async () => {
    start({
      sign: async (mission, bundle) => ({
        mission,
        bundle,
        approvedAt: new Date().toISOString(),
        publicKey: {},
        signature: "AAAA",
      }),
    });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
    await vi.waitFor(() => expect(state().phase).toBe("awaitMandate"));
    expect(state().error).toMatch(/rejected/);
    expect(state().receipt).toBeNull();
  });
});

describe("intents", () => {
  it("seats sprites in free seats, swaps on drop, and sends sprites home", () => {
    start();
    emitGesture({ type: "seat", spriteId: "wife" });
    emitGesture({ type: "seat", spriteId: "son" });
    expect(state().sprites.wife!.seat).toBe(0);
    expect(state().sprites.son!.seat).toBe(1);

    emitGesture({ type: "dragStart", spriteId: "daughter" });
    expect(state().sprites.daughter!.mood).toBe("held");
    emitGesture({ type: "dragEnd", spriteId: "daughter", seat: 0 });
    expect(state().sprites.daughter).toMatchObject({ seat: 0, mood: "seated" });
    expect(state().sprites.wife).toMatchObject({ seat: null, mood: "idle" });

    emitGesture({ type: "dragEnd", spriteId: "son", seat: null });
    expect(state().sprites.son!.seat).toBeNull();
  });

  it("opens profiles on a sprite pinch in the lobby and closes them on a pinch elsewhere", () => {
    start();
    emitGesture({ type: "pinchTap", target: "sprite:son" });
    expect(state().profileOpenId).toBe("son");
    emitGesture({ type: "pinchTap", target: "centerpiece" });
    expect(state().profileOpenId).toBeNull();
  });

  it("convenes from the hearth only once someone is seated", async () => {
    start();
    state().setMissionText("Family Christmas tree, under $200");
    emitGesture({ type: "pinchTap", target: "hearth" });
    expect(state().phase).toBe("lobby");
    expect(state().error).toMatch(/Seat at least one/);
    emitGesture({ type: "seat", spriteId: "son" });
    emitGesture({ type: "pinchTap", target: "hearth" });
    expect(state().phase).toBe("convening");
    expect(state().mission).toMatchObject({ budget: 200, type: "shared", invitedSpriteIds: ["son"] });
  });

  it("rejects lobby gestures once the council is running, and a sprite tap outside the lobby is a no-op", async () => {
    start();
    seatAllAndConvene();
    expect(emitGesture({ type: "seat", spriteId: "wife" })).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    emitGesture({ type: "pinchTap", target: "sprite:son" });
    expect(state().profileOpenId).toBeNull();
  });

  it("restores the previous arming policy on dispose", () => {
    start().dispose();
    director = null;
    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
  });
});

describe("swap", () => {
  const bundleV1: CouncilEvent = {
    type: "bundle",
    payload: { items: [{ id: "a", slot: "centerpiece", name: "A", price: 10, tags: [] }], total: 10, serves: {} },
  };
  const bundleV2: CouncilEvent = {
    type: "bundle",
    payload: { items: [{ id: "b", slot: "centerpiece", name: "B", price: 12, tags: [] }], total: 12, serves: {} },
  };
  const runState: CouncilEvent = {
    type: "run_state",
    payload: { threadId: "thread-1", status: "interrupted", interrupts: [], state: {} },
  };

  it("captures threadId from a run_state event", async () => {
    start({ fetchImpl: fakeFetch(async () => sse([bundleV1, runState])) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.bundle);
    expect(state().threadId).toBe("thread-1");
  });

  it("does nothing and surfaces an error when no threadId is set yet", async () => {
    const resume = vi.fn();
    const d = start({ fetchImpl: fakeFetch(async () => sse([bundleV1]), resume) });
    await d.swapItem("a");
    expect(resume).not.toHaveBeenCalled();
    expect(state().error).toMatch(/hasn't started/);
  });

  it("posts a replace_agent resume and patches the bundle from the response", async () => {
    const resume = vi.fn(async (init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ threadId: "thread-1", action: "replace_agent", itemId: "a" });
      return sse([bundleV2]);
    });
    const d = start({ fetchImpl: fakeFetch(async () => sse([bundleV1, runState]), resume) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.bundle);
    expect(state().bundle?.items[0]?.id).toBe("a");
    await d.swapItem("a");
    expect(resume).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.bundle);
    expect(state().bundle?.items[0]?.id).toBe("b");
  });

  it("passes a human replacement request to the same repair loop", async () => {
    const resume = vi.fn(async (init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        threadId: "thread-1",
        action: "replace_agent",
        itemId: "a",
        prompt: "Find a blue one under $20",
      });
      return sse([bundleV2]);
    });
    const d = start({ fetchImpl: fakeFetch(async () => sse([bundleV1, runState]), resume) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.bundle);
    await d.swapItem("a", "Find a blue one under $20");
    expect(resume).toHaveBeenCalledOnce();
  });

  it("permanently rejects the proposal without approving or creating a cart", async () => {
    const resume = vi.fn(async (init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ threadId: "thread-1", action: "reject", itemId: "a" });
      return sse([{ type: "receipt", payload: { status: "rejected", threadId: "thread-1", rejectedItemId: "a" } }]);
    });
    const d = start({ fetchImpl: fakeFetch(async () => sse([bundleV1, runState]), resume) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.bundle);
    await d.cancelProposal("a");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().receipt).toMatchObject({ status: "rejected", rejectedItemId: "a" });
    expect(state().phase).toBe("receipt");
    expect(state().carts).toEqual([]);
    expect(state().mandate).toBeNull();
  });
});
