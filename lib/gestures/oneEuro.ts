// One-Euro filter (Casiez et al. 2012): a low-pass filter whose cutoff rises with speed, so a still
// hand is steady and a fast one has little lag. Units of beta match the signal's units per second.

export interface OneEuroOptions {
  /** Hz. Lower is steadier when the hand is still. */
  minCutoff: number;
  /** How quickly the cutoff rises with speed. */
  beta: number;
  /** Hz, for the speed estimate. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroOptions = { minCutoff: 1.0, beta: 0.02, dCutoff: 1.0 };

function smoothingFactor(cutoff: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dtSeconds);
}

export interface OneEuroFilter {
  /** Filters `value` sampled at `timeMs`. A gap of over a second, or time going backwards, restarts it. */
  filter(value: number, timeMs: number): number;
  reset(): void;
  options: OneEuroOptions;
}

export function createOneEuroFilter(options: Partial<OneEuroOptions> = {}): OneEuroFilter {
  const opts: OneEuroOptions = { ...DEFAULT_ONE_EURO, ...options };
  let previous: number | null = null;
  let previousSpeed = 0;
  let previousTime = 0;

  return {
    options: opts,
    reset() {
      previous = null;
      previousSpeed = 0;
    },
    filter(value, timeMs) {
      const dt = (timeMs - previousTime) / 1000;
      if (previous === null || dt <= 0 || dt > 1) {
        previous = value;
        previousSpeed = 0;
        previousTime = timeMs;
        return value;
      }
      const speed = (value - previous) / dt;
      const smoothedSpeed = previousSpeed + smoothingFactor(opts.dCutoff, dt) * (speed - previousSpeed);
      const cutoff = opts.minCutoff + opts.beta * Math.abs(smoothedSpeed);
      const smoothed = previous + smoothingFactor(cutoff, dt) * (value - previous);
      previous = smoothed;
      previousSpeed = smoothedSpeed;
      previousTime = timeMs;
      return smoothed;
    },
  };
}
