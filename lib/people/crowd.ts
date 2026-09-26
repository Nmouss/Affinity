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

/**
 * The velocity `agent` should take this frame toward the goal, bending around `neighbors`. Writes into
 * `out` and returns it; does not move the agent. Stub: plain arrival steering with no avoidance
 * until the crowd track lands.
 */
export function steer(
  agent: CrowdAgent,
  _neighbors: Iterable<CrowdAgent>,
  { goalX, goalZ, maxSpeed, accel, slowRadius, dt }: SteerParams,
  out: Velocity = { vx: 0, vz: 0 },
): Velocity {
  const dx = goalX - agent.x;
  const dz = goalZ - agent.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) {
    out.vx = 0;
    out.vz = 0;
    return out;
  }
  const desired = dist < slowRadius ? (maxSpeed * dist) / slowRadius : maxSpeed;
  const speed = Math.hypot(agent.vx, agent.vz);
  const next = speed < desired ? Math.min(desired, speed + accel * dt) : Math.max(desired, speed - accel * dt);
  out.vx = (dx / dist) * next;
  out.vz = (dz / dist) * next;
  return out;
}

/** Pushes overlapping unpinned agents apart in place. Stub: no-op until the crowd track lands. */
export function resolveOverlaps(_agents: Iterable<CrowdAgent>, _iterations = 2): void {}
