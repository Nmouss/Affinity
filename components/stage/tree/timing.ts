// Beat timings in ms. Everything keys off performance.now() stamps in the scene slice.

export const TIMING = {
  /** Tree scale-in after a bundle lands. */
  treeGrow: 1000,
  /** First ornament launch after the tree starts growing. */
  flightDelay: 650,
  flight: 1100,
  flightStagger: 80,

  /** Decoy ghosts: rise, get crossed out, then fade. */
  ghostRise: 1200,
  ghostStagger: 180,
  ghostCross: 1450,
  ghostFadeStart: 2000,
  ghostFade: 2000,

  /** Conflict beat, relative to its start. */
  vetoInflate: 900,
  vetoStamp: 1150,
  /** The T-rex holds at least this long before a bundle may resolve it, so the beat always lands. */
  vetoMinDwell: 3000,

  /** Resolution, relative to resolveAt. */
  vetoShrink: 850,
  boxPop: 450,
  boxRelease: 1350,
  boxExit: 3400,
} as const;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Progress of a window that starts at `start` ms and lasts `duration` ms. */
export function progress(now: number, start: number, duration: number): number {
  return clamp01((now - start) / duration);
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

export function easeOutBack(t: number, overshoot = 1.70158): number {
  const c3 = overshoot + 1;
  return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

export function easeInBack(t: number, overshoot = 1.70158): number {
  return (overshoot + 1) * t ** 3 - overshoot * t ** 2;
}

export function easeOutElastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}
