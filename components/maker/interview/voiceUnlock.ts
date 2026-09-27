// Browsers only let a page play sound after a user gesture, and Safari wants the very <audio>
// element that will play later to have been started inside that gesture. The Save click (and the
// plaza's Interview rail click) call unlockVoice() first; the interviewer's speaker then reuses
// this one element for every line.

/** A 44-byte-header, one-sample, silent 8 kHz mono WAV. */
export const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==";

let shared: HTMLAudioElement | null = null;

/** The one audio element the interviewer speaks through; created on first use, client only. */
export function sharedVoiceAudio(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  if (!shared) {
    shared = document.createElement("audio");
    shared.preload = "auto";
    shared.setAttribute("aria-hidden", "true");
  }
  return shared;
}

/** Call from a click or key handler. Plays a moment of silence so later speak() calls are allowed. */
export function unlockVoice(): void {
  const audio = sharedVoiceAudio();
  if (!audio) return;
  try {
    audio.src = SILENT_WAV_DATA_URI;
    void audio.play().catch(() => undefined);
  } catch {
    // No audio here (very old browser); the interview shows its questions as text either way.
  }
}
