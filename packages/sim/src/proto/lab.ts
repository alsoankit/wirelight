/**
 * The Floors 1–4 lab protocol (SIM-06): payload = UTF-8 text. A message goes out with EtherType
 * 0x88B5 and an answer with 0x88B6 (IEEE 802's two "local experimental" types), so a machine can
 * see from the bytes that a frame is an answer, and never answers an answer (no endless echo).
 * Ethernet padding is zeros and the text never contains NUL, so trailing zeros are stripped on decode.
 */
export const LAB_MAX = 1400;

export function encodeLab(text: string): Uint8Array {
  const b = utf8Encode(text);
  return b.length > LAB_MAX ? b.subarray(0, LAB_MAX) : b;
}

export function decodeLab(payload: Uint8Array): string {
  let end = payload.length;
  while (end > 0 && payload[end - 1] === 0) end--;
  return utf8Decode(payload.subarray(0, end));
}

// The simulator uses no platform APIs (SIM-01), so UTF-8 is done by hand.
function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/**
 * Decodes UTF-8, replacing anything malformed with U+FFFD (as TextDecoder does): payloads that aren't
 * text at all (a DHCP message read as a lab message) must never throw.
 */
function utf8Decode(b: Uint8Array): string {
  let s = "";
  let i = 0;
  while (i < b.length) {
    const x = b[i] ?? 0;
    const n = x < 0x80 ? 1 : x >= 0xc2 && x < 0xe0 ? 2 : x >= 0xe0 && x < 0xf0 ? 3 : x >= 0xf0 && x < 0xf5 ? 4 : 0;
    if (n === 0) {
      s += "\ufffd";
      i += 1;
      continue;
    }
    let c = n === 1 ? x : x & (0xff >> (n + 1));
    let ok = i + n <= b.length;
    for (let k = 1; ok && k < n; k++) {
      const y = b[i + k] ?? 0;
      if ((y & 0xc0) !== 0x80) ok = false;
      else c = (c << 6) | (y & 63);
    }
    const min = [0, 0, 0x80, 0x800, 0x10000][n] ?? 0;
    if (!ok || c < min || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) {
      s += "\ufffd";
      i += 1;
      continue;
    }
    s += String.fromCodePoint(c);
    i += n;
  }
  return s;
}
