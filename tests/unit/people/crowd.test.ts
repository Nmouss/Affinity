import { beforeEach, describe, expect, it } from "vitest";
import {
  getAgents,
  getCrowd,
  radiusForScale,
  registerAgent,
  resolveOverlaps,
  steer,
  unregisterAgent,
  type CrowdAgent,
  type SteerParams,
} from "@/lib/people/crowd";

/** A plain agent, not registered in any crowd registry, for pure steer()/resolveOverlaps() sims. */
function makeAgent(id: string, x: number, z: number, radius = 0.3): CrowdAgent {
  return { id, x, z, vx: 0, vz: 0, radius, pinned: false };
}

const BASE_PARAMS = { maxSpeed: 3, accel: 6, slowRadius: 1.5 } as const;

/** One arrival+avoidance+move+resolve tick for a whole flock, sharing one goal map. */
function step(agents: CrowdAgent[], goals: Map<string, { x: number; z: number }>, dt: number): void {
  const params: SteerParams[] = agents.map((agent) => {
    const goal = goals.get(agent.id)!;
    return { goalX: goal.x, goalZ: goal.z, dt, ...BASE_PARAMS };
  });
  agents.forEach((agent, i) => {
    if (agent.pinned) return;
    steer(agent, agents, params[i]!, agent);
  });
  agents.forEach((agent) => {
    if (agent.pinned) return;
    agent.x += agent.vx * dt;
    agent.z += agent.vz * dt;
  });
  resolveOverlaps(agents);
}

function reachedGoal(agent: CrowdAgent, goal: { x: number; z: number }, eps = 0.05): boolean {
  return Math.hypot(goal.x - agent.x, goal.z - agent.z) < eps;
}

describe("crowd registry", () => {
  it("keeps named crowds independent", () => {
    const room = registerAgent("room", makeAgent("shared-id", 0, 0));
    const plaza = registerAgent("plaza", makeAgent("shared-id", 5, 5));
    expect(room).not.toBe(plaza);
    expect([...getAgents("room")].map((a) => a.id)).toEqual(["shared-id"]);
    expect([...getAgents("plaza")].map((a) => a.id)).toEqual(["shared-id"]);

    unregisterAgent("room", "shared-id");
    expect([...getAgents("room")]).toHaveLength(0);
    expect([...getAgents("plaza")]).toHaveLength(1);

    unregisterAgent("plaza", "shared-id");
    expect([...getAgents("plaza")]).toHaveLength(0);
  });

  it("register/unregister per crowd name via getCrowd", () => {
    getCrowd("room").clear();
    getCrowd("plaza").clear();
    registerAgent("room", makeAgent("a", 1, 1));
    registerAgent("room", makeAgent("b", 2, 2));
    registerAgent("plaza", makeAgent("c", 3, 3));
    expect(getCrowd("room").size).toBe(2);
    expect(getCrowd("plaza").size).toBe(1);
    unregisterAgent("room", "a");
    expect(getCrowd("room").size).toBe(1);
    expect(getCrowd("room").has("b")).toBe(true);
    getCrowd("room").clear();
    getCrowd("plaza").clear();
  });
});

describe("radiusForScale", () => {
  it("grows with scale and width", () => {
    const base = radiusForScale(1, 1);
    expect(radiusForScale(2, 1)).toBeGreaterThan(base);
    expect(radiusForScale(1, 2)).toBeGreaterThan(base);
  });
});

describe("steer + resolveOverlaps", () => {
  it("two agents walking head-on never overlap by more than 5% of radius sum, and both arrive", () => {
    const a = makeAgent("a", -3, 0, 0.3);
    const b = makeAgent("b", 3, 0, 0.3);
    const agents = [a, b];
    const goals = new Map([
      ["a", { x: 3, z: 0 }],
      ["b", { x: -3, z: 0 }],
    ]);
    const dt = 1 / 60;
    const radiusSum = a.radius + b.radius;
    const maxSteps = 60 * 20; // 20s generous bound

    let steps = 0;
    for (; steps < maxSteps; steps++) {
      step(agents, goals, dt);
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      expect(dist).toBeGreaterThanOrEqual(radiusSum * 0.95);
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(b.x)).toBe(true);
      if (reachedGoal(a, goals.get("a")!) && reachedGoal(b, goals.get("b")!)) break;
    }
    expect(steps).toBeLessThan(maxSteps);
    expect(reachedGoal(a, goals.get("a")!)).toBe(true);
    expect(reachedGoal(b, goals.get("b")!)).toBe(true);
  });

  it("6 agents with crossing goals settle with no pair overlapping", () => {
    const n = 6;
    const ringRadius = 3;
    const agents: CrowdAgent[] = [];
    const goals = new Map<string, { x: number; z: number }>();
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const x = Math.cos(angle) * ringRadius;
      const z = Math.sin(angle) * ringRadius;
      const id = `p${i}`;
      agents.push(makeAgent(id, x, z, 0.3));
      // Goal is the opposite point on the ring, so every path crosses through the center.
      goals.set(id, { x: -x, z: -z });
    }

    const dt = 1 / 60;
    const maxSteps = 60 * 30;
    let steps = 0;
    for (; steps < maxSteps; steps++) {
      step(agents, goals, dt);
      if (agents.every((agent) => reachedGoal(agent, goals.get(agent.id)!, 0.08))) break;
    }
    expect(steps).toBeLessThan(maxSteps);

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const dist = Math.hypot(agents[j]!.x - agents[i]!.x, agents[j]!.z - agents[i]!.z);
        const minDist = agents[i]!.radius + agents[j]!.radius;
        expect(dist).toBeGreaterThanOrEqual(minDist * 0.95);
      }
    }
  });

  it("pinned agents never move, even when others are pushed into them", () => {
    const pinned = makeAgent("pinned", 0, 0, 0.5);
    pinned.pinned = true;
    const mover = makeAgent("mover", 0.2, 0, 0.5); // deep inside the pinned agent's radius
    const px = pinned.x;
    const pz = pinned.z;

    resolveOverlaps([pinned, mover]);
    expect(pinned.x).toBe(px);
    expect(pinned.z).toBe(pz);
    // The mover should have been pushed out to (at least close to) touching distance.
    const dist = Math.hypot(mover.x - pinned.x, mover.z - pinned.z);
    expect(dist).toBeGreaterThanOrEqual((pinned.radius + mover.radius) * 0.95);

    // Keep pushing the mover back in and re-resolving: the pinned agent still never moves.
    for (let i = 0; i < 5; i++) {
      mover.x = pinned.x + 0.05;
      mover.z = pinned.z;
      resolveOverlaps([pinned, mover]);
      expect(pinned.x).toBe(px);
      expect(pinned.z).toBe(pz);
    }
  });

  it("both agents pinned: resolveOverlaps does nothing", () => {
    const a = makeAgent("a", 0, 0, 0.5);
    const b = makeAgent("b", 0.1, 0, 0.5);
    a.pinned = true;
    b.pinned = true;
    resolveOverlaps([a, b]);
    expect(a.x).toBe(0);
    expect(a.z).toBe(0);
    expect(b.x).toBe(0.1);
    expect(b.z).toBe(0);
  });

  it("reaches the goal with similar paths at dt=1/30 vs dt=1/120 over the same total time", () => {
    const totalTime = 3;
    const goal = { x: 5, z: 2 };

    function run(dt: number): { x: number; z: number } {
      const agent = makeAgent("solo", 0, 0, 0.3);
      const steps = Math.round(totalTime / dt);
      for (let i = 0; i < steps; i++) {
        steer(agent, [agent], { goalX: goal.x, goalZ: goal.z, dt, ...BASE_PARAMS }, agent);
        agent.x += agent.vx * dt;
        agent.z += agent.vz * dt;
      }
      return { x: agent.x, z: agent.z };
    }

    const slow = run(1 / 30);
    const fast = run(1 / 120);
    expect(Math.hypot(slow.x - fast.x, slow.z - fast.z)).toBeLessThan(0.2);
    // Both should have made real progress toward the goal (not stalled).
    expect(Math.hypot(goal.x - slow.x, goal.z - slow.z)).toBeLessThan(0.3);
    expect(Math.hypot(goal.x - fast.x, goal.z - fast.z)).toBeLessThan(0.3);
  });

  it("coincident agents produce finite, non-NaN velocities", () => {
    const a = makeAgent("a", 1, 1, 0.3);
    const b = makeAgent("b", 1, 1, 0.3); // exactly on top of a
    const params: SteerParams = { goalX: 4, goalZ: 1, dt: 1 / 60, ...BASE_PARAMS };
    const outA = steer(a, [a, b], params, { vx: 0, vz: 0 });
    const outB = steer(b, [a, b], { ...params, goalX: -2, goalZ: 1 }, { vx: 0, vz: 0 });
    expect(Number.isFinite(outA.vx)).toBe(true);
    expect(Number.isFinite(outA.vz)).toBe(true);
    expect(Number.isFinite(outB.vx)).toBe(true);
    expect(Number.isFinite(outB.vz)).toBe(true);

    // resolveOverlaps on the same coincident pair must also stay finite.
    resolveOverlaps([a, b]);
    expect(Number.isFinite(a.x)).toBe(true);
    expect(Number.isFinite(a.z)).toBe(true);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.z)).toBe(true);
  });

  it("skips self when scanning neighbors (an agent is not its own obstacle)", () => {
    const a = makeAgent("solo", 0, 0, 0.5);
    const out = steer(a, [a], { goalX: 2, goalZ: 0, dt: 1 / 60, ...BASE_PARAMS }, { vx: 0, vz: 0 });
    // With only itself in the neighbor list, this must be plain arrival: straight toward the goal.
    expect(out.vx).toBeGreaterThan(0);
    expect(out.vz).toBeCloseTo(0, 6);
  });

  it("respects maxSpeed and accel caps", () => {
    const a = makeAgent("a", 0, 0, 0.3);
    const params: SteerParams = { goalX: 100, goalZ: 0, dt: 1 / 60, maxSpeed: 3, accel: 6, slowRadius: 1.5 };
    const out = steer(a, [a], params, { vx: 0, vz: 0 });
    // First tick from rest: speed can't exceed accel*dt.
    expect(Math.hypot(out.vx, out.vz)).toBeLessThanOrEqual((6 * (1 / 60)) * 1.0001);
    a.vx = out.vx;
    a.vz = out.vz;
    for (let i = 0; i < 600; i++) {
      steer(a, [a], params, a);
      expect(Math.hypot(a.vx, a.vz)).toBeLessThanOrEqual(3.0001);
    }
  });
});

describe("registry + steer/resolveOverlaps end to end", () => {
  beforeEach(() => {
    getCrowd("room").clear();
  });

  it("agents registered in the same crowd avoid each other via getAgents", () => {
    const a = registerAgent("room", makeAgent("r-a", -2, 0, 0.3));
    const b = registerAgent("room", makeAgent("r-b", 2, 0, 0.3));
    const goals = new Map([
      ["r-a", { x: 2, z: 0 }],
      ["r-b", { x: -2, z: 0 }],
    ]);
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 20; i++) {
      const list = [...getAgents("room")];
      const params = list.map((agent) => {
        const goal = goals.get(agent.id)!;
        return { goalX: goal.x, goalZ: goal.z, dt, ...BASE_PARAMS };
      });
      list.forEach((agent, idx) => steer(agent, list, params[idx]!, agent));
      list.forEach((agent) => {
        agent.x += agent.vx * dt;
        agent.z += agent.vz * dt;
      });
      resolveOverlaps(getAgents("room"));
      if (reachedGoal(a, goals.get("r-a")!) && reachedGoal(b, goals.get("r-b")!)) break;
    }
    expect(reachedGoal(a, goals.get("r-a")!)).toBe(true);
    expect(reachedGoal(b, goals.get("r-b")!)).toBe(true);
  });
});
