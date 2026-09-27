"use client";

import { useEffect } from "react";
import { onGesture } from "@/lib/stage/bus";
import type { CameraMode } from "@/lib/stage/slices/scene";
import { useStage, type StageStore } from "@/lib/stage/store";
import type { StagePhase } from "@/types/stage";

export function cameraModeFor(_phase: StagePhase): CameraMode {
  // Keep the wide council composition for the whole run. Product inspection still happens in the
  // cart/3D centerpiece, but it must not pull the camera away from the agents while they talk.
  return "fixed";
}

/** Derives the room's scene state (camera mode, fire flare) from the council slice. */
function sync(state: StageStore, previous: StageStore | null) {
  const { scene, setScene } = state;

  if (state.phase !== previous?.phase) {
    if (state.phase === "convening") state.flareFire();
    const cameraMode = cameraModeFor(state.phase);
    if (cameraMode !== scene.cameraMode) {
      setScene({ cameraMode, orbit: { azimuth: 0, polar: 0 } });
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
