import type { SimEvent } from "@wirelight/sim";

// A message's journey (CORE-23), read back from the trace alone, so a replay can never disagree with
// what happened: the chain of frames from the one that started it to the given one (each forwarded
// or flooded copy names the frame it continues, `frame.tx.parent`), and for each hop the cable it
// crossed and what the keeper at the far end decided.

export type Hop = {
  frameId: number;
  link: string;
  from: string;
  to: string;
  enter: number;
  arriveAt: number;
  bytes: Uint8Array;
  /** What the keeper where it arrived decided, if it got that far. */
  decision?: Extract<SimEvent, { kind: "fwd.decision" }>;
  /** Why it was let go there, if it was. */
  dropped?: Extract<SimEvent, { kind: "frame.drop" }>["reason"];
};

export function journey(events: readonly SimEvent[], frameId: number): Hop[] {
  const parent = new Map<number, number>();
  const enters = new Map<number, Extract<SimEvent, { kind: "link.enter" }>>();
  const decisions = new Map<number, Extract<SimEvent, { kind: "fwd.decision" }>[]>();
  const drops = new Map<number, Extract<SimEvent, { kind: "frame.drop" }>>();
  for (const e of events) {
    if (e.kind === "frame.tx" && e.parent !== undefined) parent.set(e.frameId, e.parent);
    else if (e.kind === "link.enter") enters.set(e.frameId, e);
    else if (e.kind === "fwd.decision") decisions.set(e.frameId, [...(decisions.get(e.frameId) ?? []), e]);
    else if (e.kind === "frame.drop") drops.set(e.frameId, e);
  }
  const chain: number[] = [];
  for (let f: number | undefined = frameId; f !== undefined && !chain.includes(f); f = parent.get(f)) chain.unshift(f);
  const hops: Hop[] = [];
  for (const id of chain) {
    const e = enters.get(id);
    if (!e) continue;
    // A router first takes the frame in (l2), then decides where its packet goes (l3): the last word.
    const decision = decisions
      .get(id)
      ?.filter((d) => d.device === e.to.device)
      .at(-1);
    const drop = drops.get(id);
    hops.push({
      frameId: id,
      link: e.link,
      from: e.from.device,
      to: e.to.device,
      enter: e.t,
      arriveAt: e.arriveAt,
      bytes: e.bytes,
      decision,
      dropped: drop && drop.device === e.to.device ? drop.reason : undefined,
    });
  }
  return hops;
}

/**
 * The answer that won the room: the last message taken in by the player's machine (a lab answer, or a
 * messenger's ping answered), else the last IPv4 packet that reached it (a ping's reply).
 */
export function winningFrame(events: readonly SimEvent[], device: string): number | null {
  let packet: number | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if ((e?.kind === "app.deliver" || e?.kind === "echo.heard") && e.device === device && e.frameId != null)
      return e.frameId;
    // EtherType 0x0800 at bytes 12–13: an IPv4 packet.
    if (packet === null && e?.kind === "frame.rx" && e.device === device && e.bytes[12] === 0x08 && e.bytes[13] === 0)
      packet = e.frameId;
  }
  return packet;
}
