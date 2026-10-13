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

function utf8Decode(b: Uint8Array): string {
  let s = "";
  let i = 0;
  while (i < b.length) {
    const x = b[i] ?? 0;
    let c: number;
    let n: number;
    if (x < 0x80) [c, n] = [x, 1];
    else if (x >= 0xf0) [c, n] = [x & 7, 4];
    else if (x >= 0xe0) [c, n] = [x & 15, 3];
    else if (x >= 0xc0) [c, n] = [x & 31, 2];
    else [c, n] = [0xfffd, 1];
    for (let k = 1; k < n; k++) c = (c << 6) | ((b[i + k] ?? 0) & 63);
    s += String.fromCodePoint(c);
    i += n;
  }
  return s;
}
