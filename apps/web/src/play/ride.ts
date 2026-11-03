import { loadRoom, play, type RoomDef, roomById, rooms, type SolutionStep } from "@wirelight/rooms";
import { peel, type SimEvent, type TableRef, type Topology } from "@wirelight/sim";
import { journey, winningFrame } from "../engine/journey";

// A ride-along (0036, 0066): each floor's own idea followed hop by hop through a floor, from a
// real trace. The trace is recorded by running the floor's ride script headless (the boss room, its
// solution or part of it, then the messages the floor spec rides: Floor 2's three frames, Floor 3's
// learn-then-flood, Floor 4's broadcast round the loop, Floor 6's question before the packet, Floor
// 7's call to the registry...), so what the memory shows is what the simulator really does. A ride
// is one or more legs; a leg is a list of beats; a beat is one step of one message, every copy of it
// crossing its cable at once (a flood is one beat with several copies).

/** A door, read from a frame's address: the machine and door it names, or everyone. */
export type Door = { mac: string; device?: string; iface?: string; everyone?: boolean };

/** What a beat's message carries, outermost first, read from its bytes. */
export type Headers = {
  frame: { from: Door; to: Door };
  packet?: { from: string; to: string; ttl: number };
  /** The address question (ARP), Floor 6 on. */
  ask?: { op: "who-has" | "is-at"; ip: string; tell: string };
  /** A registry message (DHCP), Floor 7. */
  dhcp?: string;
  /** A lab message's words. */
  words?: string;
};

/** One copy crossing one cable, and what became of it where it arrived. */
export type Copy = {
  link: string;
  from: string;
  to: string;
  /** in: taken in (the end); fell: let fall (not for this door); on: carried on; lost: dropped. */
  fate: "in" | "fell" | "on" | "lost" | "none";
};

/** What the keeper at the beat's starting machine read, when it was a switch or a crossing. */
export type Desk =
  | {
      kind: "ledger";
      device: string;
      /** The line the frame wrote by arriving: its from, and the door it came in by. */
      learned: { mac: string; port: string; who?: string } | null;
      known: { mac: string; port: string } | null;
      flood: boolean;
    }
  | { kind: "board"; device: string; route: { dst: string; via: string | null; dev: string } | null };

export type BeatNote =
  | "sent"
  | "everyone"
  | "question"
  | "answer"
  | "wrap"
  | "discover"
  | "offer"
  | "street"
  | "passed"
  | "known"
  | "flood"
  | "crossing"
  | "turn"
  | "loop";

export type Beat = {
  /** Which message of the leg (several messages: question, answer, packet). */
  message: number;
  copies: Copy[];
  headers: Headers;
  changed: { frameFrom: boolean; frameTo: boolean; packetFrom: boolean; packetTo: boolean; ttl: boolean };
  ttlWas?: number;
  note: BeatNote | null;
  desk?: Desk;
  /** Which street the message is on: the stretch of cables between crossings, numbered in the order the ride reaches them. */
  street: number;
};

export type Leg = {
  id: string;
  beats: Beat[] /** the copies kept growing: the ride was cut short */;
  endless?: boolean;
};
export type Ride = { room: RoomDef; legs: Leg[] };

const BROADCAST = "ff:ff:ff:ff:ff:ff";

// -- What each floor rides (the floor specs' FM-03), as commands run on the boss room. --

type Pick = "lab" | "ipv4" | "echo-request" | "arp+echo-request" | "dhcp-first-two" | "all";
type LegScript = {
  id: string;
  steps: SolutionStep[];
  pick: Pick;
  from?: string;
  maxBeats?: number;
  /** Stop each message where it's taken in (no reply). */
  oneWay?: boolean;
};
type RideScript = {
  room: string;
  setup: SolutionStep[] | "solution" | (() => SolutionStep[]);
  legs: LegScript[] | "won";
};

const o = (line: string, waitMs?: number): SolutionStep => ({ device: "observatory", line, source: "typed", waitMs });
const sendFrame = (to: string, msg: string, dev?: string) =>
  o(`lab send-frame${dev ? ` --dev ${dev}` : ""} --to ${to} --msg "${msg}"`);

export const rideScripts: Record<number, RideScript> = {
  // Kitchen's message, out through its door, along the thread, into yours.
  1: { room: "f1.boss-dark-corridor", setup: "solution", legs: "won" },
  // A frame for kitchen's door, taken in; a broadcast, taken in by both doors; a frame for someone
  // else, let fall.
  2: {
    room: "f2.boss-silent-line",
    setup: [o("ip link set eth1 up")],
    legs: [
      { id: "named", steps: [sendFrame("02:00:00:00:00:07", "hello", "eth0")], pick: "lab", from: "observatory" },
      {
        id: "everyone",
        steps: [{ ...sendFrame(BROADCAST, "hello", "eth0"), waitMs: 0 }, sendFrame(BROADCAST, "hello", "eth1")],
        pick: "lab",
        from: "observatory",
      },
      { id: "other", steps: [sendFrame("02:00:00:00:00:0e", "hello", "eth0")], pick: "lab", from: "observatory" },
    ],
  },
  // A frame to a name the hall knows: one door. Then an unknown name: every other door.
  3: {
    room: "f3.boss-busy-hall",
    setup: [{ device: "hall", line: "ip link set eth2 up", source: "typed" }, sendFrame(BROADCAST, "who?")],
    legs: [
      { id: "known", steps: [sendFrame("02:00:00:00:00:0b", "hello")], pick: "lab", from: "observatory" },
      { id: "unknown", steps: [sendFrame("02:00:00:00:00:66", "hello")], pick: "lab", from: "observatory" },
    ],
  },
  // One broadcast, before the second span is unplugged: round and round.
  4: {
    room: "f4.boss-storm",
    setup: [],
    legs: [
      { id: "storm", steps: [sendFrame(BROADCAST, "who?", undefined)], pick: "lab", from: "observatory", maxBeats: 7 },
    ],
  },
  // A ping to kitchen's house and its echo (the address question is Floor 6's: left out here).
  5: {
    room: "f5.boss-quiet-street",
    setup: [
      o("ip addr add 10.0.1.5/24 dev eth0"),
      { device: "square", line: "ip link set eth1 up", source: "typed" },
      o("ping -c 1 10.0.1.7"),
    ],
    legs: [{ id: "ping", steps: [o("ping -c 1 10.0.1.7")], pick: "ipv4" }],
  },
  // The question to the whole street, the answer, then the packet folded into a frame.
  6: {
    room: "f6.boss-mixed-up-letters",
    setup: [o("ip neigh del 10.0.1.7 dev eth0")],
    legs: [{ id: "ask", steps: [o("ping -c 1 10.0.1.7")], pick: "arp+echo-request", oneWay: true }],
  },
  // A call from nobody to everyone, the registry's offer back; then a ping on the same street.
  7: {
    room: "f7.boss-census",
    // Chapel and cellar back at their own numbers first (the boss's first steps), so the offer is free.
    setup: () => roomById("f7.boss-census")?.solution.slice(0, 4) ?? [],
    legs: [
      { id: "registry", steps: [o("dhclient -v eth0", 10000)], pick: "dhcp-first-two" },
      { id: "street", steps: [o("ping -c 1 10.0.1.7")], pick: "echo-request", oneWay: true },
    ],
  },
  // A ping to gallery over the crossing, and the reply.
  8: {
    room: "f8.boss-closed-crossing",
    setup: "solution",
    legs: [{ id: "cross", steps: [o("ping -c 1 10.0.2.7")], pick: "ipv4" }],
  },
  // One ping to loft, four streets, and the reply all the way back.
  9: {
    room: "f9.boss-crossing",
    setup: "solution",
    legs: [{ id: "journey", steps: [o("ping -c 1 10.0.4.7")], pick: "ipv4" }],
  },
};

// -- Reading the trace. --

function doors(t: Topology): Map<string, Door> {
  const out = new Map<string, Door>();
  for (const d of t.devices)
    for (const i of d.interfaces) out.set(i.mac.toLowerCase(), { mac: i.mac, device: d.id, iface: i.name });
  return out;
}

const door = (known: Map<string, Door>, mac: string): Door =>
  mac.toLowerCase() === BROADCAST ? { mac, everyone: true } : (known.get(mac.toLowerCase()) ?? { mac });

type Tx = Extract<SimEvent, { kind: "frame.tx" }>;
type Enter = Extract<SimEvent, { kind: "link.enter" }>;
type Decision = Extract<SimEvent, { kind: "fwd.decision" }>;

function headers(known: Map<string, Door>, bytes: Uint8Array, dhcp?: string): Headers {
  const layers = peel(bytes);
  const out: Headers = { frame: { from: { mac: "" }, to: { mac: "" } } };
  for (const l of layers) {
    if (l.layer === "frame") out.frame = { from: door(known, l.from), to: door(known, l.to) };
    else if (l.layer === "packet") out.packet = { from: l.from, to: l.to, ttl: l.ttl };
    else if (l.kind === "arp")
      out.ask = {
        op: l.op === 1 ? "who-has" : "is-at",
        ip: l.op === 1 ? l.targetIp : l.senderIp,
        tell: l.op === 1 ? l.senderIp : l.targetIp,
      };
    else if (l.kind === "lab") out.words = l.text;
  }
  if (dhcp) out.dhcp = dhcp;
  return out;
}

const kindOf = (bytes: Uint8Array) => {
  const l = peel(bytes);
  const m = l.find((x) => x.layer === "message");
  if (m?.layer === "message" && m.kind === "arp") return "arp";
  if (m?.layer === "message" && m.kind === "lab") return "lab";
  if (m?.layer === "message" && m.kind === "icmp")
    return m.type === 8 ? "echo-request" : m.type === 0 ? "echo-reply" : "icmp";
  if (m?.layer === "message" && m.kind === "udp" && (m.toPort === 67 || m.toPort === 68)) return "dhcp";
  if (l.some((x) => x.layer === "packet")) return "ipv4";
  return "other";
};

function pickRoots(roots: Tx[], pick: Pick, from?: string): Tx[] {
  const r = roots.filter((t) => !from || (t.device === from && t.origin === "command"));
  const k = (t: Tx) => kindOf(t.bytes);
  switch (pick) {
    case "lab":
      return r.filter((t) => k(t) === "lab");
    case "ipv4":
      return r.filter((t) => ["echo-request", "echo-reply", "icmp", "ipv4"].includes(k(t)));
    case "echo-request":
      return r.filter((t) => k(t) === "echo-request");
    case "arp+echo-request":
      return r.filter((t) => k(t) === "arp" || k(t) === "echo-request");
    case "dhcp-first-two":
      return r.filter((t) => k(t) === "dhcp").slice(0, 2);
    default:
      return r;
  }
}

/** The beats of the given messages (roots), read from a window of the trace. */
export function beatsOf(
  room: RoomDef,
  events: readonly SimEvent[],
  roots: Tx[],
  maxBeats = 40,
  oneWay = false,
): { beats: Beat[]; endless: boolean } {
  const known = doors(room.topology);
  const children = new Map<number, Tx[]>();
  const enters = new Map<number, Enter>();
  const drops = new Map<number, string>();
  const decisions = new Map<number, Decision[]>();
  const dhcp: { t: number; device: string; what: string }[] = [];
  for (const e of events) {
    if (e.kind === "frame.tx" && e.parent !== undefined) children.set(e.parent, [...(children.get(e.parent) ?? []), e]);
    else if (e.kind === "link.enter") enters.set(e.frameId, e);
    else if (e.kind === "frame.drop") drops.set(e.frameId, e.device);
    else if (e.kind === "fwd.decision") decisions.set(e.frameId, [...(decisions.get(e.frameId) ?? []), e]);
    else if (
      e.kind === "dhcp.state" &&
      /^[A-Z]+$/.test(e.what) &&
      ["DISCOVER", "OFFER", "REQUEST", "ACK"].includes(e.what)
    )
      dhcp.push({ t: e.t, device: e.device, what: e.what });
  }
  const bridges = new Set(room.topology.devices.filter((d) => d.bridges?.length).map((d) => d.id));
  const routers = new Set(
    room.topology.devices
      .filter((d) => !d.bridges?.length && d.interfaces.length > 1 && d.id !== room.playerDevice)
      .map((d) => d.id),
  );
  const fateOf = (id: number, to: string, h: Headers): Copy["fate"] => {
    // dhclient reads the registry's offer before the house has its address (a raw socket, as on
    // Linux): the frame was for this door, and it was heard.
    if (h.dhcp && h.frame.to.device === to) return "in";
    const ds = decisions.get(id)?.filter((x) => x.device === to) ?? [];
    if (ds.some((x) => x.decision === "forward" || x.decision === "flood")) return "on";
    const d = ds.at(-1);
    if (drops.get(id) === to) return bridges.has(to) ? "lost" : "fell";
    if (d?.decision === "deliver") return "in";
    if (d?.decision === "forward" || d?.decision === "flood") return "on";
    if (d?.decision === "drop") return bridges.has(to) ? "lost" : "fell";
    return "none";
  };

  // Messages sent at the same moment by the same machine ride together (Floor 2's two broadcasts).
  const groups: Tx[][] = [];
  for (const r of [...roots].sort((a, b) => a.t - b.t)) {
    const g = groups.at(-1);
    const first = g?.[0];
    if (
      g &&
      first &&
      first.device === r.device &&
      Math.abs(first.t - r.t) < 1 &&
      kindOf(first.bytes) === kindOf(r.bytes)
    )
      g.push(r);
    else groups.push([r]);
  }

  const beats: Beat[] = [];
  let endless = false;
  let prevPacket: Headers["packet"];
  // Streets: the stretches of cable joined by switches and houses, split by crossings.
  const streetOf = new Map<string, number>();
  const streetIds = new Map<number, number>();
  {
    const comp = new Map<string, number>();
    let k = 0;
    for (const l of room.topology.links) {
      if (comp.has(l.id)) continue;
      const stack = [l.id];
      comp.set(l.id, k);
      while (stack.length) {
        const id = stack.pop() as string;
        const x = room.topology.links.find((y) => y.id === id);
        if (!x) continue;
        for (const dev of [x.a.device, x.b.device]) {
          if (routers.has(dev)) continue;
          for (const y of room.topology.links)
            if (!comp.has(y.id) && (y.a.device === dev || y.b.device === dev)) {
              comp.set(y.id, k);
              stack.push(y.id);
            }
        }
      }
      k += 1;
    }
    for (const [id, c] of comp) streetOf.set(id, c);
  }
  const streetNumber = (link: string | undefined) => {
    const c = streetOf.get(link ?? "") ?? 0;
    if (!streetIds.has(c)) streetIds.set(c, streetIds.size);
    return streetIds.get(c) ?? 0;
  };
  groups.forEach((group, message) => {
    let gen = group.filter((t) => enters.has(t.frameId));
    const seen = new Set<string>();
    let depth = 0;
    let prevHeaders: Headers | undefined;
    while (gen.length) {
      if (beats.length >= maxBeats) {
        endless = true;
        break;
      }
      const lead = gen[0] as Tx;
      const kind = kindOf(lead.bytes);
      const dhcpWhat =
        kind === "dhcp"
          ? dhcp.filter((d) => d.t <= lead.t + 0.001 && d.device === group[0]?.device).at(-1)?.what
          : undefined;
      const h = headers(known, lead.bytes, dhcpWhat);
      const copies: Copy[] = gen.flatMap((t) => {
        const e = enters.get(t.frameId);
        return e
          ? [{ link: e.link, from: e.from.device, to: e.to.device, fate: fateOf(t.frameId, e.to.device, h) }]
          : [];
      });
      const at = copies[0]?.from ?? lead.device;
      // What the keeper where this beat set off from read (the decision on the frame that brought it).
      const parentId = lead.parent;
      const dec =
        parentId !== undefined
          ? decisions
              .get(parentId)
              ?.filter((d) => d.device === at)
              .at(-1)
          : undefined;
      let desk: Desk | undefined;
      if (dec && bridges.has(at)) {
        const inn = parentId !== undefined ? enters.get(parentId) : undefined;
        const src = peel(lead.bytes)[0];
        desk = {
          kind: "ledger",
          device: at,
          learned:
            inn && src?.layer === "frame"
              ? { mac: src.from, port: inn.to.iface, who: door(known, src.from).device }
              : null,
          known: deskLine(dec.tableRef),
          flood: dec.decision === "flood" || copies.length > 1,
        };
      } else if (dec && routers.has(at) && dec.layer === "l3")
        desk = { kind: "board", device: at, route: dec.tableRef.route ? { ...dec.tableRef.route } : null };
      const crossing = routers.has(at) && depth > 0;
      const turn = !!(prevPacket && h.packet && h.packet.from === prevPacket.to && h.packet.to === prevPacket.from);
      const loop = depth > 0 && copies.some((c) => seen.has(`${c.link}:${c.from}`));
      for (const c of copies) seen.add(`${c.link}:${c.from}`);
      const p = prevHeaders;
      const changed = turn
        ? { frameFrom: false, frameTo: false, packetFrom: false, packetTo: false, ttl: false }
        : {
            frameFrom: !!p && p.frame.from.mac !== h.frame.from.mac,
            frameTo: !!p && p.frame.to.mac !== h.frame.to.mac,
            packetFrom: !!(p?.packet && h.packet && p.packet.from !== h.packet.from),
            packetTo: !!(p?.packet && h.packet && p.packet.to !== h.packet.to),
            ttl: !!(p?.packet && h.packet && p.packet.ttl !== h.packet.ttl),
          };
      const note: BeatNote | null =
        depth === 0
          ? turn
            ? "turn"
            : kind === "arp"
              ? h.ask?.op === "who-has"
                ? "question"
                : "answer"
              : kind === "dhcp"
                ? dhcpWhat === "OFFER"
                  ? "offer"
                  : "discover"
                : kind === "echo-request" && message > 0 && beats.some((b) => b.headers.ask)
                  ? "wrap"
                  : kind === "echo-request" && room.floor === 7
                    ? "street"
                    : h.frame.to.everyone
                      ? "everyone"
                      : "sent"
          : turn
            ? "turn"
            : crossing
              ? "crossing"
              : loop
                ? "loop"
                : desk?.kind === "ledger"
                  ? desk.flood
                    ? "flood"
                    : "known"
                  : "passed";
      beats.push({
        message,
        copies,
        headers: h,
        changed,
        ttlWas: changed.ttl ? p?.packet?.ttl : undefined,
        note,
        desk,
        street: streetNumber(copies[0]?.link),
      });
      prevHeaders = h;
      if (h.packet) prevPacket = h.packet;
      if (oneWay && copies.some((c) => c.fate === "in" && !bridges.has(c.to))) break;
      gen = gen.flatMap((t) => children.get(t.frameId) ?? []).filter((t) => enters.has(t.frameId));
      depth += 1;
    }
  });
  return { beats, endless };
}

function deskLine(ref: TableRef): { mac: string; port: string } | null {
  return ref.fdb ? { mac: ref.fdb.mac, port: ref.fdb.port } : null;
}

/** The root message of a frame's chain (the frame the player's machine took in, back to its start). */
function rootOf(events: readonly SimEvent[], frameId: number): Tx | undefined {
  const first = journey(events, frameId)[0];
  return events.find((e): e is Tx => e.kind === "frame.tx" && e.frameId === first?.frameId);
}

const cache = new Map<number, Ride | null>();

/** Runs the floor's ride script headless and reads its ride; remembered, so a replay costs nothing. */
export function recordRide(floor: number): Ride | null {
  if (cache.has(floor)) return cache.get(floor) ?? null;
  const script = rideScripts[floor];
  const room = script ? roomById(script.room) : undefined;
  let ride: Ride | null = null;
  if (script && room) {
    const b = loadRoom(room, rooms);
    const setup = script.setup;
    play(room, b, setup === "solution" ? room.solution : typeof setup === "function" ? setup() : setup);
    if (script.legs === "won") {
      const trace = b.trace();
      const won = winningFrame(trace, room.playerDevice);
      const root = won === null ? undefined : rootOf(trace, won);
      ride = { room, legs: root ? [{ id: "won", ...beatsOf(room, trace, [root]) }] : [] };
    } else {
      const legs: Leg[] = [];
      for (const leg of script.legs) {
        const start = b.trace().length;
        play(room, b, leg.steps, 2000);
        const window = b.trace().slice(start);
        const roots = window.filter((e): e is Tx => e.kind === "frame.tx" && e.parent === undefined);
        const picked = pickRoots(roots, leg.pick, leg.from);
        legs.push({ id: leg.id, ...beatsOf(room, window, picked, leg.maxBeats, leg.oneWay) });
      }
      ride = { room, legs };
    }
  }
  cache.set(floor, ride);
  return ride;
}
