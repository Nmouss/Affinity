import { orderedRoster } from "@/lib/people/roster";
import type { GestureEvent, TargetId } from "@/types/stage";

// Keyboard fallbacks for every gesture. mapKey is pure so it can be tested without a DOM (it reads
// the roster at call time rather than closing over a fixed id map); attachKeyboard wires it to
// window events.

/** Digit1..6 (and the numpad's) seat the first six chips in roster order: family first, then friends. */
const DIGIT_SEAT_INDEX: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  Numpad5: 4,
  Numpad6: 5,
};

/** Orbit per arrow press (or key repeat), in NDC like the open-palm deltas. */
export const ORBIT_STEP = 0.06;

const ORBIT_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-ORBIT_STEP, 0],
  ArrowRight: [ORBIT_STEP, 0],
  ArrowUp: [0, ORBIT_STEP],
  ArrowDown: [0, -ORBIT_STEP],
};

export type KeyAction =
  | { kind: "emit"; event: GestureEvent }
  | { kind: "cycleHover"; step: 1 | -1 }
  | { kind: "tapHover" }
  | { kind: "swipeHover" }
  | { kind: "handshake"; held: boolean };

export interface KeyLike {
  code: string;
  repeat?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: unknown;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True when keys belong to a form field (the mission form) rather than the stage. */
export function isTypingTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  return (
    (typeof element.tagName === "string" && TYPING_TAGS.has(element.tagName.toUpperCase())) ||
    element.isContentEditable === true
  );
}

/** Keys whose browser default (focus moves, page scroll, button press) must not run on the stage. */
export function shouldPreventDefault(code: string): boolean {
  return code === "Tab" || code === "Space" || code in ORBIT_KEYS;
}

export function mapKey(event: KeyLike, phase: "down" | "up"): KeyAction | null {
  // Releasing Space always ends the hold, even if focus moved into a field meanwhile.
  if (phase === "up") return event.code === "Space" ? { kind: "handshake", held: false } : null;
  if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return null;

  const orbit = ORBIT_KEYS[event.code];
  if (orbit) return { kind: "emit", event: { type: "orbit", dx: orbit[0], dy: orbit[1] } };
  if (event.code === "Tab") return { kind: "cycleHover", step: event.shiftKey ? -1 : 1 };
  if (event.repeat) return null;

  const seatIndex = DIGIT_SEAT_INDEX[event.code];
  if (seatIndex !== undefined) {
    const spriteId = orderedRoster()[seatIndex]?.id;
    if (spriteId) return { kind: "emit", event: { type: "seat", spriteId } };
  }
  switch (event.code) {
    case "Space":
      return { kind: "handshake", held: true };
    case "KeyP":
      return { kind: "tapHover" };
    case "KeyX":
      return { kind: "swipeHover" };
    case "Enter":
    case "NumpadEnter":
      return { kind: "emit", event: { type: "convene" } };
    case "KeyR":
      return { kind: "emit", event: { type: "reset" } };
    case "KeyD":
      return { kind: "emit", event: { type: "toggleReasoning" } };
    default:
      return null;
  }
}

/** The Tab order: sprites in family order, then any registered items. */
export function hoverCycle(targets: Iterable<TargetId>, spriteOrder: string[]): TargetId[] {
  const ids = [...targets];
  const rank = (id: TargetId) => {
    const index = spriteOrder.indexOf(id.slice("sprite:".length));
    return index === -1 ? spriteOrder.length : index;
  };
  const sprites = ids.filter((id) => id.startsWith("sprite:")).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const items = ids.filter((id) => id.startsWith("item:")).sort();
  return [...sprites, ...items];
}

export function nextInCycle(cycle: TargetId[], current: TargetId | null, step: 1 | -1): TargetId | null {
  if (cycle.length === 0) return null;
  const index = current ? cycle.indexOf(current) : -1;
  if (index === -1) return step === 1 ? cycle[0] : cycle[cycle.length - 1];
  return cycle[(index + step + cycle.length) % cycle.length];
}

export interface KeyboardHandlers {
  onAction(action: KeyAction): void;
}

export function attachKeyboard({ onAction }: KeyboardHandlers, target: Window = window): () => void {
  const handle = (phase: "down" | "up") => (event: KeyboardEvent) => {
    const action = mapKey(event, phase);
    if (!action) return;
    if (phase === "down" && shouldPreventDefault(event.code)) event.preventDefault();
    onAction(action);
  };
  const down = handle("down");
  const up = handle("up");
  // Losing focus mid-hold would otherwise leave Space stuck down.
  const blur = () => onAction({ kind: "handshake", held: false });
  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  target.addEventListener("blur", blur);
  return () => {
    target.removeEventListener("keydown", down);
    target.removeEventListener("keyup", up);
    target.removeEventListener("blur", blur);
  };
}
