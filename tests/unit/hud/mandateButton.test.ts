import { describe, expect, it } from "vitest";
import { mandateInteractive, mandateLabel } from "@/components/controls/MandateButton";

describe("mandateLabel", () => {
  it("shows the caller's label once the handshake is armed", () => {
    expect(mandateLabel("Hold to approve", true)).toBe("Hold to approve");
  });

  it("shows a settling placeholder while the director hasn't armed the gesture yet", () => {
    expect(mandateLabel("Hold to approve", false)).toBe("Settling…");
  });
});

describe("mandateInteractive", () => {
  it("is interactive only once armed and not otherwise disabled", () => {
    expect(mandateInteractive(false, true)).toBe(true);
  });

  it("is not interactive before the handshake is armed, even if the caller didn't disable it", () => {
    expect(mandateInteractive(false, false)).toBe(false);
  });

  it("stays non-interactive when the caller disables it, even once armed", () => {
    expect(mandateInteractive(true, true)).toBe(false);
  });

  it("is non-interactive when both disabled and unarmed", () => {
    expect(mandateInteractive(true, false)).toBe(false);
  });
});
