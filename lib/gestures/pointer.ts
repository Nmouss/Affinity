import { createOneEuroFilter, type OneEuroOptions } from "./oneEuro";
import type { Vec3 } from "./types";

/** The box above the device (mm) that maps onto the whole screen. Tunable in leva on /lab. */
export interface CalibrationBox {
  xMin: number;
  xMax: number;
  /** Palm height at the bottom of the screen. */
  yMin: number;
  /** Palm height at the top of the screen. */
  yMax: number;
}

export const DEFAULT_CALIBRATION: CalibrationBox = { xMin: -150, xMax: 150, yMin: 120, yMax: 380 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function toNdc(value: number, min: number, max: number): number {
  const span = max - min;
  if (span === 0) return 0;
  return clamp(((value - min) / span) * 2 - 1, -1, 1);
}

/** Palm x → NDC x and palm height → NDC y (y up), clamped to [-1, 1]. */
export function palmToNdc(palm: Vec3, box: CalibrationBox = DEFAULT_CALIBRATION): [number, number] {
  return [toNdc(palm[0], box.xMin, box.xMax), toNdc(palm[1], box.yMin, box.yMax)];
}

/** Inverse of palmToNdc for the palm's x and y (used to aim synthetic sessions). */
export function ndcToPalm(ndc: [number, number], box: CalibrationBox = DEFAULT_CALIBRATION): [number, number] {
  return [
    box.xMin + ((ndc[0] + 1) / 2) * (box.xMax - box.xMin),
    box.yMin + ((ndc[1] + 1) / 2) * (box.yMax - box.yMin),
  ];
}

export interface PointerFilter {
  /** Smooths the palm (in mm, where beta ≈ 0.02 is tuned) and maps it to NDC. */
  update(palm: Vec3, timeMs: number, box?: CalibrationBox): [number, number];
  /** Retunes both axes in place (leva on /lab). */
  configure(options: Partial<OneEuroOptions>): void;
  reset(): void;
}

export function createPointerFilter(options: Partial<OneEuroOptions> = {}): PointerFilter {
  const x = createOneEuroFilter(options);
  const y = createOneEuroFilter(options);
  return {
    update(palm, timeMs, box = DEFAULT_CALIBRATION) {
      return palmToNdc([x.filter(palm[0], timeMs), y.filter(palm[1], timeMs), palm[2]], box);
    },
    configure(options) {
      Object.assign(x.options, options);
      Object.assign(y.options, options);
    },
    reset() {
      x.reset();
      y.reset();
    },
  };
}
