// Floor-level crowd physics: every person is a circle on the floor, and nobody walks through anybody.
// Each scene keeps its own named crowd ("room" for the living room, "plaza" for the People Maker).
// Components register an agent on mount, steer it each frame, and resolveOverlaps runs once per frame
// per crowd. Pure math on plain objects so it is unit-tested and allocation-free per frame.

export type CrowdName = "room" | "plaza";

export interface CrowdAgent {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Floor radius in world ft (see radiusForScale). */
  radius: number;
  /** Pinned agents (seated, dragged, posing) are obstacles: others avoid them, they never get pushed. */
  pinned: boolean;
}

export interface SteerParams {
  goalX: number;
  goalZ: number;
  /** Top speed in ft/s. */
  maxSpeed: number;
  /** ft/s² toward the desired velocity. */
  accel: number;
  /** Inside this distance the desired speed falls off linearly to 0 at the goal. */
  slowRadius: number;
  dt: number;
}

export interface Velocity {
  vx: number;
  vz: number;
}

const crowds = new Map<CrowdName, Map<string, CrowdAgent>>();

export function getCrowd(name: CrowdName): Map<string, CrowdAgent> {
  let crowd = crowds.get(name);
  if (!crowd) {
    crowd = new Map();
    crowds.set(name, crowd);
  }
  return crowd;
}

/** Registers (or replaces) an agent and returns the stored object, which the caller mutates in place. */
export function registerAgent(name: CrowdName, agent: CrowdAgent): CrowdAgent {
  getCrowd(name).set(agent.id, agent);
  return agent;
}

export function unregisterAgent(name: CrowdName, id: string): void {
  getCrowd(name).delete(id);
}

export function getAgents(name: CrowdName): Iterable<CrowdAgent> {
  return getCrowd(name).values();
}

/** Floor radius for a character at this model scale and body width (the lathe body is ~0.56 wide). */
export function radiusForScale(scale: number, width = 1): number {
  return 0.56 * scale * width + 0.08;
}

// --- steer() tuning -------------------------------------------------------------------------
// Beyond this many extra ft past the pair's radius sum, a neighbor is ignored entirely.
const AVOID_LOOKAHEAD_PAD = 1.2;
// Overall push strength, scaled by maxSpeed so it composes with the arrival velocity.
const AVOID_STRENGTH = 1;
// A separation push is split between a straight push-away (SEPARATION) and a perpendicular
// nudge (TANGENT); the tangential part is what makes two agents curve around each other instead
// of a head-on pair just cancelling out into a dead stop.
const AVOID_SEPARATION_WEIGHT = 0.7;
const AVOID_TANGENT_WEIGHT = 0.3;
// Neighbors behind the agent still get a baseline push (AHEAD_MIN); one directly ahead in the
// direction of travel gets up to AHEAD_MIN + AHEAD_MAX_BONUS.
const AVOID_AHEAD_MIN = 0.5;
const AVOID_AHEAD_MAX_BONUS = 0.5;

/** Deterministic direction from a pair of ids, used only when two agents exactly coincide. */
function hashAngle(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967295) * Math.PI * 2;
}

/**
 * The velocity `agent` should take this frame toward the goal, bending around `neighbors`. Writes
 * into `out` and returns it; does not move the agent. Arrival seek toward the goal (ramped by
 * accel/slowRadius) plus a separation steer away from nearby neighbors (pinned ones included, as
 * obstacles), weighted by how close they are and whether they're ahead of the agent's current
 * heading. The blended desired velocity is capped to maxSpeed, then the change from the agent's
 * current velocity is capped to accel*dt. Deterministic, allocation-free, and finite even when two
 * agents share a position exactly.
 */
export function steer(
  agent: CrowdAgent,
  neighbors: Iterable<CrowdAgent>,
  { goalX, goalZ, maxSpeed, accel, slowRadius, dt }: SteerParams,
  out: Velocity = { vx: 0, vz: 0 },
): Velocity {
  const dx = goalX - agent.x;
  const dz = goalZ - agent.z;
  const dist = Math.hypot(dx, dz);
  const arrivalDirX = dist > 1e-4 ? dx / dist : 0;
  const arrivalDirZ = dist > 1e-4 ? dz / dist : 0;
  const desiredSpeed = dist > 1e-4 ? (dist < slowRadius ? (maxSpeed * dist) / slowRadius : maxSpeed) : 0;
  let desiredX = arrivalDirX * desiredSpeed;
  let desiredZ = arrivalDirZ * desiredSpeed;

  // Direction of travel, used to tell neighbors ahead from neighbors behind. Falls back to the
  // arrival direction while at rest (e.g. the first frame after spawning).
  let travelX = agent.vx;
  let travelZ = agent.vz;
  let travelLen = Math.hypot(travelX, travelZ);
  if (travelLen < 1e-4) {
    travelX = arrivalDirX;
    travelZ = arrivalDirZ;
    travelLen = Math.hypot(travelX, travelZ);
  }
  const invTravelLen = travelLen > 1e-4 ? 1 / travelLen : 0;

  let avoidX = 0;
  let avoidZ = 0;
  for (const neighbor of neighbors) {
    if (neighbor.id === agent.id) continue;
    const awayX = agent.x - neighbor.x;
    const awayZ = agent.z - neighbor.z;
    let d = Math.hypot(awayX, awayZ);
    const lookAhead = agent.radius + neighbor.radius + AVOID_LOOKAHEAD_PAD;
    if (d >= lookAhead) continue;

    let sepX: number;
    let sepZ: number;
    if (d < 1e-6) {
      // Exactly coincident: pick a stable, deterministic push direction from the id pair so the
      // result is finite and reproducible instead of dividing by zero.
      const angle = hashAngle(`${agent.id}>${neighbor.id}`);
      sepX = Math.cos(angle);
      sepZ = Math.sin(angle);
      d = 0;
    } else {
      sepX = awayX / d;
      sepZ = awayZ / d;
    }

    const closeness = (lookAhead - d) / lookAhead; // 0 at the edge of the look-ahead, 1 at contact
    const towardX = -sepX;
    const towardZ = -sepZ;
    const aheadDot = invTravelLen > 0 ? travelX * invTravelLen * towardX + travelZ * invTravelLen * towardZ : 0;
    const aheadFactor = AVOID_AHEAD_MIN + AVOID_AHEAD_MAX_BONUS * Math.max(0, aheadDot);
    const weight = closeness * aheadFactor * AVOID_STRENGTH * maxSpeed;

    // A straight push-away blended with a perpendicular nudge, so crossing paths curve around
    // each other instead of two opposing velocities just cancelling into a stop.
    const perpX = -sepZ;
    const perpZ = sepX;
    avoidX += (sepX * AVOID_SEPARATION_WEIGHT + perpX * AVOID_TANGENT_WEIGHT) * weight;
    avoidZ += (sepZ * AVOID_SEPARATION_WEIGHT + perpZ * AVOID_TANGENT_WEIGHT) * weight;
  }

  desiredX += avoidX;
  desiredZ += avoidZ;
  const desiredLen = Math.hypot(desiredX, desiredZ);
  if (desiredLen > maxSpeed && desiredLen > 1e-9) {
    const scale = maxSpeed / desiredLen;
    desiredX *= scale;
    desiredZ *= scale;
  }

  let dvx = desiredX - agent.vx;
  let dvz = desiredZ - agent.vz;
  const dvLen = Math.hypot(dvx, dvz);
  const maxDv = accel * dt;
  if (dvLen > maxDv && dvLen > 1e-9) {
    const scale = maxDv / dvLen;
    dvx *= scale;
    dvz *= scale;
  }

  let vx = agent.vx + dvx;
  let vz = agent.vz + dvz;
  const speed = Math.hypot(vx, vz);
  if (speed > maxSpeed && speed > 1e-9) {
    const scale = maxSpeed / speed;
    vx *= scale;
    vz *= scale;
  }

  out.vx = vx;
  out.vz = vz;
  return out;
}

// Reused across calls so resolveOverlaps never allocates a new array per frame; it only grows to
// fit the largest crowd seen so far.
const overlapScratch: CrowdAgent[] = [];

/**
 * Pushes overlapping agents apart in place, a couple of relaxation passes at a time. Both unpinned:
 * split the correction. One pinned: only the other moves. Both pinned: nothing happens. Accepts any
 * Iterable (e.g. getAgents(name)); iterates it into a reused scratch array so there is no per-call
 * allocation beyond that array occasionally growing.
 */
export function resolveOverlaps(agents: Iterable<CrowdAgent>, iterations = 2): void {
  overlapScratch.length = 0;
  for (const agent of agents) overlapScratch.push(agent);
  const count = overlapScratch.length;

  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let i = 0; i < count; i++) {
      const a = overlapScratch[i];
      for (let j = i + 1; j < count; j++) {
        const b = overlapScratch[j];
        if (a.pinned && b.pinned) continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        let d = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;
        if (d >= minDist) continue;

        let nx: number;
        let nz: number;
        if (d < 1e-6) {
          const angle = hashAngle(`${a.id}>${b.id}`);
          nx = Math.cos(angle);
          nz = Math.sin(angle);
          d = 0;
        } else {
          nx = dx / d;
          nz = dz / d;
        }
        const overlap = minDist - d;

        if (a.pinned) {
          b.x += nx * overlap;
          b.z += nz * overlap;
        } else if (b.pinned) {
          a.x -= nx * overlap;
          a.z -= nz * overlap;
        } else {
          const half = overlap / 2;
          a.x -= nx * half;
          a.z -= nz * half;
          b.x += nx * half;
          b.z += nz * half;
        }
      }
    }
  }
}
