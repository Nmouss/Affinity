// Deepgram prerecorded speech-to-text for one recorded answer. Used when the browser cannot stream
// (no Member-role key to mint a socket token, or a browser that records mp4 instead of webm). The
// audio blob comes in as the request body; the key stays server-side.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LISTEN_URL = "https://api.deepgram.com/v1/listen";
const DEFAULT_MODEL = "nova-3";
/** A 20-second opus answer is well under 1 MB; anything near this is not an answer. */
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac"];

export async function POST(request: Request) {
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) return Response.json({ configured: false }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(contentType)) return Response.json({ detail: "Unsupported audio type" }, { status: 415 });
  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) return Response.json({ detail: "Empty recording" }, { status: 400 });
  if (audio.byteLength > MAX_BYTES) return Response.json({ detail: "Recording too long" }, { status: 413 });

  const model = process.env.DEEPGRAM_STT_MODEL?.trim() || DEFAULT_MODEL;
  try {
    const upstream = await fetch(`${LISTEN_URL}?model=${encodeURIComponent(model)}&smart_format=true`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": contentType },
      body: audio,
      cache: "no-store",
    });
    if (!upstream.ok) return Response.json({ detail: "Transcription unavailable" }, { status: 502 });
    const body = (await upstream.json()) as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
    const transcript = body.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return Response.json({ transcript }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ detail: "Transcription unavailable" }, { status: 502 });
  }
}
