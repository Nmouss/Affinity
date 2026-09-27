import { proxyBackendSse } from "@/lib/server/backendProxy";

// Resumes the interrupted thread (approve, replace_agent, reject) through POST /runs/resume/stream.
// The same threadId that started the run must be used; the backend owns preflight and cart creation.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyBackendSse("/runs/resume/stream", request);
}
