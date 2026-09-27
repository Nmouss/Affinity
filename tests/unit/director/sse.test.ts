import { describe, expect, it } from "vitest";
import { createSseParser, readSseStream } from "@/lib/director/sse";
import { STAGE_TRANSCRIPT } from "@/lib/demo/stageTranscript";
import type { CouncilEvent } from "@/types/domain";

function encode(events: CouncilEvent[], newline = "\n"): string {
  return events.map((event) => `event: ${event.type}${newline}data: ${JSON.stringify(event.payload)}${newline}${newline}`).join("");
}

function parseAll(chunks: string[]): CouncilEvent[] {
  const events: CouncilEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  for (const chunk of chunks) parser.push(chunk);
  parser.end();
  return events;
}

describe("createSseParser", () => {
  it("parses several events delivered in one chunk", () => {
    expect(parseAll([encode(STAGE_TRANSCRIPT)])).toEqual(STAGE_TRANSCRIPT);
  });

  it("survives a chunk boundary at every character position", () => {
    const text = encode(STAGE_TRANSCRIPT.slice(0, 4));
    for (let split = 1; split < text.length; split += 7) {
      expect(parseAll([text.slice(0, split), text.slice(split)])).toEqual(STAGE_TRANSCRIPT.slice(0, 4));
    }
  });

  it("handles CRLF line endings, including a CRLF split across chunks", () => {
    const text = encode(STAGE_TRANSCRIPT.slice(0, 3), "\r\n");
    const crlf = text.indexOf("\r\n");
    expect(parseAll([text.slice(0, crlf + 1), text.slice(crlf + 1)])).toEqual(STAGE_TRANSCRIPT.slice(0, 3));
    expect(parseAll(text.split(""))).toEqual(STAGE_TRANSCRIPT.slice(0, 3));
  });

  it("ignores unknown event types, comments, and malformed JSON", () => {
    const text = [
      ": keep-alive\n\n",
      'event: thread\ndata: {"threadId":"t1"}\n\n',
      "event: opinion\ndata: {not json\n\n",
      encode(STAGE_TRANSCRIPT.slice(0, 1)),
    ].join("");
    expect(parseAll([text])).toEqual(STAGE_TRANSCRIPT.slice(0, 1));
  });

  it("reports unknown and malformed frames so a newer backend stays forward-compatible", () => {
    const unknown: Array<[string, string]> = [];
    const malformed: Array<[string, string]> = [];
    const events: CouncilEvent[] = [];
    const parser = createSseParser((event) => events.push(event), {
      onUnknown: (type, data) => unknown.push([type, data]),
      onMalformed: (type, data) => malformed.push([type, data]),
    });
    parser.push('event: thread\ndata: {"threadId":"t1"}\n\nevent: score\ndata: {oops\n\n');
    parser.end();
    expect(events).toEqual([]);
    expect(unknown).toEqual([["thread", '{"threadId":"t1"}']]);
    expect(malformed).toEqual([["score", "{oops"]]);
  });

  it("parses every live backend frame the stage understands", () => {
    const live: CouncilEvent[] = [
      { type: "mission", payload: { occasion: "Christmas", budget: 60, freeText: "gift", type: "gift", invitedSpriteIds: ["wife"], recipientId: "wife" } },
      { type: "deliberation", payload: { spriteId: "wife", say: "Agreed.", replyToSpriteIds: ["son"], agreements: [], concerns: [], compromiseWishes: [] } },
      { type: "consensus", payload: { hardRules: [], wishes: [], conflicts: [] } },
      { type: "search_plan", payload: { kind: "shopping", slots: [{ slotId: "gift", queries: ["scarf"], rationale: "warm" }] } },
      { type: "revision", payload: { spriteId: "son", complaint: "too plain" } },
      { type: "scores_complete", payload: [] },
      { type: "awaiting_mandate", payload: { type: "cart_mandate", bundle: { items: [], total: 0, serves: {} }, requiredGesture: "handshake", holdSeconds: 1.5 } },
      { type: "repair_requested", payload: { action: "replace_agent" } },
      { type: "repair", payload: { itemId: "x", slotId: "gift", prompt: "softer", autonomous: false } },
      { type: "preflight", payload: { status: "changed", changes: ["Scarf is now 44.00."], total: 44 } },
      { type: "receipt", payload: { status: "approved", threadId: "t1", total: 44, signature: "s" } },
      { type: "carts", payload: [{ merchantDomain: "shop.example", cartId: "c", checkoutUrl: "https://shop.example/cart/c" }] },
      { type: "notifications", payload: [] },
      { type: "run_state", payload: { threadId: "t1", status: "complete", interrupts: [], state: {} } },
      { type: "error", payload: { detail: "Council execution failed", status: 500 } },
    ];
    expect(parseAll([encode(live)])).toEqual(live);
  });

  it("flushes a final event without a trailing blank line", () => {
    const text = encode(STAGE_TRANSCRIPT.slice(0, 1)).trimEnd();
    expect(parseAll([text])).toEqual(STAGE_TRANSCRIPT.slice(0, 1));
  });
});

describe("readSseStream", () => {
  it("yields events from a byte stream split mid multi-byte character", async () => {
    const bytes = new TextEncoder().encode(encode(STAGE_TRANSCRIPT));
    // The em dash in Maya's line is multi-byte; split right through it.
    const dash = new TextEncoder().encode("—");
    const at = bytes.findIndex((byte, index) => byte === dash[0] && bytes[index + 1] === dash[1]) + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, at));
        controller.enqueue(bytes.slice(at));
        controller.close();
      },
    });
    const events: CouncilEvent[] = [];
    for await (const event of readSseStream(stream)) events.push(event);
    expect(events).toEqual(STAGE_TRANSCRIPT);
  });
});
