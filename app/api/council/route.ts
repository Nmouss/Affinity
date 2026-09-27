import { adaptCouncilStream } from "@/lib/director/sseAdapter";
import type { FamilyProfile, Mission } from "@/types/domain";

export const runtime = "nodejs";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

interface CouncilRequestBody {
  mission: Mission;
  profiles?: FamilyProfile[];
  threadId?: string;
}

/** Proxies the mission to the Python council graph and relays its SSE stream, reshaped for the frontend. */
export async function POST(request: Request) {
  const body = (await request.json()) as CouncilRequestBody;

  const upstream = await fetch(`${BACKEND_URL}/runs/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ mission: body.mission, profiles: body.profiles ?? [], threadId: body.threadId }),
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
