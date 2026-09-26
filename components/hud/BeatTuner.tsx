"use client";

import { useEffect } from "react";
import { useControls } from "leva";
import type { Director } from "@/lib/director/director";

const slider = (value: number) => ({ value, min: 0, max: 10000, step: 100 });

/** Lab only: leva sliders for each beat's minimum on-screen time. */
export function BeatTuner({ director }: { director: Director }) {
  const { beats } = director;
  const values = useControls("Director beats (ms)", {
    opinion: slider(beats.opinion),
    constraints: slider(beats.constraints),
    veto: slider(beats.veto),
    bundle: slider(beats.bundle),
    score: slider(beats.score),
  });

  useEffect(() => {
    director.tuneBeats(values);
  }, [director, values]);

  return null;
}
