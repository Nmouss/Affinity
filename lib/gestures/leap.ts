import type { HandFrame } from "./types";

export function connectLeap(onFrame: (frame: HandFrame) => void): () => void {
  const socket = new WebSocket(process.env.NEXT_PUBLIC_LEAP_WS_URL ?? "ws://localhost:6437");
  socket.addEventListener("message", (event) => {
    const raw = JSON.parse(String(event.data));
    const hand = raw.hands?.[0];
    if (!hand) return;
    onFrame({
      timestamp: raw.timestamp,
      palm: hand.palmPosition,
      velocity: hand.palmVelocity,
      pinchStrength: hand.pinchStrength,
      grabStrength: hand.grabStrength,
      rollRadians: hand.roll ?? 0,
    });
  });
  return () => socket.close();
}
