export function GestureStatus({ connected, gesture }: { connected: boolean; gesture?: string }) {
  return <output>{connected ? gesture ?? "Hand tracking ready" : "Keyboard controls active"}</output>;
}
