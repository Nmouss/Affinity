// Mints a short-lived Deepgram token for the browser's live speech-to-text socket. The long-lived
// DEEPGRAM_API_KEY stays here (server-only, never NEXT_PUBLIC_); the browser gets a usage-only JWT
// that expires in minutes and cannot reach Deepgram's management APIs.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 3600;

function ttlSeconds(): number {
  const raw = Number(process.env.DEEPGRAM_TOKEN_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.floor(raw));
}

export async function POST(request: Request) {
  // Cheap CSRF guard: browsers send Sec-Fetch-Site; only our own pages may mint tokens.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json({ detail: "Forbidden" }, { status: 403 });
  }
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) return Response.json({ configured: false }, { status: 503, headers: { "Cache-Control": "no-store" } });

  try {
    const upstream = await fetch(GRANT_URL, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: ttlSeconds() }),
      cache: "no-store",
    });
    // A key without the Member role can't mint browser tokens (401/403). That's a supported setup,
    // not a failure: the interview records whole answers and transcribes them server-side instead.
    if (upstream.status === 401 || upstream.status === 403) {
      return Response.json({ configured: true, streaming: false }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!upstream.ok) return Response.json({ detail: "Voice token unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    const grant = (await upstream.json()) as { access_token?: string; expires_in?: number };
    if (!grant.access_token) return Response.json({ detail: "Voice token unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    return Response.json({ token: grant.access_token, expiresIn: grant.expires_in ?? ttlSeconds() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ detail: "Voice token unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
