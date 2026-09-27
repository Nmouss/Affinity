import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAGE_TIMELINE, STAGE_TRANSCRIPT } from "@/lib/demo/stageTranscript";
import { CUT90_BEATS, DEFAULT_BEATS } from "@/lib/director/beats";
import { createDirector, type Director, type DirectorOptions } from "@/lib/director/director";
import { emitGesture } from "@/lib/stage/bus";
import { useStage } from "@/lib/stage/store";
import type { Bundle, CartMandate, CouncilEvent, ResumeRunRequest, StartRunRequest } from "@/types/domain";

const state = () => useStage.getState();

function frames(events: CouncilEvent[]): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`).join("");
}

function sse(events: CouncilEvent[]): Response {
  return new Response(frames(events), { headers: { "Content-Type": "text/event-stream" } });
}

type Answer = CouncilEvent[] | Response | Error;

/** A fake Python backend behind the two Next routes: scripted answers per start/resume call, and the
 *  bodies it received so tests can check the envelope and the thread id. */
function fakeBackend(script: { start?: Answer[]; resume?: Answer[] } = {}) {
  const calls = { start: [] as StartRunRequest[], resume: [] as ResumeRunRequest[] };
  const starts = [...(script.start ?? [])];
  const resumes = [...(script.resume ?? [])];
  const answer = (queue: Answer[], init?: RequestInit) => {
    const next = queue.shift();
    if (next === undefined) throw new Error("fake backend: no scripted answer left");
    if (next instanceof Error) return Promise.reject(next);
    if (next instanceof Response) return Promise.resolve(next);
    // Honor an abort from the director like a real socket would.
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      resolve(sse(next));
    });
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "null"));
    if (url.endsWith("/api/council")) {
      calls.start.push(body as StartRunRequest);
      return answer(starts, init);
    }
    if (url.endsWith("/api/council/resume")) {
      calls.resume.push(body as ResumeRunRequest);
      return answer(resumes, init);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const GIFT_ITEM = {
  id: "shopify:gid://shopify/ProductVariant/1",
  slot: "gift",
  name: "Cozy knit scarf",
  price: 42,
  tags: ["casual", "warm"],
  productUrl: "https://shop.example/products/scarf",
  imageUrl: "https://cdn.shopify.com/s/files/scarf.jpg",
  merchantName: "Cozy Shop",
  merchantDomain: "shop.example",
  currency: "USD",
  quantity: 1,
  selectedBecause: ["Fits the gift slot at 42.00."],
};

const GIFT_BUNDLE: Bundle = { items: [GIFT_ITEM], total: 42, serves: { daughter: [GIFT_ITEM.id] }, source: "shopify_ucp" };

function mandate(bundle: Bundle): CouncilEvent {
  return { type: "awaiting_mandate", payload: { type: "cart_mandate", bundle, requiredGesture: "handshake", holdSeconds: 1.5 } };
}

function interrupted(threadId: string, bundle: Bundle): CouncilEvent {
  return {
    type: "run_state",
    payload: {
      threadId,
      status: "interrupted",
      interrupts: [{ id: "i1", value: { type: "cart_mandate", bundle, requiredGesture: "handshake", holdSeconds: 1.5 } }],
      state: { bundle },
    },
  };
}

const CHECKOUT_URL = "https://shop.example/cart/c/abc123";
const CARTS = [{ merchantDomain: "shop.example", cartId: "abc123", checkoutUrl: CHECKOUT_URL, total: 42, currency: "USD" }];

const LIVE_START: CouncilEvent[] = [
  { type: "mission", payload: { occasion: "Christmas", budget: 200, freeText: "Family Christmas tree, under $200", type: "shared", kind: "shopping", invitedSpriteIds: ["son", "wife", "daughter"] } },
  { type: "opinion", payload: { spriteId: "wife", say: "Something warm.", hardRules: [], wishes: ["warm"], vetoes: [] } },
  { type: "opinion", payload: { spriteId: "daughter", say: "Something soft!", hardRules: [], wishes: ["soft"], vetoes: [] } },
  { type: "constraints", payload: { hardRules: [], wishes: [{ spriteId: "wife", wish: "warm", weight: 1 }], conflicts: [] } },
  { type: "deliberation", payload: { spriteId: "wife", say: "Soft and warm works for me.", replyToSpriteIds: ["daughter"], agreements: ["soft"], concerns: [], compromiseWishes: [] } },
  { type: "search_plan", payload: { kind: "shopping", slots: [{ slotId: "gift", queries: ["warm soft scarf"], rationale: "both wishes" }] } },
  { type: "bundle", payload: GIFT_BUNDLE },
  { type: "score", payload: { spriteId: "wife", score: 8, say: "Lovely." } },
  { type: "score", payload: { spriteId: "daughter", score: 9, say: "So soft!" } },
  { type: "scores_complete", payload: [] },
  mandate(GIFT_BUNDLE),
  interrupted("thread-test", GIFT_BUNDLE),
];

const APPROVED: CouncilEvent[] = [
  // LangGraph re-enters the mandate node on resume and re-emits the proposal before preflight.
  mandate(GIFT_BUNDLE),
  { type: "preflight", payload: { status: "ready", changes: [], total: 42 } },
  { type: "receipt", payload: { status: "approved", threadId: "thread-test", total: 42, signature: "sig" } },
  { type: "carts", payload: CARTS },
  { type: "run_state", payload: { threadId: "thread-test", status: "complete", interrupts: [], state: { carts: CARTS, bundle: GIFT_BUNDLE } } },
];

const fakeSign = async (mission: Bundle extends never ? never : CartMandate["mission"], bundle: Bundle): Promise<CartMandate> => ({
  mission,
  bundle,
  approvedAt: new Date().toISOString(),
  publicKey: {},
  signature: "test-signature",
});

let director: Director | null = null;
const log = vi.fn();

function start(options: Partial<DirectorOptions> = {}): Director {
  director = createDirector({
    store: useStage,
    fetchImpl: fakeBackend({ start: [STAGE_TRANSCRIPT] }).fetchImpl,
    sign: fakeSign,
    threadId: () => "thread-test",
    log,
    ...options,
  });
  return director;
}

function seatAllAndConvene() {
  for (const spriteId of ["son", "wife", "daughter"]) emitGesture({ type: "seat", spriteId });
  expect(emitGesture({ type: "convene" })).toBe(true);
}

/** Runs a live start to the mandate and settles the bundle so the handshake arms. */
async function reachMandate() {
  seatAllAndConvene();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(state().phase).toBe("awaitMandate");
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

    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion - 1);
    expect(appliedTypes()).toEqual(["opinion"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(appliedTypes()).toEqual(["opinion", "opinion"]);
    expect(state().sprites.wife!.mood).toBe("listening");

    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion * 2);
    expect(state().phase).toBe("merge");
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.constraints);
    expect(state().phase).toBe("conflict");
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.veto - 1);
    expect(state().phase).toBe("conflict");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().phase).toBe("bundle");
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.bundle + DEFAULT_BEATS.score * 2);
    expect(state().phase).toBe("scoring");
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.score);
    expect(state().phase).toBe("awaitMandate");
    expect(appliedTypes()).toEqual(STAGE_TRANSCRIPT.map((event) => event.type));
  });

  it("uses the tighter ?cut=90 preset", async () => {
    start({ cut90: true });
    seatAllAndConvene();
    const total = CUT90_BEATS.opinion * 3 + CUT90_BEATS.constraints + CUT90_BEATS.veto + CUT90_BEATS.bundle + CUT90_BEATS.score * 3;
    await vi.advanceTimersByTimeAsync(total - 1);
    expect(state().phase).toBe("scoring");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().phase).toBe("awaitMandate");
    expect(total).toBeLessThan(15_000);
  });

  it("clears the queue and aborts the stream on reset", async () => {
    start();
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion);
    state().toggleReasoning();
    expect(emitGesture({ type: "reset" })).toBe(true);
    expect(state().phase).toBe("lobby");
    expect(state().reasoningVisible).toBe(false);
    expect(state().threadId).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("lobby");
    expect(state().eventLog).toEqual([]);
    expect(Object.values(state().sprites).every((sprite) => sprite.seat === null && sprite.mood === "idle")).toBe(true);
  });

  it("plays the veto beat once when the live constraints carry a conflict", async () => {
    const conflict = { rule: "Maximum height: 48 inches", wish: "8 ft inflatable T-rex", resolution: "Use dinosaur ornaments instead." };
    const withConflict: CouncilEvent[] = LIVE_START.map((event) =>
      event.type === "constraints" ? { type: "constraints", payload: { ...event.payload, conflicts: [conflict] } } : event,
    );
    start({ fetchImpl: fakeBackend({ start: [withConflict] }).fetchImpl });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(appliedTypes().filter((type) => type === "veto")).toHaveLength(1);
    expect(appliedTypes().indexOf("veto")).toBe(appliedTypes().indexOf("constraints") + 1);
    expect(state().veto).toEqual(conflict);
  });
});

describe("council transports", () => {
  it("replays the stage transcript with its latencies under ?demo, labeled and without a thread", async () => {
    const backend = fakeBackend();
    start({ preferReplay: true, fetchImpl: backend.fetchImpl });
    seatAllAndConvene();
    expect(state().councilSource).toBe("replay");
    expect(state().threadId).toBeNull();
    await vi.advanceTimersByTimeAsync(STAGE_TIMELINE[0]!.afterMs - 1);
    expect(state().phase).toBe("convening");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().phase).toBe("opinions");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("awaitMandate");
    expect(backend.calls.start).toHaveLength(0);
  });

  it("falls back to replay when the live request fails", async () => {
    start({ fetchImpl: fakeBackend({ start: [new Error("offline")] }).fetchImpl });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(0);
    expect(state().councilSource).toBe("replay");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("awaitMandate");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("offline"));
  });

  it("falls back to replay when the live stream stays silent for 4 s", async () => {
    const silent = ((input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    start({ fetchImpl: silent });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(3999);
    expect(state().councilSource).toBe("live");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().councilSource).toBe("replay");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("awaitMandate");
  });

  it("hands over to replay mid-stream without repeating events", async () => {
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
    start({ fetchImpl: fakeBackend({ start: [new Response(body)] }).fetchImpl });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(appliedTypes()).toEqual(STAGE_TRANSCRIPT.map((event) => event.type));
    expect(state().phase).toBe("awaitMandate");
  });

  it("shows a backend error frame instead of pretending a replay is live", async () => {
    const backend = fakeBackend({ start: [[{ type: "error", payload: { detail: "Every shopping slot requires a non-empty id and query", status: 422 } }]] });
    start({ fetchImpl: backend.fetchImpl });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state().councilSource).toBe("live");
    expect(state().error).toMatch(/shopping slot/);
    expect(state().runStatus).toBe("error");
    expect(state().retryable).toBe(false);
    expect(state().bundle).toBeNull();
  });
});

describe("live start and resume", () => {
  it("sends the thread envelope and reaches the mandate with the thread preserved", async () => {
    const backend = fakeBackend({ start: [LIVE_START] });
    start({ fetchImpl: backend.fetchImpl });
    await reachMandate();

    expect(backend.calls.start).toHaveLength(1);
    const envelope = backend.calls.start[0]!;
    expect(envelope.threadId).toBe("thread-test");
    expect(envelope.mission).toMatchObject({ type: "shared", kind: "shopping", invitedSpriteIds: ["son", "wife", "daughter"] });
    expect(envelope.profiles.map((profile) => profile.id)).toEqual(["son", "wife", "daughter"]);
    expect(envelope.profiles[0]).toMatchObject({ name: expect.any(String), houseRules: expect.any(Array) });

    expect(state().threadId).toBe("thread-test");
    expect(state().runStatus).toBe("interrupted");
    expect(state().interrupt?.type).toBe("cart_mandate");
    expect(state().bundle?.total).toBe(42);
    expect(state().deliberations.wife?.say).toContain("Soft and warm");
    expect(state().searchPlan?.slots[0]?.slotId).toBe("gift");
    expect(state().carts).toEqual([]);
  });

  it("approves by resuming the same thread and shows only the post-approval checkout URL", async () => {
    const backend = fakeBackend({ start: [LIVE_START], resume: [APPROVED] });
    start({ fetchImpl: backend.fetchImpl });
    await reachMandate();

    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
    expect(state().phase).toBe("signing");
    expect(emitGesture({ type: "pinchTap", target: "hearth" })).toBe(false);
    const phases: string[] = [];
    const unsubscribe = useStage.subscribe((next) => phases.push(next.phase));
    await vi.advanceTimersByTimeAsync(60_000);
    unsubscribe();
    // The mandate echo at the top of the resume never re-opens the handshake.
    expect(phases).not.toContain("awaitMandate");

    expect(backend.calls.resume).toEqual([{ threadId: "thread-test", action: "approve", signature: "test-signature" }]);
    expect(state().phase).toBe("checkout");
    expect(state().receipt?.status).toBe("approved");
    expect(state().mandate?.signature).toBe("test-signature");
    expect(state().carts).toHaveLength(1);
    expect(state().carts[0]!.checkoutUrl).toBe(CHECKOUT_URL);
    expect(state().carts[0]!.checkoutUrl).not.toBe(GIFT_ITEM.productUrl);
    expect(state().runStatus).toBe("complete");
    expect(state().sprites.wife!.mood).toBe("celebrating");
  });

  it("re-interrupts on a price change and requires a fresh handshake", async () => {
    const repriced: Bundle = { ...GIFT_BUNDLE, items: [{ ...GIFT_ITEM, price: 45 }], total: 45 };
    const changed: CouncilEvent[] = [
      { type: "preflight", payload: { status: "changed", changes: ["Cozy knit scarf is now 45.00 (was 42.00)."], total: 45 } },
      mandate(repriced),
      interrupted("thread-test", repriced),
    ];
    const backend = fakeBackend({ start: [LIVE_START], resume: [changed, APPROVED] });
    start({ fetchImpl: backend.fetchImpl });
    await reachMandate();

    emitGesture({ type: "handshakeComplete" });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.preflight);
    expect(state().phase).toBe("awaitMandate");
    expect(state().bundle?.total).toBe(45);
    expect(state().notice).toMatch(/Prices changed/);
    expect(state().carts).toEqual([]);
    expect(state().receipt).toBeNull();

    // The refreshed cart needs its own settle time before the handshake arms again.
    expect(emitGesture({ type: "handshakeComplete" })).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backend.calls.resume).toHaveLength(2);
    expect(backend.calls.resume[1]!.threadId).toBe("thread-test");
    expect(state().phase).toBe("checkout");
    expect(state().carts[0]!.checkoutUrl).toBe(CHECKOUT_URL);
  });

  it("asks for a replacement with replace_agent and shows the revised proposal", async () => {
    const replacement = { ...GIFT_ITEM, id: "shopify:gid://shopify/ProductVariant/2", name: "Chunky wool scarf", price: 39 };
    const revised: Bundle = { ...GIFT_BUNDLE, items: [replacement], total: 39, rejectedAlternatives: [{ id: GIFT_ITEM.id, slot: "gift", name: GIFT_ITEM.name, reason: "Replaced at your request." }] };
    const repaired: CouncilEvent[] = [
      { type: "repair_requested", payload: { action: "replace_agent", itemId: GIFT_ITEM.id } },
      { type: "repair", payload: { itemId: GIFT_ITEM.id, slotId: "gift", prompt: "something chunkier", autonomous: false } },
      { type: "search_plan", payload: { kind: "shopping", slots: [{ slotId: "gift", queries: ["chunky scarf"], rationale: "requested" }] } },
      { type: "bundle", payload: revised },
      { type: "score", payload: { spriteId: "wife", score: 8, say: "Even better." } },
      mandate(revised),
      interrupted("thread-test", revised),
    ];
    const backend = fakeBackend({ start: [LIVE_START], resume: [repaired] });
    start({ fetchImpl: backend.fetchImpl });
    await reachMandate();

    expect(emitGesture({ type: "swipe", itemId: GIFT_ITEM.id, prompt: "something chunkier" })).toBe(true);
    expect(state().notice).toMatch(/replacement/);
    await vi.advanceTimersByTimeAsync(0);
    expect(state().phase).toBe("revising");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(backend.calls.resume).toEqual([{ threadId: "thread-test", action: "replace_agent", itemId: GIFT_ITEM.id, prompt: "something chunkier" }]);
    expect(state().phase).toBe("awaitMandate");
    expect(state().bundle?.items[0]?.id).toBe(replacement.id);
    expect(state().bundle?.rejectedAlternatives?.[0]?.id).toBe(GIFT_ITEM.id);
    expect(state().scores.wife?.score).toBe(8);
    expect(state().carts).toEqual([]);
  });

  it("keeps the thread on a failed approval and retries the same resume", async () => {
    const failed: CouncilEvent[] = [{ type: "error", payload: { detail: "Council execution failed", status: 500 } }];
    const backend = fakeBackend({ start: [LIVE_START], resume: [failed, APPROVED] });
    start({ fetchImpl: backend.fetchImpl });
    await reachMandate();

    emitGesture({ type: "handshakeComplete" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(state().phase).toBe("awaitMandate");
    expect(state().error).toBe("Council execution failed");
    expect(state().retryable).toBe(true);
    expect(state().runStatus).toBe("error");
    expect(state().threadId).toBe("thread-test");
    expect(state().carts).toEqual([]);
    expect(state().receipt).toBeNull();

    expect(emitGesture({ type: "retry" })).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backend.calls.resume).toHaveLength(2);
    expect(backend.calls.resume[1]).toEqual(backend.calls.resume[0]);
    expect(state().phase).toBe("checkout");
    expect(state().error).toBeNull();
  });

  it("treats a dropped resume connection as a retryable failure, never as approval", async () => {
    const backend = fakeBackend({ start: [LIVE_START], resume: [new Error("socket hang up")] });
    start({ fetchImpl: backend.fetchImpl });
    await reachMandate();
    emitGesture({ type: "handshakeComplete" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(state().phase).toBe("awaitMandate");
    expect(state().error).toMatch(/socket hang up/);
    expect(state().retryable).toBe(true);
    expect(state().carts).toEqual([]);
    expect(state().receipt).toBeNull();
  });

  it("declines with reject and ends without a cart", async () => {
    const declined: CouncilEvent[] = [
      { type: "receipt", payload: { status: "rejected", threadId: "thread-test", rejectedItemId: GIFT_ITEM.id, total: 42 } },
      { type: "run_state", payload: { threadId: "thread-test", status: "complete", interrupts: [], state: {} } },
    ];
    const backend = fakeBackend({ start: [LIVE_START], resume: [declined] });
    start({ fetchImpl: backend.fetchImpl });
    await reachMandate();
    expect(emitGesture({ type: "reject" })).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backend.calls.resume).toEqual([{ threadId: "thread-test", action: "reject", itemId: GIFT_ITEM.id }]);
    expect(state().phase).toBe("receipt");
    expect(state().receipt?.status).toBe("rejected");
    expect(state().carts).toEqual([]);
    expect(state().notice).toMatch(/declined/i);
  });

  it("refuses to approve a replayed demo because there is no thread to resume", async () => {
    const backend = fakeBackend();
    start({ preferReplay: true, fetchImpl: backend.fetchImpl });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("awaitMandate");
    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(backend.calls.resume).toHaveLength(0);
    expect(state().phase).toBe("awaitMandate");
    expect(state().error).toMatch(/recorded demo/);
    expect(state().carts).toEqual([]);
  });

  it("cancels an in-flight resume on reset", async () => {
    const backend = fakeBackend({ start: [LIVE_START], resume: [] });
    const hanging = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/council")) return backend.fetchImpl(input, init);
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    }) as typeof fetch;
    start({ fetchImpl: hanging });
    await reachMandate();
    emitGesture({ type: "handshakeComplete" });
    await vi.advanceTimersByTimeAsync(10);
    expect(state().phase).toBe("signing");
    emitGesture({ type: "reset" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(state().phase).toBe("lobby");
    expect(state().error).toBeNull();
    expect(state().threadId).toBeNull();
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
    emitGesture({ type: "pinchTap", target: "tree" });
    expect(state().profileOpenId).toBeNull();
  });

  it("convenes from the hearth only once someone is seated", async () => {
    start();
    emitGesture({ type: "pinchTap", target: "hearth" });
    expect(state().phase).toBe("lobby");
    expect(state().error).toMatch(/Seat at least one/);
    emitGesture({ type: "seat", spriteId: "son" });
    emitGesture({ type: "pinchTap", target: "hearth" });
    expect(state().phase).toBe("convening");
    expect(state().mission).toMatchObject({ budget: 200, type: "shared", invitedSpriteIds: ["son"] });
  });

  it("rejects lobby gestures once the council is running and toggles reasoning anywhere", async () => {
    start();
    seatAllAndConvene();
    expect(emitGesture({ type: "seat", spriteId: "wife" })).toBe(false);
    expect(emitGesture({ type: "toggleReasoning" })).toBe(true);
    expect(state().reasoningVisible).toBe(true);
    emitGesture({ type: "toggleReasoning" });
    await vi.advanceTimersByTimeAsync(0);
    emitGesture({ type: "pinchTap", target: "sprite:son" });
    expect(state().reasoningFocusId).toBe("son");
    expect(state().reasoningVisible).toBe(true);
    expect(state().profileOpenId).toBeNull();
  });

  it("restores the previous arming policy on dispose", () => {
    start().dispose();
    director = null;
    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
  });
});
