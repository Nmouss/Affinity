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
