import { fill, memoryText, voice } from "@wirelight/content";
import { floorDefs, type RoomDef, roomById } from "@wirelight/rooms";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "../progress/motion";
import { geometry, MemoryMap } from "./MemoryMap";
import { Envelope, MapText } from "./MemoryScene";
import type { Look } from "./memoryScenes";
import type { Beat, Door, Ride } from "./ride";

// A ride-along (0036, 0066): the floor's own idea, followed step by step from a real trace
// (`ride.ts` runs the floor's ride script headless). Each step moves every copy of the message across
// its cable at once (a flood fans out; a loop multiplies), then rests so the header card can be read.
// The card sits beside the map, never over it, and shows only what the floor has taught: the
// message's doors (Floor 1), the frame (Floor 2), the house addresses alone (Floor 5, before the
// frame is opened in 6.1), frame and packet (Floor 6), the countdown (Floor 8; TTL on Floor 9).
// Steps through a switch on the long roads of Floors 8 and 9 pass quickly; "Next crossing" skips
// ahead. Pause, step back and forward, again. Reduced motion: each step is shown still.

const MOVE_MS = 1300;
const REST_MS = 1900;
const QUICK_MS = 500;
const LEG_GAP_MS = 1400;

type Flat = { leg: number; beat: Beat; quick: boolean };

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

function lookOf(b: Beat, floor: number): Look {
  const h = b.headers;
  if (h.ask) return h.ask.op === "who-has" ? "question" : "answer";
  if (h.dhcp) return h.frame.to.everyone ? "broadcast" : "framed";
  if (h.packet) return floor === 5 ? "packet" : floor >= 6 ? "framed" : "frame";
  if (floor <= 1) return "dot";
  return h.frame.to.everyone ? "broadcast" : "frame";
}

/** The headers on the message, as much as this floor has taught (nothing before it's taught). */
function Card({ beat, room, names }: { beat: Beat; room: RoomDef; names: Map<string, string> }) {
  const r = voice.ride;
  const m = memoryText.ride;
  const floor = room.floor;
  const h = beat.headers;
  // Door names' own names (MACs) from Floor 2, where they're taught, to Floor 5; after that the
  // door names alone keep the card short.
  const mac = (d: Door) => (floor >= 2 && floor <= 5 && !d.everyone && d.device ? d.mac : undefined);
  const house = (ip: string) =>
    ip === "0.0.0.0" ? m.nobody : ip === "255.255.255.255" ? m.all : names.has(ip) ? `${ip} (${names.get(ip)})` : ip;
  const frame = floor !== 5 && (
    <div className="ride-layer">
      <strong>{floor >= 2 ? r.frame : r.message}</strong>
      <Row label={r.from} value={doorName(h.frame.from)} note={mac(h.frame.from)} changed={beat.changed.frameFrom} />
      <Row label={r.to} value={doorName(h.frame.to)} note={mac(h.frame.to)} changed={beat.changed.frameTo} />
      {h.words && floor >= 2 && floor <= 4 && <Row label={m.words} value={`“${h.words}”`} changed={false} />}
    </div>
  );
  return (
    <div className="ride-card">
      {frame}
      {h.ask && (
        <div className="ride-layer">
          <strong>{m.question}</strong>
          <p className="ride-plain">
            {h.ask.op === "who-has"
              ? fill(m.whoHas, { ip: h.ask.ip, tell: h.ask.tell })
              : fill(m.isAt, { ip: h.ask.ip })}
          </p>
        </div>
      )}
      {h.packet && floor >= 5 && (
        <div className="ride-layer">
          <strong>{floor >= 6 ? r.packet : m.letter}</strong>
          <Row label={r.from} value={house(h.packet.from)} changed={beat.changed.packetFrom} />
          <Row label={r.to} value={house(h.packet.to)} changed={beat.changed.packetTo} />
          {floor >= 8 && (
            <Row
              label={floor >= 9 ? r.ttl : r.countdown}
              value={String(h.packet.ttl)}
              note={beat.ttlWas !== undefined ? fill(r.was, { value: String(beat.ttlWas) }) : undefined}
              changed={beat.changed.ttl}
            />
          )}
        </div>
      )}
      {h.dhcp && (
        <div className="ride-layer">
          <strong>{m.registry}</strong>
          <p className="ride-plain">{h.dhcp}</p>
        </div>
      )}
    </div>
  );
}

function Desk({ beat, floor }: { beat: Beat; floor: number }) {
  const d = beat.desk;
  const m = memoryText.ride;
  if (!d) return null;
  if (d.kind === "ledger" && floor >= 3 && floor <= 4)
    return (
      <div className="ride-desk">
        <strong>{fill(m.ledger, { device: d.device })}</strong>
        {d.learned && <p>{fill(m.learned, { who: d.learned.who ?? d.learned.mac, port: d.learned.port })}</p>}
        <p>{d.known && !d.flood ? fill(m.knows, { port: d.known.port }) : m.noLine}</p>
      </div>
    );
  if (d.kind === "board" && floor >= 8)
    return (
      <div className="ride-desk">
        <strong>{fill(m.board, { device: d.device })}</strong>
        <p>
          {d.route
            ? fill(d.route.via ? m.routeVia : m.route, { dst: d.route.dst, via: d.route.via ?? "", dev: d.route.dev })
            : m.noRoute}
        </p>
      </div>
    );
  return null;
}

export function RideAlong({ floor }: { floor: number }) {
  const still = useReducedMotion();
  const [ride, setRide] = useState<Ride | null | undefined>(undefined);
  const [i, setI] = useState(0);
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const pos = useRef({ i: 0, t: 0 });

  // The trace is recorded on first use (the rooms runner runs the floor's ride script headless).
  useEffect(() => {
    let live = true;
    void import("./ride").then((m) => {
      if (live) setRide(m.recordRide(floor));
    });
    return () => {
      live = false;
    };
  }, [floor]);

  const fallbackRoom = roomById(floorDefs.find((f) => f.floor === floor)?.boss ?? "");
  const room = ride?.room ?? fallbackRoom;
  const geo = useMemo(() => (room ? geometry(room.topology, room.playerDevice) : null), [room]);
  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const d of room?.topology.devices ?? [])
      for (const a of d.addrs ?? []) out.set(a.cidr.split("/")[0] ?? "", d.id);
    return out;
  }, [room]);
  const flat: Flat[] = useMemo(() => {
    const out: Flat[] = [];
    ride?.legs.forEach((l, leg) => {
      for (const beat of l.beats)
        out.push({ leg, beat, quick: floor >= 8 && (beat.note === "known" || beat.note === "passed") });
    });
    return out;
  }, [ride, floor]);
  const restOf = (k: number) => {
    const f = flat[k];
    if (!f) return REST_MS;
    const lastOfLeg = flat[k + 1]?.leg !== f.leg;
    return (f.quick ? QUICK_MS : REST_MS) + (lastOfLeg && k + 1 < flat.length ? LEG_GAP_MS : 0);
  };

  // The clock: each step moves, then rests; then the next.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restOf reads the same flat list
  useEffect(() => {
    if (paused || flat.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      let next = still && pos.current.t < MOVE_MS ? MOVE_MS : pos.current.t + dt;
      if (next >= MOVE_MS + restOf(pos.current.i)) {
        if (pos.current.i + 1 < flat.length) {
          pos.current.i += 1;
          next = still ? MOVE_MS : 0;
        } else {
          next = MOVE_MS + restOf(pos.current.i);
          setPaused(true);
        }
      }
      pos.current.t = next;
      setT(next);
      setI(pos.current.i);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, flat, still]);

  if (!room || !geo) return null;
  if (ride === undefined) return <p className="panel-note memory-wait">{voice.ride.remembering}</p>;
  const step = flat[i];
  if (!step) return <p className="panel-note memory-wait">{voice.ride.faint}</p>;

  const go = (k: number) => {
    pos.current = { i: Math.max(0, Math.min(flat.length - 1, k)), t: still ? MOVE_MS : 0 };
    setI(pos.current.i);
    setT(pos.current.t);
  };
  const beat = step.beat;
  const legs = ride?.legs ?? [];
  const leg = legs[step.leg];
  const legBeats = flat.filter((f) => f.leg === step.leg);
  const n = legBeats.indexOf(step) + 1;
  const along = still ? 0.55 : Math.min(1, t / MOVE_MS);
  const arrived = still || t >= MOVE_MS;
  const eased = along * along * (3 - 2 * along);
  const look = lookOf(beat, room.floor);
  const title = leg ? memoryText.ride.legs[room.floor]?.[leg.id] : undefined;
  const crossingAhead = flat.findIndex((f, k) => k > i && f.beat.note === "crossing");
  const streets = room.floor >= 8 ? Math.max(...flat.map((f) => f.beat.street)) + 1 : 0;
  const homeward = flat.slice(0, i + 1).some((f) => f.beat.note === "turn");
  const seen = new Set(flat.slice(0, i).map((f) => f.beat.street));
  const fates = beat.copies.filter((c) => c.fate === "in" || c.fate === "fell" || c.fate === "lost");
  const fateList =
    fates.length > 4
      ? []
      : fates.map(
          (c) =>
            `${c.to}: ${c.fate === "in" ? memoryText.ride.fate.in : c.fate === "fell" ? memoryText.ride.fate.fell : memoryText.ride.fate.lost}`,
        );

  return (
    <div className="ride">
      <div className="ride-stage">
        <MemoryMap
          room={room}
          geo={geo}
          label={voice.memory.map}
          state={{ active: new Set(beat.copies.map((c) => c.link)) }}
        >
          {beat.copies.map((c, k) => {
            const end = geo.nodes.get(c.to);
            const fell = c.fate === "fell" || c.fate === "lost";
            const f = fell ? Math.min(eased, 0.82) : eased;
            const p = geo.along(c.link, c.from, f);
            const after = t - MOVE_MS;
            const fade = !still && arrived && after > 0 ? Math.max(0, 1 - after / 900) : 1;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: copies are fixed per step
              <g key={k}>
                {(!arrived || fell || still || c.fate !== "in") && (
                  <Envelope look={look} at={p} opacity={fell && arrived && !still ? 0.25 + 0.75 * fade : 1} />
                )}
                {arrived && c.fate === "in" && end && (
                  <circle
                    cx={end.x}
                    cy={end.y}
                    r={still ? 20 : 16 + 10 * (1 - fade)}
                    className="mem-taken"
                    opacity={still ? 0.8 : fade}
                  />
                )}
                {arrived && fell && beat.copies.length <= 4 && (
                  <MapText at={{ x: p.x, y: p.y + 26 }} kind="fate">
                    {memoryText.scene.letFall}
                  </MapText>
                )}
              </g>
            );
          })}
        </MemoryMap>
      </div>
      <aside className="ride-side" aria-live="polite">
        {legs.length > 1 && (
          <p className="ride-leg-count">
            {fill(memoryText.ride.leg, { n: String(step.leg + 1), total: String(legs.length) })}
          </p>
        )}
        {title && <h3 className="ride-leg-title">{title}</h3>}
        {legBeats.length > 1 && (
          <p className="ride-step">
            {fill(memoryText.ride.step, { n: String(n), total: String(legBeats.length) })}
            {beat.copies.length === 1 &&
              ` · ${fill(voice.ride.hop, { from: beat.copies[0]?.from ?? "", to: beat.copies[0]?.to ?? "" })}`}
          </p>
        )}
        {streets > 1 && (
          <ol className="ride-streets" aria-label={fill(memoryText.ride.street, { n: String(beat.street + 1) })}>
            {Array.from({ length: streets }, (_, s) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: streets are numbered
              <li key={s} data-on={s === beat.street ? "yes" : seen.has(s) ? "past" : "no"}>
                {fill(memoryText.ride.street, { n: String(s + 1) })}
              </li>
            ))}
          </ol>
        )}
        {streets > 1 && homeward && <p className="ride-step">{memoryText.ride.homeward}</p>}
        <Card beat={beat} room={room} names={names} />
        {beat.note && !(beat.note === "sent" && arrived) && (
          <p className="ride-note">{memoryText.ride.note[beat.note]}</p>
        )}
        <Desk beat={beat} floor={room.floor} />
        {arrived && fateList.length > 0 && (
          <ul className="ride-fates">
            {fateList.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        {beat.copies.length > 4 && (
          <p className="ride-note">{fill(memoryText.ride.copies, { n: String(beat.copies.length) })}</p>
        )}
        {leg?.endless && i === flat.length - 1 && arrived && <p className="ride-note">{memoryText.ride.endless}</p>}
      </aside>
      <div className="ride-bar">
        <button type="button" className="quiet" onClick={() => go(i - 1)} disabled={i === 0}>
          {voice.ride.back}
        </button>
        <button type="button" className="quiet" onClick={() => setPaused((p) => !p)}>
          {paused ? voice.ride.play : voice.ride.pause}
        </button>
        <button type="button" className="quiet" onClick={() => go(i + 1)} disabled={i + 1 >= flat.length}>
          {voice.ride.forward}
        </button>
        {streets > 1 && (
          <button type="button" className="quiet" onClick={() => go(crossingAhead)} disabled={crossingAhead < 0}>
            {memoryText.ride.nextCrossing}
          </button>
        )}
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
