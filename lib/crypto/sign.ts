import type { Bundle, CartMandate, Mission } from "@/types/domain";
import { unsignedPayload } from "./mandate";

// Browser-side half of the AP2-style cart mandate: a per-device ECDSA P-256 key signs exactly the
// payload lib/crypto/mandate.ts verifies. The private key is non-extractable and lives in IndexedDB.

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const DB_NAME = "affinity-keys";
const STORE = "keys";
const KEY_ID = "device-mandate-key";

let cached: Promise<CryptoKeyPair> | null = null;

function generateKeyPair(): Promise<CryptoKeyPair> {
  // WebCrypto keeps public keys extractable regardless of this flag, so the JWK can still be sent.
  return crypto.subtle.generateKey(ALGORITHM, false, ["sign", "verify"]);
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  return request(open);
}

async function loadOrCreatePersisted(): Promise<CryptoKeyPair> {
  const db = await openDb();
  try {
    const existing = await request(db.transaction(STORE, "readonly").objectStore(STORE).get(KEY_ID));
    if (existing && (existing as CryptoKeyPair).privateKey) return existing as CryptoKeyPair;
    const pair = await generateKeyPair();
    await request(db.transaction(STORE, "readwrite").objectStore(STORE).put(pair, KEY_ID));
    return pair;
  } finally {
    db.close();
  }
}

/** The device key, generated once. Falls back to an in-memory key when IndexedDB is unavailable. */
export function getDeviceKeyPair(): Promise<CryptoKeyPair> {
  if (!cached) {
    cached =
      typeof indexedDB === "undefined"
        ? generateKeyPair()
        : loadOrCreatePersisted().catch(() => generateKeyPair());
  }
  return cached;
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface SignOptions {
  /** Inject a key pair (tests, or a key from elsewhere) instead of the persisted device key. */
  keyPair?: CryptoKeyPair;
  approvedAt?: Date;
}

/** Signs {mission, bundle, approvedAt} and returns the CartMandate /api/mandate expects. */
export async function signMandate(mission: Mission, bundle: Bundle, options: SignOptions = {}): Promise<CartMandate> {
  const keyPair = options.keyPair ?? (await getDeviceKeyPair());
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const unsigned: CartMandate = {
    mission,
    bundle,
    approvedAt: (options.approvedAt ?? new Date()).toISOString(),
    publicKey,
    signature: "",
  };
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    unsignedPayload(unsigned),
  );
  return { ...unsigned, signature: toBase64(signature) };
}
