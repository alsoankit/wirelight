/**
 * When a Linux kernel timer really fires. The timer wheel (kernel/time/timer.c, HZ=1000) files a
 * timer in a level whose granularity grows with its delay and rounds its expiry up to the next
 * boundary of that level: under 63 ms to the next 1 ms, under 504 ms to 8 ms, under 4 s to 64 ms,
 * under 32 s to 512 ms, beyond to 4 s. So a 1 s ARP retry fires 1.024–1.064 s later and a 5 s
 * DELAY timer 5.0–5.5 s later, as measured on the capture machine (tools/golden).
 */
const LEVELS: [startMs: number, granularityMs: number][] = [
  [258_048, 32_768],
  [32_256, 4_096],
  [4_032, 512],
  [504, 64],
  [63, 8],
  [0, 1],
];

/** The network time at which a kernel timer armed `now` for `delayMs` fires. */
export function kernelTimer(now: number, delayMs: number): number {
  const expires = now + delayMs;
  const g = LEVELS.find(([start]) => delayMs >= start)?.[1] ?? 1;
  return (Math.floor(expires / g) + 1) * g;
}
