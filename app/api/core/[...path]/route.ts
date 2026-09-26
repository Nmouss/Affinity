import { AffinityCoreService } from "@/backend/service";

// Thin HTTP adapter over the transport-neutral AffinityCoreService, used by the mission app's
// `?api=http` mode. Routes follow shared/contracts/api.ts; errors map to 400 / 404 / 409 as
// backend/API.md specifies. State is in memory, one service per server process.

type Service = Record<string, (...args: unknown[]) => unknown>;
type Handler = (service: Service, params: string[], body: unknown) => unknown;

const ROUTES: [method: string, pattern: RegExp, handler: Handler][] = [
  ["POST", /^\/missions\/parse$/, (s, _m, b) => s.parseMission!(b)],
  ["POST", /^\/missions$/, (s, _m, b) => s.createMission!(b)],
  ["GET", /^\/missions\/([^/]+)$/, (s, m) => s.getMission!(m[1])],
  ["POST", /^\/missions\/([^/]+)\/(?:participants|shoppers)$/, (s, m, b) => s.addParticipant!(m[1], b)],
  ["POST", /^\/missions\/([^/]+)\/recommend$/, (s, m, b) => s.recommend!(m[1], b)],
  ["POST", /^\/missions\/([^/]+)\/substitutions\/evaluate$/, (s, m, b) => s.evaluateSubstitution!(m[1], b)],
  ["POST", /^\/shoppers$/, (s, _m, b) => s.createShopper!(b)],
  ["POST", /^\/shoppers\/([^/]+)\/rules$/, (s, m, b) => s.addShopperRule!(m[1], b)],
  ["POST", /^\/shoppers\/([^/]+)\/comparisons$/, (s, m, b) => s.applyShopperComparison!(m[1], b)],
  ["POST", /^\/shoppers\/([^/]+)\/use-observations$/, (s, m, b) => s.recordShopperUseObservation!(m[1], b)],
  ["POST", /^\/shoppers\/([^/]+)\/(?:confirm|use-requirements)$/, (s, m, b) => s.confirmShopperUseObservation!(m[1], b)],
  ["POST", /^\/shoppers\/([^/]+)\/events$/, (s, m, b) => s.acceptShopperEvent!(m[1], b)],
  ["POST", /^\/voice\/interpret$/, (s, _m, b) => s.interpretVoice!(b)],
];

const holder = globalThis as typeof globalThis & { __affinityCore?: Service };
function service(): Service {
  holder.__affinityCore ??= new AffinityCoreService() as unknown as Service;
  return holder.__affinityCore;
}

function status(message: string): number {
  if (/^Unknown /.test(message)) return 404;
  return /eligible|conflict|pending|does not match/i.test(message) ? 409 : 400;
}

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const url = `/${(await params).path.join("/")}`;
  const route = ROUTES.find(([method, pattern]) => method === request.method && pattern.test(url));
  if (!route) return Response.json({ error: `No route for ${request.method} ${url}` }, { status: 404 });
  try {
    const raw = request.method === "GET" ? "" : await request.text();
    const matched = url.match(route[1])!.map(decodeURIComponent);
    return Response.json(await route[2](service(), matched, raw ? JSON.parse(raw) : {}));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: status(message) });
  }
}

export const GET = handle;
export const POST = handle;
