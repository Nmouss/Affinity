// Pop-in growth animation for the centerpiece pedestals and their items.

export const CENTERPIECE_TIMING = { grow: 1000 } as const;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function progress(now: number, start: number, duration: number): number {
  return duration <= 0 ? 1 : clamp01((now - start) / duration);
}

export function easeOutBack(t: number, overshoot = 1.70158): number {
  const c = overshoot;
  const x = t - 1;
  return 1 + (c + 1) * x ** 3 + c * x ** 2;
}
