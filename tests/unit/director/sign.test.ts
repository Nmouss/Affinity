import { describe, expect, it } from "vitest";
import { verifyMandate } from "@/lib/crypto/mandate";
import { getDeviceKeyPair, signMandate } from "@/lib/crypto/sign";
import { STAGE_TRANSCRIPT } from "@/lib/demo/stageTranscript";
import { buildMission } from "@/lib/director/mission";
import type { Bundle } from "@/types/domain";

const bundle = STAGE_TRANSCRIPT.find((event) => event.type === "bundle")!.payload as Bundle;
const mission = buildMission("Family Christmas tree, under $200", ["wife", "daughter", "son"]);

async function injectedKey(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
}

describe("signMandate", () => {
  it("produces a mandate verifyMandate accepts", async () => {
    const mandate = await signMandate(mission, bundle, { keyPair: await injectedKey(), approvedAt: new Date(0) });
    expect(mandate.approvedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(mandate.publicKey).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(mandate.publicKey).not.toHaveProperty("d");
    expect(mandate.signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(await verifyMandate(mandate)).toBe(true);
  });

  it("survives the JSON round trip to /api/mandate", async () => {
    const mandate = await signMandate(mission, bundle, { keyPair: await injectedKey() });
    expect(await verifyMandate(JSON.parse(JSON.stringify(mandate)))).toBe(true);
  });

  it("fails verification when the bundle is tampered with", async () => {
    const mandate = await signMandate(mission, bundle, { keyPair: await injectedKey() });
    const tampered = { ...mandate, bundle: { ...mandate.bundle, total: 1 } };
    expect(await verifyMandate(tampered)).toBe(false);
  });

  it("falls back to an in-memory device key without IndexedDB and reuses it", async () => {
    const first = await getDeviceKeyPair();
    expect(await getDeviceKeyPair()).toBe(first);
    expect(first.privateKey.extractable).toBe(false);
    expect(await verifyMandate(await signMandate(mission, bundle))).toBe(true);
  });
});
