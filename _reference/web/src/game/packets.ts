/**
 * Frames in motion, derived from the trace (SIM-38): a frame is in a corridor between its
 * `link.enter` and `link.exit`, and its position is a function of network time.
 */
import type { SimEvent } from "@wirelight/sim";

export interface Flight {
  frameId: number;
  bytes: Uint8Array;
  link: string;
  dir: 0 | 1;
  t0: number;
  t1: number;
  summary: string;
  /** The lab message inside, for hover text. */
  text: string | null;
}

/** Short-lived things the room shows in real time: a frame leaving a desk, arriving, being ignored. */
export interface Flourish {
  kind: "depart" | "arrive" | "ignored" | "deliver";
  bytes: Uint8Array;
  device: string;
  iface: string;
  frameId: number;
  born: number;
}

export class PacketTracker {
  readonly flights = new Map<number, Flight>();
  flourishes: Flourish[] = [];
  /** Where frames died (FR-PKT-16), in real time; they fade after ~10 s. */
  marks: { device: string; iface: string; born: number }[] = [];

  onEvent(e: SimEvent, realNow: number): void {
    switch (e.kind) {
      case "link.enter":
        this.flights.set(e.frameId, {
          frameId: e.frameId,
          bytes: e.bytes,
          link: e.link,
          dir: e.dir,
          t0: e.t,
          t1: e.arriveAt,
          summary: publicSummary(e.bytes, e.summary),
          text: labText(e.bytes),
        });
        return;
      case "link.exit":
        this.flights.delete(e.frameId);
        return;
      case "frame.tx":
        this.flourishes.push({
          kind: "depart",
          bytes: e.bytes,
          device: e.device,
          iface: e.iface,
          frameId: e.frameId,
          born: realNow,
        });
        return;
      case "frame.rx":
        this.flourishes.push({
          kind: "arrive",
          bytes: e.bytes,
          device: e.device,
          iface: e.iface,
          frameId: e.frameId,
          born: realNow,
        });
        return;
      case "frame.drop":
        // A broadcast nobody was listening for isn't a lost message; don't mark it.
        if (e.iface && e.reason !== "no-listener") this.marks.push({ device: e.device, iface: e.iface, born: realNow });
        return;
      case "world.reset":
        this.flights.clear();
        this.flourishes = [];
        this.marks = [];
        return;
    }
  }

  prune(realNow: number): void {
    this.flourishes = this.flourishes.filter((f) => realNow - f.born < 900);
    this.marks = this.marks.filter((m) => realNow - m.born < 10_000);
  }

  /** 0 → 1 along the cable in the frame's direction. */
  static progress(f: Flight, now: number): number {
    if (f.t1 <= f.t0) return 1;
    return Math.min(1, Math.max(0, (now - f.t0) / (f.t1 - f.t0)));
  }
}

export function labTextOf(b: Uint8Array): string | null {
  return labText(b);
}

function labText(b: Uint8Array): string | null {
  if (b[12] !== 0x88 || b[13] !== 0xb5) return null;
  let end = b.length;
  while (end > 14 && b[end - 1] === 0) end--;
  try {
    return new TextDecoder().decode(b.subarray(14, end));
  } catch {
    return null;
  }
}

/**
 * The hover line for a frame. Anything inside an IPv4 packet stays sealed on Floors 0–1
 * (FR-PKT-11), so the line stops at the frame.
 */
export function publicSummary(bytes: Uint8Array, summary: string): string {
  if (bytes[12] === 0x08 && bytes[13] === 0x00) return `${summary.split(": ")[0]}: (sealed)`;
  return summary;
}
