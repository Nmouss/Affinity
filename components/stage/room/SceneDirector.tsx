"use client";

import { useEffect } from "react";
import { resolveVetoSubject } from "@/components/stage/tree/catalog";
import { TIMING } from "@/components/stage/tree/timing";
import { onGesture } from "@/lib/stage/bus";
import type { CameraMode } from "@/lib/stage/slices/scene";
import { useStage, type StageStore } from "@/lib/stage/store";
import type { StagePhase } from "@/types/stage";

const INSPECT_PHASES = new Set<StagePhase>(["bundle", "scoring", "awaitMandate", "signing", "receipt"]);

export function cameraModeFor(phase: StagePhase): CameraMode {
  return INSPECT_PHASES.has(phase) ? "orbit" : "fixed";
}

/** Derives the room's scene state (camera mode, fire flare, conflict beat) from the council slice. */
function sync(state: StageStore, previous: StageStore | null) {
  const { scene, setScene } = state;
  const now = performance.now();

  if (state.phase !== previous?.phase) {
    if (state.phase === "convening") state.flareFire();
    const cameraMode = cameraModeFor(state.phase);
    if (cameraMode !== scene.cameraMode) {
      setScene({ cameraMode, orbit: { azimuth: 0, polar: 0 } });
    }
  }

  const beat = useStage.getState().scene.conflictBeat;
  const vetoing = state.veto !== null || (state.phase === "conflict" && state.conflict !== null);
  if (!vetoing) {
    if (beat) setScene({ conflictBeat: null });
    return;
  }

  const subject = resolveVetoSubject(state.conflict, state.veto ?? { wish: "", resolution: "" });
  if (!beat) {
    setScene({ conflictBeat: { startedAt: now, resolveAt: null, ...subject } });
    return;
  }
  if (beat.resolveAt === null) {
    const resolveAt = state.bundle ? Math.max(now, beat.startedAt + TIMING.vetoMinDwell) : null;
    // Director attribution can arrive after the veto; adopt it until the beat resolves.
    if (resolveAt !== null || subject.itemId !== beat.itemId || subject.resolvedItemId !== beat.resolvedItemId) {
      setScene({ conflictBeat: { ...beat, ...subject, resolveAt } });
    }
  }
}

export function SceneDirector() {
  useEffect(() => {
    sync(useStage.getState(), null);
    return useStage.subscribe((state, previous) => sync(state, previous));
  }, []);

  useEffect(
    () =>
      onGesture((event) => {
        if (event.type === "reset") useStage.getState().resetScene();
      }),
    [],
  );

  return null;
}
