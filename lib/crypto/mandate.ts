import type { CartMandate } from "@/types/domain";

export function unsignedPayload(mandate: CartMandate) {
  return new TextEncoder().encode(JSON.stringify({
    mission: mandate.mission,
    bundle: mandate.bundle,
    approvedAt: mandate.approvedAt,
  }));
}

export async function verifyMandate(mandate: CartMandate): Promise<boolean> {
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
