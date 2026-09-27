import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as startRoute } from "@/app/api/council/route";
import { POST as resumeRoute } from "@/app/api/council/resume/route";
import { backendBaseUrl, DEFAULT_BACKEND_URL, proxyBackendSse } from "@/lib/server/backendProxy";

const encoder = new TextEncoder();

function post(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/council", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

async function readAll(response: Response): Promise<string> {
  return new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backendBaseUrl", () => {
  it("defaults to the local FastAPI port and strips trailing slashes", () => {
    expect(backendBaseUrl({})).toBe(DEFAULT_BACKEND_URL);
    expect(backendBaseUrl({ AFFINITY_BACKEND_URL: "https://agents.example/" })).toBe("https://agents.example");
    expect(backendBaseUrl({ AFFINITY_BACKEND_URL: "   " })).toBe(DEFAULT_BACKEND_URL);
  });
});

describe("proxyBackendSse", () => {
  it("forwards the envelope untouched and streams frames before the upstream closes", async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (controller) => (upstream = controller) });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    const envelope = { threadId: "t-1", mission: { occasion: "Christmas" }, profiles: [] };

    const response = await proxyBackendSse("/runs/stream", post(envelope), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { AFFINITY_BACKEND_URL: "http://backend.test:9000" },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://backend.test:9000/runs/stream");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(envelope));
    expect(new Headers(init.headers).get("accept")).toBe("text/event-stream");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-transform");

    // The first frame must reach the client while the upstream is still open (no buffering).
    const reader = response.body!.getReader();
    upstream.enqueue(encoder.encode('event: opinion\ndata: {"spriteId":"wife"}\n\n'));
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("event: opinion");
    upstream.close();
    expect((await reader.read()).done).toBe(true);
  });

  it("turns an unreachable backend into one safe error frame", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const response = await proxyBackendSse("/runs/stream", post({}), { fetchImpl: fetchImpl as unknown as typeof fetch, env: {} });
    expect(response.status).toBe(200);
    const text = await readAll(response);
    expect(text).toMatch(/^event: error\n/);
    const payload = JSON.parse(text.split("data: ")[1]!.trim()) as { detail: string; status: number };
    expect(payload.status).toBe(502);
    expect(payload.detail).toMatch(/unreachable/);
    expect(payload.detail).not.toContain("127.0.0.1:8000/runs"); // no backend path leaks past the host
  });

  it("relays a backend validation error with its status and detail", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ detail: "Provide action or approve" }, { status: 422 }));
    const response = await proxyBackendSse("/runs/resume/stream", post({}), { fetchImpl: fetchImpl as unknown as typeof fetch, env: {} });
    const text = await readAll(response);
    expect(text).toContain('"detail":"Provide action or approve"');
    expect(text).toContain('"status":422');
  });

  it("never puts backend credentials or URL in the browser response", async () => {
    const fetchImpl = vi.fn(async () => new Response("event: run_state\ndata: {}\n\n", { status: 200 }));
    const response = await proxyBackendSse("/runs/stream", post({}), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { AFFINITY_BACKEND_URL: "http://secret-host:1234", SHOPIFY_UCP_CLIENT_SECRET: "shh" },
    });
    const text = await readAll(response);
    expect(text).not.toContain("secret-host");
    expect(text).not.toContain("shh");
  });
});

describe("route handlers", () => {
  it("start proxies to /runs/stream and resume to /runs/resume/stream", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response("event: run_state\ndata: {}\n\n", { status: 200 });
      }),
    );
    await readAll(await startRoute(post({ threadId: "t" })));
    await readAll(await resumeRoute(post({ threadId: "t", action: "approve", signature: "s" })));
    expect(calls.map((url) => new URL(url).pathname)).toEqual(["/runs/stream", "/runs/resume/stream"]);
  });
});
