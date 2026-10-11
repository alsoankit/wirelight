export type Mac = string;

export const BROADCAST: Mac = "ff:ff:ff:ff:ff:ff";

const MAC_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/;

/** Normalizes a MAC as Linux prints it (lowercase, colon-separated), or returns null if it isn't one. */
export function parseMac(text: string): Mac | null {
  const m = text.trim().toLowerCase();
  return MAC_RE.test(m) ? m : null;
}

export function macToBytes(mac: Mac): Uint8Array {
  return Uint8Array.from(mac.split(":").map((h) => Number.parseInt(h, 16)));
}

export function bytesToMac(b: Uint8Array, offset = 0): Mac {
  return Array.from(b.subarray(offset, offset + 6), (x) => x.toString(16).padStart(2, "0")).join(":");
}
