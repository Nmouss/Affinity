// Deepgram Aura text-to-speech for the interviewer's lines. Server-only key; the five fixed lines
// are cached in memory so questions start instantly after the first play. Text is capped so this
// cannot be used as a general-purpose speech proxy.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPEAK_URL = "https://api.deepgram.com/v1/speak";
const DEFAULT_MODEL = "aura-2-luna-en";
const MAX_TEXT = 300;
const MAX_CACHE = 32;

const cache = new Map<string, ArrayBuffer>();

function remember(key: string, audio: ArrayBuffer) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, audio);
}

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("text")?.trim() ?? "";
  if (!text || text.length > MAX_TEXT) return Response.json({ detail: "text is required (max 300 characters)" }, { status: 400 });
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) return Response.json({ configured: false }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const model = process.env.DEEPGRAM_TTS_MODEL?.trim() || DEFAULT_MODEL;
  const cacheKey = `${model}\n${text}`;
  const hit = cache.get(cacheKey);
  const headers = { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" };
  if (hit) return new Response(hit.slice(0), { headers });

  try {
    const upstream = await fetch(`${SPEAK_URL}?model=${encodeURIComponent(model)}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });
    if (!upstream.ok) return Response.json({ detail: "Voice unavailable" }, { status: 502 });
    const audio = await upstream.arrayBuffer();
    remember(cacheKey, audio);
    return new Response(audio, { headers });
  } catch {
    return Response.json({ detail: "Voice unavailable" }, { status: 502 });
  }
}
