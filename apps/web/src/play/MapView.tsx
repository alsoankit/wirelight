import { fill, keeperSays, voice } from "@wirelight/content";
import { type RoomDef, roomById } from "@wirelight/rooms";
import type { Topology } from "@wirelight/sim";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { progress } from "../engine/clock";
import { journey } from "../engine/journey";
import { useSession } from "../engine/store";
import { messageSummary } from "../world/messageKind";
import { RoomCommandMemory } from "./CommandMemory";
import { CLOSE_MAP, OPEN_MAP } from "./keys";
import { Memory } from "./Memory";
import { layout, MAP_H, MAP_W, type Node } from "./mapLayout";
import { noteMoment } from "./momentRules";
import { arrivalText, machineNamer } from "./names";
import { useMachineLabel } from "./roles";
import { WorldMap } from "./WorldMap";

// The Map (CORE-31..33, 0064): a live map of the whole floor, view-only. Machines are
// nodes, cables lines between doors; a corridor's state shows by shape and colour (dark: thin,
// lit: bright, broken: dashed); messages move along the lines from the same trace and presentation
// clock as the room. G opens it full screen; the mini map sits in the corner. A second view is the
// world map (0039): every region and floor, cleared floors glowing, the next one in mist.

export type { Node } from "./mapLayout";
export { layout, MAP_H, MAP_W } from "./mapLayout";

type Pt = { x: number; y: number };
/** A cable on the map: from its `a` end to its `b` end, bent when it shares its two machines with others. */
type Curve = { a: Pt; c: Pt; b: Pt; aDevice: string };

/** A point `t` (0 at `a`, 1 at `b`) along a cable's curve (a quadratic Bézier). */
function along(k: Curve, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * k.a.x + 2 * u * t * k.c.x + t * t * k.b.x, y: u * u * k.a.y + 2 * u * t * k.c.y + t * t * k.b.y };
}

/**
 * Every cable's curve. Two or more cables between the same two machines (a loop, 4.3) bow apart, so
 * each one and its door names can be seen; a single cable stays straight.
 */
export function curves(t: Topology, nodes: Map<string, Node>, spread: number): Map<string, Curve> {
  const pairs = new Map<string, string[]>();
  for (const l of t.links) {
    const pair = [l.a.device, l.b.device].sort().join("|");
    pairs.set(pair, [...(pairs.get(pair) ?? []), l.id]);
  }
  const out = new Map<string, Curve>();
  for (const l of t.links) {
    const a = nodes.get(l.a.device);
    const b = nodes.get(l.b.device);
    if (!a || !b) continue;
    const [first] = [l.a.device, l.b.device].sort();
    const same = pairs.get([l.a.device, l.b.device].sort().join("|")) ?? [l.id];
    // The bend is measured across the line from the pair's first machine, so cables don't cancel out.
    const p = first === l.a.device ? a : b;
    const q = first === l.a.device ? b : a;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const nx = -(q.y - p.y) / len;
    const ny = (q.x - p.x) / len;
    const bend = (same.indexOf(l.id) - (same.length - 1) / 2) * spread * 2;
    const c = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend };
    out.set(l.id, { a, c, b, aDevice: l.a.device });
  }
  return out;
}

/** The street (network) an address is on, like `10.0.1.0/24`. */
export function streetOfAddress(cidr: string): string | null {
  const [ip = "", p = "32"] = cidr.split("/");
  const prefix = Number(p);
  const n = ip.split(".").map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isInteger(x)) || !Number.isInteger(prefix)) return null;
  const v = ((n[0] as number) << 24) | ((n[1] as number) << 16) | ((n[2] as number) << 8) | (n[3] as number);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const net = (v & mask) >>> 0;
  return `${net >>> 24}.${(net >>> 16) & 255}.${(net >>> 8) & 255}.${net & 255}/${prefix}`;
}

/** A replayed message's place on the map: the hop it's on, and how far along (CORE-23). */
type Replaying = { from: string; to: string; t: number; link?: string } | null;

/**
 * The floor's map. `memory`: the floor as it was (0036, 0037), every corridor whole and lit, no live
 * messages, no "you are here"; `children` draw on top (a ride-along's message and its header card).
 */
export function FloorMap({
  room,
  mini,
  replaying = null,
  memory = false,
  children,
}: {
  room: RoomDef;
  mini: boolean;
  replaying?: Replaying;
  memory?: boolean;
  children?: ReactNode;
}) {
  const label = useMachineLabel();
  const here = useSession((s) => s.here);
  /** Standing in a corridor (0081): its cable is where the player is, not a machine. */
  const inCorridor = useSession((s) => (s.corridor && !s.corridor.through ? s.corridor.link : null));
  const corridors = useSession((s) => s.status?.corridors);
  const doors = useSession((s) => s.status?.doors);
  // From Floor 8 (streets joined by crossings), each street's hall is labelled with its street.
  const streets = useMemo(() => {
    const out = new Map<string, string>();
    if (room.floor < 8 || !doors) return out;
    for (const d of room.topology.devices) {
      if (!d.bridges?.length) continue;
      for (const l of room.topology.links) {
        const far = l.a.device === d.id ? l.b : l.b.device === d.id ? l.a : null;
        const addr = far ? doors[`${far.device}:${far.iface}`]?.addrs[0] : undefined;
        const street = addr ? streetOfAddress(addr) : null;
        if (street) {
          out.set(d.id, street);
          break;
        }
      }
    }
    return out;
  }, [room, doors]);
  const W = mini ? 240 : MAP_W;
  const H = mini ? 150 : MAP_H;
  const nodes = useMemo(() => layout(room.topology, room.playerDevice, W, H), [room, W, H]);
  const bends = useMemo(() => curves(room.topology, nodes, mini ? 9 : 34), [room, nodes, mini]);
  const dots = useRef<SVGGElement>(null);
  // Messages: drawn each frame from the session, without React (positions change every frame).
  useEffect(() => {
    if (memory) return;
    let raf = 0;
    const draw = () => {
      const g = dots.current;
      const { onCables, status } = useSession.getState();
      if (g) {
        const now = status?.now ?? 0;
        const circles = onCables
          .map((c) => {
            const k = bends.get(c.link);
            if (!k) return "";
            const t = progress(c, now);
            const { x, y } = along(k, c.from === k.aDevice ? t : 1 - t);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${mini ? 2.5 : 5}" class="map-msg" />`;
          })
          .join("");
        if (g.innerHTML !== circles) g.innerHTML = circles;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [bends, mini, memory]);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="floor-map"
      role="img"
      aria-label={memory ? voice.memory.map : voice.map.floorMap}
    >
      {room.topology.links.map((l) => {
        const k = bends.get(l.id);
        if (!k) return null;
        const state = memory ? "lit" : (corridors?.[l.id] ?? "dark");
        const near = along(k, 0.24);
        const far = along(k, 0.76);
        return (
          <g key={l.id}>
            {!memory && inCorridor === l.id && (
              <path
                d={`M${k.a.x},${k.a.y} Q${k.c.x},${k.c.y} ${k.b.x},${k.b.y}`}
                className="map-here-link"
                fill="none"
              />
            )}
            <path
              d={`M${k.a.x},${k.a.y} Q${k.c.x},${k.c.y} ${k.b.x},${k.b.y}`}
              className={`map-link ${state}`}
              fill="none"
            />
            {!mini && (
              <>
                <text x={near.x} y={near.y - 8} textAnchor="middle" className="map-door">
                  {l.a.iface}
                </text>
                <text x={far.x} y={far.y - 8} textAnchor="middle" className="map-door">
                  {l.b.iface}
                </text>
              </>
            )}
          </g>
        );
      })}
      <g ref={dots} />
      {replaying &&
        (() => {
          const a = nodes.get(replaying.from);
          const b = nodes.get(replaying.to);
          if (!a || !b) return null;
          const k = replaying.link ? bends.get(replaying.link) : undefined;
          const { x, y } = k
            ? along(k, replaying.from === k.aDevice ? replaying.t : 1 - replaying.t)
            : { x: a.x + (b.x - a.x) * replaying.t, y: a.y + (b.y - a.y) * replaying.t };
          return (
            <g transform={`translate(${x},${y})`}>
              <circle r={7} className="map-msg" />
              <circle r={12} className="map-replay" />
            </g>
          );
        })()}
      {[...nodes.values()].map((n) => (
        <g key={n.id} transform={`translate(${n.x},${n.y})`} className={`map-node ${n.kind}`}>
          {!memory && !inCorridor && n.id === here && <circle r={mini ? 9 : 22} className="map-here" />}
          {n.kind === "switch" ? (
            <rect x={mini ? -6 : -14} y={mini ? -4 : -9} width={mini ? 12 : 28} height={mini ? 8 : 18} rx={2} />
          ) : n.kind === "router" ? (
            <polygon points={mini ? "0,-6 6,0 0,6 -6,0" : "0,-14 14,0 0,14 -14,0"} />
          ) : (
            <circle r={mini ? 5 : 11} />
          )}
          {!mini && (
            <text y={30} textAnchor="middle" className="map-name">
              {label(n.id)}
              {streets.get(n.id) && <tspan className="map-street"> {streets.get(n.id)}</tspan>}
            </text>
          )}
        </g>
      ))}
      {children}
    </svg>
  );
}

const HOP_MS = 1400;

/** The journey, hop by hop, on the map, with what each keeper decided (CORE-23). */
function Replay({ room, frameId }: { room: RoomDef; frameId: number }) {
  const events = useSession((s) => s.events);
  const hops = useMemo(() => journey(events, frameId), [events, frameId]);
  const [start, setStart] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const at = Math.min((now - start) / HOP_MS, hops.length);
  const step = Math.min(Math.floor(at), hops.length - 1);
  const hop = hops[step];
  const last = hops.at(-1);
  return (
    <div className="map-replay-view">
      <FloorMap
        room={room}
        mini={false}
        replaying={hop ? { from: hop.from, to: hop.to, t: Math.min(at - step, 1), link: hop.link } : null}
      />
      <ol className="replay-steps">
        {hops.slice(0, step + 1).map((h) => (
          <li key={h.frameId}>
            <strong>{fill(voice.replay.hop, { from: h.from, to: h.to })}</strong>{" "}
            <span className="panel-note">
              {room.floor < 6 ? arrivalText(h.bytes, room) : messageSummary(h.bytes, room.floor)}
            </span>
            {h.decision && <p className="note">{keeperSays(h.decision, h.dropped, machineNamer(room))}</p>}
          </li>
        ))}
      </ol>
      {at >= hops.length && last && (
        <p className="panel-note">{last.dropped ? voice.replay.lostHere : voice.replay.arrived}</p>
      )}
      <div className="panel-actions">
        <button type="button" onClick={() => setStart(performance.now())}>
          {voice.replay.again}
        </button>
      </div>
    </div>
  );
}

export function MapView() {
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"floor" | "world">("floor");
  const replay = useSession((s) => s.replay);
  const here = useSession((s) => s.here);
  const label = useMachineLabel();
  const corridorLink = useSession((s) => (s.corridor && !s.corridor.through ? s.corridor.link : null));
  const corridorLinkDef = corridorLink ? room?.topology.links.find((x) => x.id === corridorLink) : undefined;
  const corridorEnds = corridorLinkDef ? ([corridorLinkDef.a.device, corridorLinkDef.b.device] as const) : null;
  const setReplay = useSession((s) => s.setReplay);
  // A replay opens the Map on it; closing the Map ends it, however it's closed (its own button, G, Esc,
  // or the debrief arriving), so the Map opens as the Map next time.
  useEffect(() => {
    if (replay !== null) setOpen(true);
  }, [replay]);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && useSession.getState().replay !== null) setReplay(null);
    wasOpen.current = open;
  }, [open, setReplay]);
  // The Map opening is a moment (P-MEM-01 plays the first time).
  useEffect(() => {
    if (open) noteMoment("map-open");
  }, [open]);
  // Never under the open console (UI-02).
  const raised = useSession((s) => s.consoleOpen && s.voiceGiven);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.closest(".console"))) return;
      if (e.key === "g" || e.key === "G") setOpen((o) => !o);
      if (e.key === "b" || e.key === "B") {
        setOpen(false);
      }
      if (e.key === "Escape") setOpen(false);
    };
    // Agent A hook: something else opens the Map (the Prologue's Send, ONB-19).
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false); // the debrief arrives: the restored room is the thing to see
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_MAP, onOpen);
    window.addEventListener(CLOSE_MAP, onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_MAP, onOpen);
      window.removeEventListener(CLOSE_MAP, onClose);
    };
  }, []);
  if (!room) return <Memory />;
  return (
    <>
      <Memory />
      <RoomCommandMemory />
      <button
        type="button"
        className="mini-map"
        data-raised={raised ? "yes" : "no"}
        data-tour="map"
        onClick={() => setOpen(true)}
        aria-label={voice.map.open}
      >
        <FloorMap room={room} mini />
        {here && (
          <span className="mini-map-here">
            {corridorEnds
              ? fill(voice.hereCorridor, { a: label(corridorEnds[0]), b: label(corridorEnds[1]) })
              : fill(voice.here, { machine: label(here) })}
          </span>
        )}
      </button>
      {open && replay !== null && (
        <section className="map" aria-label={voice.replay.title}>
          <nav className="menu-tabs">
            <span className="map-label">{voice.replay.title}</span>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setReplay(null);
                setOpen(false);
              }}
            >
              {voice.replay.close}
            </button>
          </nav>
          <Replay room={room} frameId={replay} />
        </section>
      )}
      {open && replay === null && (
        <section className="map" aria-label={voice.map.title}>
          <nav className="menu-tabs">
            <button type="button" aria-pressed={view === "floor"} onClick={() => setView("floor")}>
              {voice.map.thisFloor}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event("wirelight:toggle-birds-eye"));
              }}
            >
              {voice.map.birdsEye}
            </button>
            <button type="button" aria-pressed={view === "world"} onClick={() => setView("world")}>
              {voice.map.world}
            </button>
            <button type="button" className="quiet" onClick={() => setOpen(false)}>
              {voice.map.close}
            </button>
          </nav>
          {view === "floor" ? <FloorMap room={room} mini={false} /> : <WorldMap />}
        </section>
      )}
    </>
  );
}
