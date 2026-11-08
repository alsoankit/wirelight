// How fast this device draws, for the play logs (account/logs.ts): the median frame time over a room.
// Frames are counted in one-millisecond buckets rather than kept one by one, so a long room takes no
// more memory than a short one, and whole milliseconds are all a log needs.

/** The slowest bucket: a frame this slow or slower counts here. */
const MAX_MS = 250;

export class FrameTimes {
  /** How many frames took each whole number of milliseconds, 0 to MAX_MS. */
  private readonly counts = new Uint32Array(MAX_MS + 1);
  private total = 0;

  /** One frame, `delta` seconds after the last. */
  add(delta: number): void {
    // Not a frame: no time at all, or over a second (the tab coming back after a pause). NaN fails too.
    if (!(delta > 0 && delta <= 1)) return;
    const ms = Math.min(Math.round(delta * 1000), MAX_MS);
    this.counts[ms] = (this.counts[ms] ?? 0) + 1;
    this.total++;
  }

  /** The median frame time in whole milliseconds, or null before any frame. */
  median(): number | null {
    if (this.total === 0) return null;
    // The middle frame in order (for an even count the later of the two, as qualityJudge.ts takes it).
    const middle = Math.floor(this.total / 2);
    let below = 0;
    for (let ms = 0; ms < MAX_MS; ms++) {
      below += this.counts[ms] ?? 0;
      if (below > middle) return ms;
    }
    return MAX_MS;
  }

  clear(): void {
    this.counts.fill(0);
    this.total = 0;
  }
}

/**
 * Every frame the play page draws (AutoQuality adds it), so the play logs can say how fast this device
 * draws: they read the median when a room ends and clear it as the next begins.
 */
export const frameTimes = new FrameTimes();
