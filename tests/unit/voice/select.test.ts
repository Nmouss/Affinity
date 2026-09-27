import { describe, expect, it } from "vitest";
import { chooseEngines, createEngines, detectCapabilities, type VoiceCapabilities } from "@/lib/voice/select";

const all: VoiceCapabilities = { deepgramConfigured: true, webmOpus: true, mediaDevices: true, webSpeechRecognition: true, speechSynthesis: true };

describe("chooseEngines", () => {
  it("uses Deepgram for both when configured and the browser records webm/opus", () => {
    expect(chooseEngines(all)).toEqual({ speaker: "deepgram", recognizer: "deepgram" });
  });

  it("keeps the Deepgram voice but listens with Web Speech on Safari (no webm/opus)", () => {
    expect(chooseEngines({ ...all, webmOpus: false })).toEqual({ speaker: "deepgram", recognizer: "browser" });
  });

  it("falls back to the browser engines when Deepgram is not configured", () => {
    expect(chooseEngines({ ...all, deepgramConfigured: false })).toEqual({ speaker: "browser", recognizer: "browser" });
  });

  it("is typed-only and silent when nothing is available", () => {
    expect(chooseEngines({ deepgramConfigured: false, webmOpus: false, mediaDevices: false, webSpeechRecognition: false, speechSynthesis: false })).toEqual({
      speaker: "none",
      recognizer: "none",
    });
  });

  it("needs a microphone API for Deepgram listening", () => {
    expect(chooseEngines({ ...all, mediaDevices: false, webSpeechRecognition: false }).recognizer).toBe("none");
  });
});

describe("detectCapabilities", () => {
  it("reports nothing without a window", () => {
    expect(detectCapabilities(undefined, true)).toEqual({ deepgramConfigured: true, webmOpus: false, mediaDevices: false, webSpeechRecognition: false, speechSynthesis: false });
  });

  it("reads the browser globals", () => {
    const win = {
      WebSocket: class {},
      MediaRecorder: { isTypeSupported: (mime: string) => mime === "audio/webm;codecs=opus" },
      navigator: { mediaDevices: { getUserMedia: () => Promise.resolve({}) } },
      webkitSpeechRecognition: class {},
      speechSynthesis: {},
    };
    expect(detectCapabilities(win, false)).toEqual({ deepgramConfigured: false, webmOpus: true, mediaDevices: true, webSpeechRecognition: true, speechSynthesis: true });
  });
});

describe("createEngines", () => {
  it("returns stubs for none/none", () => {
    const { recognizer, speaker } = createEngines({ speaker: "none", recognizer: "none" });
    expect(recognizer.supported).toBe(false);
    expect(speaker.supported).toBe(false);
  });

  it("builds Deepgram engines from injected deps", () => {
    const { recognizer, speaker } = createEngines(
      { speaker: "deepgram", recognizer: "deepgram" },
      {
        deepgramRecognizer: {
          getToken: async () => "jwt",
          getUserMedia: async () => ({ getTracks: () => [] }),
          WebSocketCtor: class {
            readyState = 0;
            onopen = null;
            onmessage = null;
            onclose = null;
            onerror = null;
            send() {}
            close() {}
          },
          MediaRecorderCtor: class {
            ondataavailable = null;
            start() {}
            stop() {}
          },
          isTypeSupported: () => true,
        },
        deepgramSpeaker: { fetchAudio: async () => null, createAudio: () => ({ src: "", currentTime: 0, play: () => undefined, pause: () => undefined, onended: null, onerror: null }), createObjectURL: () => "blob:x" },
      },
    );
    expect(recognizer.supported).toBe(true);
    expect(speaker.supported).toBe(true);
  });
});
