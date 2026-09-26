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

/**
 * The plaza whistle: two quick rising sine chirps with a light vibrato, like a referee's whistle
 * calling everyone into line. Synthesized (no audio file) so it's just as cheap as the blips.
 */
export function playWhistle(): void {
  const audio = context();
  if (!audio) return;
  const now = audio.currentTime;
  const CHIRPS = [
    { start: now, from: 1800, to: 2600, duration: 0.14 },
    { start: now + 0.17, from: 2000, to: 2900, duration: 0.18 },
  ];
  for (const { start, from, to, duration } of CHIRPS) {
    const oscillator = audio.createOscillator();
    const vibrato = audio.createOscillator();
    const vibratoGain = audio.createGain();
    const gain = audio.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.linearRampToValueAtTime(to, start + duration);

    // A fast, shallow vibrato on the chirp's frequency gives it a "trilled" whistle timbre
    // instead of a flat siren tone.
    vibrato.type = "sine";
    vibrato.frequency.setValueAtTime(28, start);
    vibratoGain.gain.setValueAtTime(35, start);
    vibrato.connect(vibratoGain).connect(oscillator.frequency);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    vibrato.start(start);
    vibrato.stop(start + duration + 0.02);
  }
}
