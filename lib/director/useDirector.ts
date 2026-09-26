"use client";

import { useEffect, useState } from "react";
import { useStage } from "@/lib/stage/store";
import { createRecognizer } from "@/lib/voice/recognizer";
import { createSpeaker } from "@/lib/voice/speaker";
import { createDirector, type Director } from "./director";

export interface DirectorFlags {
  /** `?demo`: play the local stage transcript instead of calling /api/council. */
  preferReplay: boolean;
  /** `?cut=90`: the 90-second cut preset. */
  cut90: boolean;
  /** Running on /lab, where leva tuning is available. */
  lab: boolean;
}

export function readDirectorFlags(location: Pick<Location, "search" | "pathname">): DirectorFlags {
  const params = new URLSearchParams(location.search);
  return {
    preferReplay: params.has("demo"),
    cut90: params.get("cut") === "90",
    lab: location.pathname.startsWith("/lab"),
  };
}

/** Mounts the director for the page's lifetime. URL flags are read after mount to keep SSR stable. */
export function useDirector(): { director: Director | null; flags: DirectorFlags | null } {
  const [mounted, setMounted] = useState<{ director: Director; flags: DirectorFlags } | null>(null);

  useEffect(() => {
    const flags = readDirectorFlags(window.location);
    const director = createDirector({
      store: useStage,
      preferReplay: flags.preferReplay,
      cut90: flags.cut90,
      voice: { recognizer: createRecognizer(), speaker: createSpeaker() },
    });
    setMounted({ director, flags });

    // speechSynthesis.speak() throws "not-allowed" until the page has had one user activation, and
    // Leap gestures don't count as one — so the very first click or key press anywhere (e.g. pressing
    // 1 to seat a sprite) unlocks it. Capture phase so it fires before anything stops propagation.
    const unlock = () => {
      director.unlockVoice();
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);

    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      director.dispose();
    };
  }, []);

  return { director: mounted?.director ?? null, flags: mounted?.flags ?? null };
}
