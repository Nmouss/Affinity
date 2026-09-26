import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// jsdom doesn't implement matchMedia. App's reduce-motion toggle and LeapCheck's recorded-session
// playback both read `window.matchMedia?.("(prefers-reduced-motion: reduce)").matches`; without a
// stub that whole expression short-circuits to undefined, which is fine for "not reduced", but
// tests still need a mockable function to assert the "reduced" branch (see flow.test.tsx #10).
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom has no ResizeObserver; @react-three/fiber's <Canvas> reads it on mount. The mission table
// never actually mounts in jsdom (webglAvailable() is false, so SceneSlot renders the 2D fallback),
// but the module is still imported, so keep a harmless stub available just in case.
if (!("ResizeObserver" in window)) {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", { writable: true, configurable: true, value: MockResizeObserver });
}

// jsdom's canvas has no WebGL and logs a noisy "Not implemented" error on getContext(); keep it a
// silent no-op so scene code that probes for a rendering context doesn't spam the test output.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
