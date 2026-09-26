// Tiny WebAudio blips for the People Maker: hover, select, and save. No audio files, no music, and
// no AudioContext is created until the first call after a user gesture (autoplay policies, and so
// this module is a no-op import on the server).

type BlipKind = "hover" | "select" | "save";

const BLIPS: Record<BlipKind, { freq: number; duration: number; type: OscillatorType }> = {
  hover: { freq: 660, duration: 0.05, type: "sine" },
  select: { freq: 880, duration: 0.08, type: "triangle" },
  save: { freq: 1046.5, duration: 0.16, type: "triangle" },
};

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function playBlip(kind: BlipKind): void {
  const audio = context();
  if (!audio) return;
  const { freq, duration, type } = BLIPS[kind];
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}
