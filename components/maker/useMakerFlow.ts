"use client";

import { useMemo, useReducer, useRef } from "react";
import { useRoster } from "@/lib/people/roster";
import { flowReducer, initialMakerState, type FlowDeps, type MakerAction, type MakerState } from "./flow";

// Thin React wiring over the pure reducer: reads addPerson/updatePerson from the roster store at
// dispatch time (never at render time, so this stays SSR-safe) and hands the component a plain
// (state, dispatch) pair. flow.test.ts exercises flowReducer directly with mock deps instead.
//
// The reducer performs the roster write on "save" / "confirmRemove". React runs reducers twice per
// action in development (Strict Mode) to flush out impurity, which used to add every new person
// twice. Each action's roster side effect therefore runs once, keyed by the action object itself.

export function useMakerFlow(): [MakerState, (action: MakerAction) => void] {
  const applied = useRef(new WeakMap<MakerAction, string | null>());
  const [state, dispatch] = useReducer(
    (current: MakerState, action: MakerAction) => {
      const roster = useRoster.getState();
      const once = <T extends string | null>(run: () => T): T => {
        const seen = applied.current;
        if (seen.has(action)) return seen.get(action) as T;
        const result = run();
        seen.set(action, result);
        return result;
      };
      const deps: FlowDeps = {
        addPerson: (person) => once(() => roster.addPerson(person)),
        updatePerson: (id, patch) => {
          once(() => {
            roster.updatePerson(id, patch);
            return id;
          });
        },
        removePerson: (id) => {
          once(() => {
            roster.removePerson(id);
            return id;
          });
        },
      };
      return flowReducer(current, action, deps);
    },
    initialMakerState,
  );
  return useMemo(() => [state, dispatch] as const, [state]);
}
