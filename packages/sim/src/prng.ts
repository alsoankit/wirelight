/** sfc32: small, fast, and its whole state is four uint32s, so it snapshots as JSON (SIM-02, SIM-39). */
export type PrngState = [number, number, number, number];

export function seedPrng(seed: number): PrngState {
  const s: PrngState = [0x9e3779b9, 0x243f6a88, 0xb7e15162, seed >>> 0];
  for (let i = 0; i < 12; i++) nextFloat(s);
  return s;
}

/** Advances `s` in place; returns a float in [0, 1). */
export function nextFloat(s: PrngState): number {
  let [a, b, c, d] = s;
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  s[0] = a;
  s[1] = b;
  s[2] = c;
  s[3] = d;
  return t / 4294967296;
}
