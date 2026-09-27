"use client";

import { useEffect, useState } from "react";
import { isSoundEnabled, onSoundChange, setSoundEnabled } from "@/components/maker/sound";
import { PlazaButton, type PlazaButtonProps } from "./PlazaButton";

/**
 * Mute switch for the app's blips and whistle. Reads the saved preference after mount (so server and
 * client render the same button), and keeps every mounted toggle in step through the sound module.
 */
export function SoundToggle(props: Omit<PlazaButtonProps, "onClick" | "children" | "silent">) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(isSoundEnabled());
    return onSoundChange(setEnabled);
  }, []);

  return (
    <PlazaButton
      variant="ghost"
      silent
      aria-pressed={enabled}
      aria-label={enabled ? "Sound on. Turn sound off" : "Sound off. Turn sound on"}
      title={enabled ? "Sound on" : "Sound off"}
      onClick={() => setSoundEnabled(!enabled)}
      {...props}
    >
      <span aria-hidden>{enabled ? "♪" : "♪̸"}</span>
      <span>{enabled ? "Sound" : "Muted"}</span>
    </PlazaButton>
  );
}
