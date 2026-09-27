import { describe, expect, it } from "vitest";
import { HANDSHAKE_PROGRESS_EPSILON, handshakeProgressChanged } from "@/components/hands/makerHandshake";

describe("handshakeProgressChanged", () => {
  it("is false when progress hasn't moved", () => {
    expect(handshakeProgressChanged(0, 0)).toBe(false);
    expect(handshakeProgressChanged(0.4, 0.4)).toBe(false);
  });

  it("is false for a change at or under the epsilon", () => {
    expect(handshakeProgressChanged(0, HANDSHAKE_PROGRESS_EPSILON)).toBe(false);
    expect(handshakeProgressChanged(0.5, 0.5 + HANDSHAKE_PROGRESS_EPSILON / 2)).toBe(false);
  });

  it("is true once the change clears the epsilon", () => {
    expect(handshakeProgressChanged(0, HANDSHAKE_PROGRESS_EPSILON + 0.001)).toBe(true);
    expect(handshakeProgressChanged(1, 0)).toBe(true);
  });

  it("is symmetric (rising or draining)", () => {
    expect(handshakeProgressChanged(0.2, 0.3)).toBe(true);
    expect(handshakeProgressChanged(0.3, 0.2)).toBe(true);
  });

  it("accepts a custom epsilon", () => {
    expect(handshakeProgressChanged(0, 0.1, 0.2)).toBe(false);
    expect(handshakeProgressChanged(0, 0.3, 0.2)).toBe(true);
  });
});
