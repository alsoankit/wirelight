import { loadRoom, play, type RoomDef, roomById, rooms } from "@wirelight/rooms";
import { peel, type SimEvent, type Topology } from "@wirelight/sim";
import { journey, winningFrame } from "../engine/journey";

// A ride-along (0036, tech/rendering.md): one message followed hop by hop through a floor, from a
// real trace. The trace is recorded by running the room's own solution headless (a few
// milliseconds for one room), so what the memory shows is what the simulator really does: the
// frame changing at every crossing, the packet's addresses staying, the countdown one less.

/** A door, read from a frame's address: the machine and door it names, or everyone. */
export type Door = { mac: string; device?: string; iface?: string; everyone?: boolean };

/** One hop of the ride: the cable crossed and the headers on the message as it crossed it. */
export type RideStop = {
  from: string;
  to: string;
  frame: { from: Door; to: Door };
  packet?: { from: string; to: string; ttl: number };
  /** Which headers differ from the hop before (none on the first hop, or when the answer sets off). */
  changed: { frameFrom: boolean; frameTo: boolean; packetFrom: boolean; packetTo: boolean; ttl: boolean };
  /** The countdown on the hop before, when it changed. */
  ttlWas?: number;
  /** How this hop's message relates to the one before. */
  change: "crossing" | "passed" | "turn" | null;
  /** What happened where it arrived. */
  end: "delivered" | "arrived" | "lost" | null;
};

export type Ride = { room: RoomDef; stops: RideStop[] };

const BROADCAST = "ff:ff:ff:ff:ff:ff";

function doors(t: Topology): Map<string, Door> {
  const out = new Map<string, Door>();
  for (const d of t.devices)
    for (const i of d.interfaces) out.set(i.mac.toLowerCase(), { mac: i.mac, device: d.id, iface: i.name });
  return out;
}

const door = (known: Map<string, Door>, mac: string): Door =>
  mac.toLowerCase() === BROADCAST ? { mac, everyone: true } : (known.get(mac.toLowerCase()) ?? { mac });

/** The stops of the message that won the room (its whole round trip, when it was answered). */
export function rideStops(room: RoomDef, trace: readonly SimEvent[]): RideStop[] {
  const won = winningFrame(trace, room.playerDevice);
  if (won === null) return [];
  const known = doors(room.topology);
  const hops = journey(trace, won);
  const stops: RideStop[] = [];
  hops.forEach((h, i) => {
    const [f, inner] = peel(h.bytes);
    if (f?.layer !== "frame") return;
    const frame = { from: door(known, f.from), to: door(known, f.to) };
    const packet = inner?.layer === "packet" ? { from: inner.from, to: inner.to, ttl: inner.ttl } : undefined;
    const prev = stops.at(-1);
    const turn = !!(prev && packet && prev.packet && packet.from === prev.packet.to && packet.to === prev.packet.from);
    const changed = {
      frameFrom: !!prev && !turn && prev.frame.from.mac !== frame.from.mac,
      frameTo: !!prev && !turn && prev.frame.to.mac !== frame.to.mac,
      packetFrom: !!(prev?.packet && packet && !turn && prev.packet.from !== packet.from),
      packetTo: !!(prev?.packet && packet && !turn && prev.packet.to !== packet.to),
      ttl: !!(prev?.packet && packet && !turn && prev.packet.ttl !== packet.ttl),
    };
    const frameChanged = changed.frameFrom || changed.frameTo;
    const change: RideStop["change"] = !prev
      ? null
      : turn
        ? "turn"
        : frameChanged && packet && !changed.packetFrom && !changed.packetTo
          ? "crossing"
          : !frameChanged
            ? "passed"
            : null;
    const last = i === hops.length - 1;
    const end: RideStop["end"] = h.dropped
      ? "lost"
      : h.decision?.decision === "deliver"
        ? last
          ? "arrived"
          : "delivered"
        : null;
    stops.push({
      from: h.from,
      to: h.to,
      frame,
      packet,
      changed,
      ttlWas: changed.ttl ? prev?.packet?.ttl : undefined,
      change,
      end,
    });
  });
  return stops;
}

const cache = new Map<string, Ride | null>();

/** Runs the room's solution headless and reads its ride; remembered, so a replay costs nothing. */
export function recordRide(roomId: string): Ride | null {
  if (cache.has(roomId)) return cache.get(roomId) ?? null;
  const room = roomById(roomId);
  let ride: Ride | null = null;
  if (room) {
    const trace = play(room, loadRoom(room, rooms), room.solution).trace;
    ride = { room, stops: rideStops(room, trace) };
  }
  cache.set(roomId, ride);
  return ride;
}
