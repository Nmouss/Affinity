// Server-only bridge from the Next API routes to the Python LangGraph backend. The browser never
// learns the backend URL or any provider credential; it only ever talks to /api/council*.

export const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function backendBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.AFFINITY_BACKEND_URL?.trim() || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

/** One SSE `error` frame, so the client sees the same safe shape the backend itself emits. */
export function sseErrorResponse(detail: string, status: number): Response {
  const frame = `event: error\ndata: ${JSON.stringify({ detail, status })}\n\n`;
  return new Response(frame, { status: 200, headers: SSE_HEADERS });
}

export interface ProxyOptions {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

async function upstreamDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // Not JSON; fall through to the raw text.
    }
    return text.trim() || `Council backend responded ${response.status}`;
  } catch {
    return `Council backend responded ${response.status}`;
  }
}

/**
 * Forwards the request body to `${AFFINITY_BACKEND_URL}${path}` and streams the SSE response back
 * without buffering. Transport failures become a single `error` frame rather than an HTTP error, so
 * the client's stream handling has one shape to deal with.
 */
export async function proxyBackendSse(path: string, request: Request, options: ProxyOptions = {}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = backendBaseUrl(options.env);
  const body = await request.text();

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body,
      signal: request.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (request.signal?.aborted) return new Response(null, { status: 499 });
    const reason = error instanceof Error ? error.message : String(error);
    return sseErrorResponse(`The council backend is unreachable (${reason})`, 502);
  }

  if (!upstream.ok || !upstream.body) {
    return sseErrorResponse(await upstreamDetail(upstream), upstream.status || 502);
  }
  return new Response(upstream.body, { status: 200, headers: SSE_HEADERS });
}
