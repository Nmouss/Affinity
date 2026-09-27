export const runtime = "nodejs";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/** Keeps the Google Places key server-side while streaming a current place photo to the UI. */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name");
  if (!name) return Response.json({ detail: "Missing photo name" }, { status: 400 });
  const upstream = await fetch(`${BACKEND_URL}/places/photo?name=${encodeURIComponent(name)}&max_width=640`, {
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return Response.json({ detail: "Place photo unavailable" }, { status: upstream.status });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
