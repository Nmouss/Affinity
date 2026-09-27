import type { SignedMandate } from "@/types/domain";

export function unsignedPayload(mandate: SignedMandate) {
  return new TextEncoder().encode(JSON.stringify({
    mission: mandate.mission,
    ...( "bundle" in mandate ? { bundle: mandate.bundle } : { plan: mandate.plan }),
    approvedAt: mandate.approvedAt,
  }));
}

export async function verifyMandate(mandate: SignedMandate): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      mandate.publicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const signature = Uint8Array.from(atob(mandate.signature), (character) => character.charCodeAt(0));
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, unsignedPayload(mandate));
  } catch {
    return false;
  }
}
