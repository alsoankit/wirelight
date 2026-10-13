import { fill, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "../progress/motion";
import { FloorMap, layout, MAP_H, MAP_W } from "./Glass";
import type { Door, Ride, RideStop } from "./ride";

// A ride-along (0036, tech/rendering.md): the floor in the memory's grade, and one message followed
// hop by hop from a real trace (`ride.ts` runs the room's solution headless). Beside the moving
// message, a header card: the frame's from and to (door names) and, from Floor 5, the packet's
// addresses, and from Floor 8 its countdown, with what changed since the hop before. Pause, step
// back and forward, again. Reduced motion: the message steps from door to door without moving.

const MOVE_MS = 1100;
const DWELL_MS = 1500;

function doorName(d: Door): string {
  if (d.everyone) return voice.ride.everyone;
  if (d.device && d.iface) return fill(voice.ride.door, { device: d.device, door: d.iface });
  return d.mac;
}

function Row({ label, value, note, changed }: { label: string; value: string; note?: string; changed: boolean }) {
  return (
    <div className="ride-row" data-changed={changed ? "yes" : "no"}>
      <span className="ride-label">{label}</span>
      <span className="ride-value">
        {value}
        {note && <small> {note}</small>}
      </span>
      {changed && <em className="ride-new">{voice.ride.changed}</em>}
    </div>
  );
}

/** The headers on the message, as much as this floor has taught (nothing before it's taught). */
function Card({ stop, floor }: { stop: RideStop; floor: number }) {
  const r = voice.ride;
  const mac = (d: Door) => (floor >= 2 && !d.everyone && d.device ? d.mac : undefined);
  return (
    <div className="ride-card">
      <div className="ride-layer">
        <strong>{floor >= 2 ? r.frame : r.message}</strong>
        <Row
          label={r.from}
          value={doorName(stop.frame.from)}
          note={mac(stop.frame.from)}
          changed={stop.changed.frameFrom}
        />
        <Row label={r.to} value={doorName(stop.frame.to)} note={mac(stop.frame.to)} changed={stop.changed.frameTo} />
      </div>
      {floor >= 5 && stop.packet && (
        <div className="ride-layer">
          <strong>{floor >= 6 ? r.packet : r.addresses}</strong>
          <Row label={r.from} value={stop.packet.from} changed={stop.changed.packetFrom} />
          <Row label={r.to} value={stop.packet.to} changed={stop.changed.packetTo} />
          {floor >= 8 && (
            <Row
              label={floor >= 9 ? r.ttl : r.countdown}
              value={String(stop.packet.ttl)}
              note={stop.ttlWas !== undefined ? fill(r.was, { value: String(stop.ttlWas) }) : undefined}
              changed={stop.changed.ttl}
            />
          )}
        </div>
      )}
      {stop.change && <p className="ride-note">{r.change[stop.change]}</p>}
    </div>
  );
}

export function RideAlong({ roomId }: { roomId: string }) {
  const still = useReducedMotion();
  const [ride, setRide] = useState<Ride | null | undefined>(undefined);
  const [step, setStep] = useState(0);
  const [t, setT] = useState(0); // 0..1 moving along the cable, then up to 1 + DWELL/MOVE resting
  const [paused, setPaused] = useState(false);
  const last = useRef(0);
  const pos = useRef({ step: 0, t: 0 });

  // The trace is recorded on first use (the rooms runner, loaded only when a ride is shown).
  useEffect(() => {
    let live = true;
    void import("./ride").then((m) => {
      if (live) setRide(m.recordRide(roomId));
    });
    return () => {
      live = false;
    };
  }, [roomId]);

  const stops = ride?.stops ?? [];
  const room = ride?.room ?? roomById(roomId);
  const nodes = useMemo(() => (room ? layout(room.topology, room.playerDevice, MAP_W, MAP_H) : null), [room]);
  const end = 1 + DWELL_MS / MOVE_MS;

  // The clock: moves along each hop, rests to read the card, then the next hop.
  useEffect(() => {
    if (paused || stops.length === 0) return;
    let raf = 0;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = now - last.current;
      last.current = now;
      let next = still && pos.current.t < 1 ? 1 : pos.current.t + dt / MOVE_MS;
      if (next >= end) {
        if (pos.current.step + 1 < stops.length) {
          pos.current.step += 1;
          next = still ? 1 : 0;
        } else {
          next = end;
          setPaused(true);
        }
      }
      pos.current.t = next;
      setT(next);
      setStep(pos.current.step);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, stops.length, still, end]);

  // The card sits beside the cable being crossed, where it covers the fewest machines. It's placed
  // in screen pixels (so its text stays its own size), once per hop and on resize: calm, not chasing.
  const box = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the box appears once the ride is recorded
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ride]);
  const hop = stops[step];
  // biome-ignore lint/correctness/useExhaustiveDependencies: placed again on a new hop or a resize
  useLayoutEffect(() => {
    const el = box.current;
    const c = card.current;
    const svg = el?.querySelector("svg");
    const from = hop && nodes?.get(hop.from);
    const to = hop && nodes?.get(hop.to);
    if (!el || !c || !svg || !from || !to || !nodes) return;
    const r = svg.getBoundingClientRect();
    const o = el.getBoundingClientRect();
    const k = Math.min(r.width / MAP_W, r.height / MAP_H);
    const ox = r.left - o.left + (r.width - MAP_W * k) / 2;
    const oy = r.top - o.top + (r.height - MAP_H * k) / 2;
    const screen = (n: { x: number; y: number }) => ({ x: ox + n.x * k, y: oy + n.y * k });
    const m = screen({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
    const w = c.offsetWidth;
    const h = c.offsetHeight;
    const gap = 28;
    const clamp = (p: { x: number; y: number }) => ({
      x: Math.min(Math.max(p.x, 8), o.width - w - 8),
      y: Math.min(Math.max(p.y, 8), r.bottom - o.top - h - 8),
    });
    const candidates = [
      { x: m.x - w / 2, y: m.y - gap - h },
      { x: m.x - w / 2, y: m.y + gap },
      { x: m.x + gap, y: m.y - h / 2 },
      { x: m.x - gap - w, y: m.y - h / 2 },
      { x: m.x + gap, y: m.y - gap - h },
      { x: m.x - gap - w, y: m.y - gap - h },
      { x: m.x + gap, y: m.y + gap },
      { x: m.x - gap - w, y: m.y + gap },
    ].map(clamp);
    const points = [...nodes.values()].map(screen);
    const cable = [0, 0.25, 0.5, 0.75, 1].map((f) =>
      screen({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }),
    );
    const covers = (p: { x: number; y: number }, q: { x: number; y: number }, pad: number) =>
      q.x > p.x - pad && q.x < p.x + w + pad && q.y > p.y - pad && q.y < p.y + h + pad;
    const score = (p: { x: number; y: number }) =>
      points.filter((q) => covers(p, q, 30)).length + 3 * cable.filter((q) => covers(p, q, 12)).length;
    const best = candidates.reduce((x, c2) => (score(c2) < score(x) ? c2 : x));
    setPlace(best);
  }, [hop, nodes, size]);

  if (!room || !nodes) return null;
  if (ride === undefined) return <p className="panel-note memory-wait">{voice.ride.remembering}</p>;
  const stop = stops[step];
  if (!stop) return <p className="panel-note memory-wait">{voice.ride.faint}</p>;

  const a = nodes.get(stop.from);
  const b = nodes.get(stop.to);
  const along = Math.min(t, 1);
  const x = a && b ? a.x + (b.x - a.x) * along : 0;
  const y = a && b ? a.y + (b.y - a.y) * along : 0;
  const go = (s: number) => {
    pos.current = { step: Math.max(0, Math.min(stops.length - 1, s)), t: still ? 1 : 0 };
    setStep(pos.current.step);
    setT(pos.current.t);
  };
  const atEnd = t >= 1;

  return (
    <div className="ride" ref={box}>
      <FloorMap room={room} mini={false} memory>
        {a && b && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="ride-path" />}
        <g transform={`translate(${x},${y})`}>
          <circle r={16} className="ride-glow" />
          <circle r={7} className="ride-msg" />
        </g>
      </FloorMap>
      <div
        ref={card}
        className="ride-card-box"
        style={place ? { left: place.x, top: place.y } : { visibility: "hidden" }}
        aria-live="polite"
      >
        <Card stop={stop} floor={room.floor} />
      </div>
      <div className="ride-bar">
        <span className="panel-note">
          {fill(voice.ride.step, { n: String(step + 1), total: String(stops.length) })} ·{" "}
          {fill(voice.ride.hop, { from: stop.from, to: stop.to })}
          {atEnd && stop.end ? ` · ${voice.ride.end[stop.end]}` : ""}
        </span>
        <button type="button" className="quiet" onClick={() => go(step - 1)} disabled={step === 0}>
          {voice.ride.back}
        </button>
        <button type="button" className="quiet" onClick={() => setPaused((p) => !p)}>
          {paused ? voice.ride.play : voice.ride.pause}
        </button>
        <button type="button" className="quiet" onClick={() => go(step + 1)} disabled={step + 1 >= stops.length}>
          {voice.ride.forward}
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            go(0);
            setPaused(false);
          }}
        >
          {voice.ride.again}
        </button>
      </div>
    </div>
  );
}
