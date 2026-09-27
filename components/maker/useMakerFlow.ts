"use client";

import { useMemo, useReducer } from "react";
import { useRoster } from "@/lib/people/roster";
import { flowReducer, initialMakerState, type FlowDeps, type MakerAction, type MakerState } from "./flow";

// Thin React wiring over the pure reducer: reads addPerson/updatePerson from the roster store at
// dispatch time (never at render time, so this stays SSR-safe) and hands the component a plain
// (state, dispatch) pair. flow.test.ts exercises flowReducer directly with mock deps instead.

export function useMakerFlow(): [MakerState, (action: MakerAction) => void] {
  const [state, dispatch] = useReducer(
    (current: MakerState, action: MakerAction) => {
      const deps: FlowDeps = {
        addPerson: useRoster.getState().addPerson,
        updatePerson: useRoster.getState().updatePerson,
        removePerson: useRoster.getState().removePerson,
      };
      return flowReducer(current, action, deps);
    },
    initialMakerState,
  );
  return useMemo(() => [state, dispatch] as const, [state]);
}
