import { create } from "zustand";

// Whether the welcome greeting is showing over the Plaza. The gate opens it once per browser
// session; the Plaza's "Welcome" rail button and the council's exit can open it again on demand.

interface WelcomeState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useWelcome = create<WelcomeState>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

/** Reopen the greeting from anywhere (plain function for non-React callers). */
export function showWelcome(): void {
  useWelcome.getState().show();
}
