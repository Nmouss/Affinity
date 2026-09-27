import { describe, expect, it } from "vitest";
import { cameraModeFor } from "@/components/stage/room/SceneDirector";
import { ORBIT_LIMITS, applyOrbitDelta, clampOrbit } from "@/lib/stage/slices/scene";
import type { StagePhase } from "@/types/stage";

describe("council camera", () => {
  it("keeps the wide fixed view throughout the conversation and mandate", () => {
    const phases: StagePhase[] = [
      "lobby",
      "convening",
      "opinions",
      "merge",
      "conflict",
      "bundle",
      "scoring",
      "awaitMandate",
      "signing",
      "receipt",
    ];
    expect(phases.map(cameraModeFor)).toEqual(phases.map(() => "fixed"));
  });
});

describe("orbit clamping", () => {
  it("accumulates gesture deltas", () => {
    const orbit = applyOrbitDelta({ azimuth: 0, polar: 0 }, 0.1, 0.05);
    expect(orbit.azimuth).toBeCloseTo(0.08);
    expect(orbit.polar).toBeCloseTo(0.0225);
  });

  it("clamps azimuth to about ±70 degrees", () => {
    expect(applyOrbitDelta({ azimuth: 0, polar: 0 }, 10, 0).azimuth).toBeCloseTo((70 * Math.PI) / 180);
    expect(applyOrbitDelta({ azimuth: 0, polar: 0 }, -10, 0).azimuth).toBeCloseTo((-70 * Math.PI) / 180);
  });

  it("keeps polar in its comfortable band", () => {
    expect(clampOrbit({ azimuth: 0, polar: 5 }).polar).toBe(ORBIT_LIMITS.polarMax);
    expect(clampOrbit({ azimuth: 0, polar: -5 }).polar).toBe(ORBIT_LIMITS.polarMin);
  });
});
