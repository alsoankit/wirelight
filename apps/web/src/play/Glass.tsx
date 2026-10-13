import { fill, floors, keeperSays, regions, voice } from "@wirelight/content";
import { floorDefs, type RoomDef, roomById } from "@wirelight/rooms";
import type { Topology } from "@wirelight/sim";
import { useEffect, useMemo, useRef, useState } from "react";
import { progress } from "../engine/clock";
import { journey } from "../engine/journey";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { messageSummary } from "../world/messageKind";

// The Scrying Glass (CORE-31..33, 0064): a live map of the whole floor, view-only. Machines are
// nodes, cables lines between doors; a corridor's state shows by shape and colour (dark: thin,
// lit: bright, broken: dashed); messages move along the lines from the same trace and presentation
// clock as the room. G opens it full screen; the mini Glass sits in the corner. A second view is the
// world map (0039): every region and floor, cleared floors glowing, the next one in mist.

type Node = { id: string; x: number; y: number; kind: "you" | "switch" | "router" | "house" };

/** Lays the floor out in columns by distance from the player's machine (a breadth-first walk). */
function layout(t: Topology, start: string, w: number, h: number): Map<string, Node> {
  const next = new Map<string, string[]>();
  for (const l of t.links) {
    next.set(l.a.device, [...(next.get(l.a.device) ?? []), l.b.device]);
    next.set(l.b.device, [...(next.get(l.b.device) ?? []), l.a.device]);
  }
  const depth = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const d = queue.shift() as string;
    for (const n of next.get(d) ?? [])
      if (!depth.has(n)) {
        depth.set(n, (depth.get(d) ?? 0) + 1);
        queue.push(n);
      }
  }
  for (const d of t.devices) if (!depth.has(d.id)) depth.set(d.id, 0);
  const columns = Math.max(...depth.values()) + 1;
  const byColumn = new Map<number, string[]>();
  for (const d of t.devices) byColumn.set(depth.get(d.id) ?? 0, [...(byColumn.get(depth.get(d.id) ?? 0) ?? []), d.id]);
  const out = new Map<string, Node>();
  for (const [c, ids] of byColumn)
    ids.forEach((id, i) => {
      const spec = t.devices.find((d) => d.id === id);
      const kind =
        id === start
          ? "you"
          : spec?.bridges?.length
            ? "switch"
            : (spec?.interfaces.length ?? 0) > 1
              ? "router"
              : "house";
      out.set(id, { id, kind, x: ((c + 0.5) / columns) * w, y: ((i + 1) / (ids.length + 1)) * h });
    });
  return out;
}

/** A replayed message's place on the map: the hop it's on, and how far along (CORE-23). */
type Replaying = { from: string; to: string; t: number } | null;

function FloorMap({ room, mini, replaying = null }: { room: RoomDef; mini: boolean; replaying?: Replaying }) {
  const here = useSession((s) => s.here);
  const corridors = useSession((s) => s.status?.corridors);
  const W = mini ? 240 : 900;
  const H = mini ? 150 : 520;
  const nodes = useMemo(() => layout(room.topology, room.playerDevice, W, H), [room, W, H]);
  const dots = useRef<SVGGElement>(null);
  // Messages: drawn each frame from the session, without React (positions change every frame).
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const g = dots.current;
      const { onCables, status } = useSession.getState();
      if (g) {
        const now = status?.now ?? 0;
        const circles = onCables
          .map((c) => {
            const a = nodes.get(c.from);
            const b = nodes.get(c.to);
            if (!a || !b) return "";
            const t = progress(c, now);
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${mini ? 2.5 : 5}" class="glass-msg" />`;
          })
          .join("");
        if (g.innerHTML !== circles) g.innerHTML = circles;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [nodes, mini]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="glass-map" role="img" aria-label={voice.glass.floorMap}>
      {room.topology.links.map((l) => {
        const a = nodes.get(l.a.device);
        const b = nodes.get(l.b.device);
        if (!a || !b) return null;
        const state = corridors?.[l.id] ?? "dark";
        return (
          <g key={l.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`glass-link ${state}`} />
            {!mini && (
              <>
                <text
                  x={a.x + (b.x - a.x) * 0.3}
                  y={a.y + (b.y - a.y) * 0.3 - 8}
                  textAnchor="middle"
                  className="glass-door"
                >
                  {l.a.iface}
                </text>
                <text
                  x={a.x + (b.x - a.x) * 0.7}
                  y={a.y + (b.y - a.y) * 0.7 - 8}
                  textAnchor="middle"
                  className="glass-door"
                >
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
          const x = a.x + (b.x - a.x) * replaying.t;
          const y = a.y + (b.y - a.y) * replaying.t;
          return (
            <g transform={`translate(${x},${y})`}>
              <circle r={7} className="glass-msg" />
              <circle r={12} className="glass-replay" />
            </g>
          );
        })()}
      {[...nodes.values()].map((n) => (
        <g key={n.id} transform={`translate(${n.x},${n.y})`} className={`glass-node ${n.kind}`}>
          {n.id === here && <circle r={mini ? 9 : 22} className="glass-here" />}
          {n.kind === "switch" ? (
            <rect x={mini ? -6 : -14} y={mini ? -4 : -9} width={mini ? 12 : 28} height={mini ? 8 : 18} rx={2} />
          ) : n.kind === "router" ? (
            <polygon points={mini ? "0,-6 6,0 0,6 -6,0" : "0,-14 14,0 0,14 -14,0"} />
          ) : (
            <circle r={mini ? 5 : 11} />
          )}
          {!mini && (
            <text y={30} textAnchor="middle" className="glass-name">
              {n.id}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function WorldMap() {
  const cleared = useProgress((s) => s.cleared);
  const roomId = useSession((s) => s.roomId);
  const current = roomId ? roomById(roomId)?.floor : undefined;
  const floorDone = (n: number) => {
    const boss = floorDefs.find((f) => f.floor === n)?.boss;
    return n === 0 ? !!cleared["p.first-message"] : !!(boss && cleared[boss]);
  };
  const firstOpen = Object.values(floors).find((f) => !floorDone(f.n))?.n;
  return (
    <div className="glass-world">
      {Object.values(regions).map((r) => (
        <section key={r.n} className="glass-region">
          <h3>{r.name}</h3>
          <ul>
            {Object.values(floors)
              .filter((f) => f.region === r.n)
              .map((f) => {
                const state =
                  f.n === current
                    ? "here"
                    : floorDone(f.n)
                      ? "restored"
                      : f.n === firstOpen
                        ? "open"
                        : firstOpen !== undefined && f.n === firstOpen + 1
                          ? "mist"
                          : "fog";
                return (
                  <li key={f.n} data-state={state}>
                    {f.n === 0 ? f.name : `${f.n} · ${f.name}`}
                    <span className="panel-note"> {voice.glass.states[state]}</span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
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
    <div className="glass-replay-view">
      <FloorMap
        room={room}
        mini={false}
        replaying={hop ? { from: hop.from, to: hop.to, t: Math.min(at - step, 1) } : null}
      />
      <ol className="replay-steps">
        {hops.slice(0, step + 1).map((h) => (
          <li key={h.frameId}>
            <strong>{fill(voice.replay.hop, { from: h.from, to: h.to })}</strong>{" "}
            <span className="panel-note">{messageSummary(h.bytes, room.floor)}</span>
            {h.decision && <p className="note">{keeperSays(h.decision, h.dropped)}</p>}
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

export function Glass() {
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"floor" | "world">("floor");
  const replay = useSession((s) => s.replay);
  const setReplay = useSession((s) => s.setReplay);
  // A replay opens the Glass on it; closing the Glass ends it.
  useEffect(() => {
    if (replay !== null) setOpen(true);
  }, [replay]);
  // Never under the open console (UI-02).
  const raised = useSession((s) => s.consoleOpen && s.voiceGiven);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.closest(".console"))) return;
      if (e.key === "g" || e.key === "G") setOpen((o) => !o);
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!room) return null;
  return (
    <>
      <button
        type="button"
        className="mini-glass"
        data-raised={raised ? "yes" : "no"}
        data-tour="glass"
        onClick={() => setOpen(true)}
        aria-label={voice.glass.open}
      >
        <FloorMap room={room} mini />
      </button>
      {open && replay !== null && (
        <section className="glass" aria-label={voice.replay.title}>
          <nav className="menu-tabs">
            <span className="glass-label">{voice.replay.title}</span>
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
        <section className="glass" aria-label={voice.glass.title}>
          <nav className="menu-tabs">
            <button type="button" aria-pressed={view === "floor"} onClick={() => setView("floor")}>
              {voice.glass.thisFloor}
            </button>
            <button type="button" aria-pressed={view === "world"} onClick={() => setView("world")}>
              {voice.glass.world}
            </button>
            <button type="button" className="quiet" onClick={() => setOpen(false)}>
              {voice.glass.close}
            </button>
          </nav>
          {view === "floor" ? <FloorMap room={room} mini={false} /> : <WorldMap />}
        </section>
      )}
    </>
  );
}
