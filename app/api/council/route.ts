import { proxyBackendSse } from "@/lib/server/backendProxy";

// Starts a council run: the browser's {threadId, mission, profiles} envelope goes straight to the
// Python backend's POST /runs/stream and its SSE frames stream back unbuffered. The demo replay no
// longer lives here; it plays client-side (lib/demo/stageTranscript.ts) and is labeled as replay.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyBackendSse("/runs/stream", request);
}
