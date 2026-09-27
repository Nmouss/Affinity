import { adaptCouncilStream } from "@/lib/director/sseAdapter";

export const runtime = "nodejs";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

interface ResumeRequestBody {
  threadId: string;
  action: "approve" | "reject" | "replace_agent";
  itemId?: string;
  prompt?: string;
  signature?: string;
}

/** Proxies a mandate resume (e.g. a cart-item swap) to the backend and relays its SSE stream. */
export async function POST(request: Request) {
  const body = (await request.json()) as ResumeRequestBody;

  const upstream = await fetch(`${BACKEND_URL}/runs/resume/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });

  if (!upstream.ok || !upstream.body) {
    return Response.json({ detail: "Council backend unavailable" }, { status: 502 });
  }

  return new Response(adaptCouncilStream(upstream.body), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
