import { z } from "zod";

// Turns the interview transcript into preferences on the Python backend (live model only). In demo
// mode the backend answers 503 and the browser uses its own deterministic extractor instead.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const TIMEOUT_MS = 8000;

const bodySchema = z.object({
  name: z.string().min(1).max(40),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(40),
        question: z.string().max(300),
        answer: z.string().max(1000),
      }),
    )
    .max(6),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ detail: "Invalid interview payload" }, { status: 400 });

  try {
    const upstream = await fetch(`${BACKEND_URL}/interview/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (upstream.status === 503) return Response.json({ detail: "Live extraction is off" }, { status: 503 });
    if (!upstream.ok) return Response.json({ detail: "Extraction unavailable" }, { status: 502 });
    return Response.json(await upstream.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ detail: "Extraction unavailable" }, { status: 502 });
  }
}
