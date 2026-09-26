import type { CouncilEvent } from "@/types/domain";

const COUNCIL_EVENT_TYPES: ReadonlySet<string> = new Set<CouncilEvent["type"]>([
  "opinion",
  "constraints",
  "bundle",
  "score",
  "veto",
  "awaiting_mandate",
  "receipt",
]);

export interface SseParser {
  /** Feeds decoded text; chunks may split anywhere, including inside a CRLF. */
  push: (chunk: string) => void;
  /** Flushes a final event that wasn't followed by a blank line. */
  end: () => void;
}

/**
 * Incremental parser for `event: <type>\ndata: <json>\n\n` frames. Unknown event types, comments,
 * and malformed JSON are dropped rather than breaking the stream.
 */
export function createSseParser(onEvent: (event: CouncilEvent) => void): SseParser {
  let buffer = "";
  let eventType = "message";
  let data: string[] = [];

  const dispatch = () => {
    if (data.length > 0 && COUNCIL_EVENT_TYPES.has(eventType)) {
      try {
        onEvent({ type: eventType, payload: JSON.parse(data.join("\n")) } as CouncilEvent);
      } catch {
        // Malformed payloads are skipped; the beat queue carries on with the next event.
      }
    }
    eventType = "message";
    data = [];
  };

  const handleLine = (line: string) => {
    if (line === "") return dispatch();
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventType = value || "message";
    else if (field === "data") data.push(value);
  };

  const drain = (final: boolean) => {
    for (;;) {
      const match = /\r\n|\r|\n/.exec(buffer);
      if (!match) break;
      // A trailing lone \r might be the first half of a CRLF split across chunks.
      if (!final && match[0] === "\r" && match.index === buffer.length - 1) break;
      handleLine(buffer.slice(0, match.index));
      buffer = buffer.slice(match.index + match[0].length);
    }
  };

  return {
    push: (chunk) => {
      buffer += chunk;
      drain(false);
    },
    end: () => {
      drain(true);
      if (buffer) handleLine(buffer);
      buffer = "";
      dispatch();
    },
  };
}

/** Yields CouncilEvents from an SSE byte stream as they arrive. */
export async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<CouncilEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const ready: CouncilEvent[] = [];
  const parser = createSseParser((event) => ready.push(event));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
      while (ready.length > 0) yield ready.shift()!;
    }
    parser.push(decoder.decode());
    parser.end();
    while (ready.length > 0) yield ready.shift()!;
  } finally {
    reader.releaseLock();
  }
}
