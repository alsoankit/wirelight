import { fill, memoryText, voice } from "@wirelight/content";
import type { RoomDef } from "@wirelight/rooms";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "../progress/motion";
import { type Geometry, geometry, type MapState, MemoryMap, type Pt } from "./MemoryMap";
import type { Beat, Glyph, Look, Scene, Tag, Way } from "./memoryScenes";

// A memory chapter's picture (0066), played from its scene (memoryScenes.ts): machines appear,
// cables are laid, plates, lights and ledgers are set, messages move. Gentle: nothing flickers, each
// thing eases in. Reduced motion: the finished picture, still, each message resting on its way.

/** Milliseconds since the picture started (always "the end" when motion is reduced). */
export function useSceneClock(still: boolean, key: unknown): number {
  const [t, setT] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: restarts for a new chapter
  useEffect(() => {
    if (still) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setT(now - start);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [still, key]);
  return still ? Number.POSITIVE_INFINITY : t;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const fadeIn = (t: number, at: number, ms = 450) => ease((t - at) / ms);

/** A tag's words, its values read from the room (door names, house addresses, door names' MACs). */
export function tagText(tag: Tag, room: RoomDef): string {
  const [key, vars] = typeof tag === "string" ? [tag, {}] : tag;
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) values[k] = resolve(v, room);
  return fill(memoryText.scene[key], values);
}

function resolve(v: string, room: RoomDef): string {
  const [what, dev, iface] = v.split(":");
  const d = room.topology.devices.find((x) => x.id === dev);
  if (what === "@door") return fill(voice.ride.door, { device: dev ?? "", door: iface ?? "eth0" });
  if (what === "@addr") return d?.addrs?.[0]?.cidr.split("/")[0] ?? "";
  if (what === "@mac") return d?.interfaces.find((i) => i.name === (iface ?? "eth0"))?.mac ?? "";
  return v;
}

/** The cables a message crosses, in order. */
function segments(way: Way, geo: Geometry): { link: string; from: string }[] {
  if (!Array.isArray(way)) {
    let at = way.from;
    return way.links.map((link) => {
      const l = geo.links.get(link);
      const seg = { link, from: at };
      if (l) at = l.a === at ? l.b : l.a;
      return seg;
    });
  }
  const out: { link: string; from: string }[] = [];
  for (let i = 0; i + 1 < way.length; i++) {
    const l = geo.between(way[i] as string, way[i + 1] as string);
    if (l) out.push({ link: l.id, from: way[i] as string });
  }
  return out;
}

/** A message, drawn by what it is: a plain message, a frame, a broadcast, a packet, a question. */
export function Envelope({ look, at, opacity = 1 }: { look: Look; at: Pt; opacity?: number }) {
  return (
    <g transform={`translate(${at.x},${at.y})`} opacity={opacity} className={`mem-msg ${look}`}>
      <circle r={15} className="mem-msg-glow" />
      {look === "dot" ? (
        <circle r={6} className="mem-msg-body" />
      ) : look === "packet" ? (
        <>
          <circle r={7} className="mem-msg-body" />
          <circle r={3} className="mem-msg-seal" />
        </>
      ) : (
        <>
          {look === "broadcast" && (
            <path d="M-15,-11 L-20,-15 M15,-11 L20,-15 M0,-12 L0,-18" className="mem-msg-rays" />
          )}
          <rect x={-11} y={-7.5} width={22} height={15} rx={2} className="mem-msg-body" />
          <path d="M-11,-7.5 L0,1 L11,-7.5" className="mem-msg-flap" />
          {look === "framed" && <circle cy={2} r={3.2} className="mem-msg-seal" />}
          {(look === "question" || look === "answer") && (
            <text y={5} textAnchor="middle" className="mem-msg-mark">
              {look === "question" ? "?" : "!"}
            </text>
          )}
        </>
      )}
    </g>
  );
}

/** Words drawn on the map, with a dark loft so they stay readable over lines. */
export function MapText({
  at,
  children,
  kind = "tag",
  anchor = "middle",
  opacity,
}: {
  at: Pt;
  children: ReactNode;
  kind?: string;
  anchor?: "start" | "middle" | "end";
  opacity?: number;
}) {
  return (
    <text x={at.x} y={at.y} textAnchor={anchor} className={`mem-text ${kind}`} opacity={opacity}>
      {children}
    </text>
  );
}

type Sends = Extract<Beat, { send: Way[] }>;

function drawSend(b: Sends, t: number, geo: Geometry, room: RoomDef, key: string, latest: boolean): ReactNode {
  if (t < b.at) return null;
  const hop = b.hop ?? 1100;
  const ways = b.send.map((w) => segments(w, geo)).filter((s) => s.length);
  const longest = Math.max(...ways.map((w) => w.length));
  const travel = longest * hop;
  const still = !Number.isFinite(t);
  let local = still ? travel : t - b.at;
  if (b.repeat && !still) local %= b.repeat;
  const after = local - travel;
  if (after > 900) return null;
  // Still (reduced motion): every message rests on its way; only the latest is labelled.
  const words = b.tag && (latest || !still) ? tagText(b.tag, room) : undefined;
  return (
    <g key={key}>
      {ways.map((segs, wi) => {
        const total = segs.length * hop;
        const lastEnd = b.fate === "fell" ? 0.65 : 1;
        let i: number;
        let f: number;
        if (still) {
          i = segs.length - 1;
          f = b.fate === "fell" ? 0.65 : 0.55;
        } else {
          const l = Math.min(local, total);
          i = Math.min(segs.length - 1, Math.floor(l / hop));
          f = ease((l - i * hop) / hop);
          if (i === segs.length - 1) f *= lastEnd;
        }
        const seg = segs[i];
        if (!seg) return null;
        const p = geo.along(seg.link, seg.from, f);
        const done = !still && local >= total;
        const opacity = done
          ? b.fate === "fell"
            ? 1 - ease((local - total) / 900)
            : 1 - ease((local - total) / 500)
          : 1;
        const hopTag = b.tags?.[i];
        // The words on a moving message fade as it nears a machine, so they never sit on its name or
        // its doors' names.
        const near = Math.min(...[...geo.nodes.values()].map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
        // …and as it passes a door's name.
        const nearDoor = Math.min(
          ...[...geo.links.values()].flatMap((l) =>
            [geo.door(l.a, l.ai), geo.door(l.b, l.bi)].map((d) => Math.hypot(d.x - p.x, d.y - p.y + 22)),
          ),
        );
        const tagOpacity = still ? 1 : Math.min(opacity, ease((near - 48) / 40), ease((nearDoor - 30) / 30));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: ways are fixed per beat
          <g key={wi}>
            <Envelope look={b.look ?? "dot"} at={p} opacity={opacity} />
            {wi === 0 && (words || (hopTag && (latest || !still))) && (
              <MapText at={{ x: p.x, y: p.y - 22 }} kind="msg-tag" opacity={tagOpacity}>
                {[hopTag ? fill(memoryText.scene.countdown, { n: hopTag }) : "", words ?? ""]
                  .filter(Boolean)
                  .join(" · ")}
              </MapText>
            )}
            {done && b.fate === "in" && (
              <circle
                cx={geo.nodes.get(endOf(segs, geo))?.x}
                cy={geo.nodes.get(endOf(segs, geo))?.y}
                r={16 + 14 * ease((local - total) / 700)}
                className="mem-taken"
                opacity={1 - ease((local - total) / 900)}
              />
            )}
            {(done || (still && latest)) && b.fate === "fell" && wi === 0 && (
              <MapText at={{ x: p.x, y: p.y - 22 }} kind="fate">
                {memoryText.scene.letFall}
              </MapText>
            )}
          </g>
        );
      })}
    </g>
  );
}

function endOf(segs: { link: string; from: string }[], geo: Geometry): string {
  const s = segs.at(-1);
  const l = s ? geo.links.get(s.link) : undefined;
  return !s || !l ? "" : l.a === s.from ? l.b : l.a;
}

function drawGlyph(
  m: Extract<Beat, { glyph: Glyph }>,
  t: number,
  geo: Geometry,
  room: RoomDef,
  key: string,
): ReactNode {
  const o = fadeIn(t, m.at);
  const n = geo.nodes.get(m.mark);
  if (!n || o <= 0) return null;
  const sides = geo.sides(m.mark, m.iface);
  const own = [...geo.links.values()].find((l) => l.a === m.mark || l.b === m.mark);
  const iface = m.iface ?? (own ? (own.a === m.mark ? own.ai : own.bi) : "eth0");
  const label = m.label ? tagText(m.label, room) : undefined;
  const lit = !m.off;
  switch (m.glyph) {
    case "plate": {
      if (m.text) {
        return (
          <g key={key} opacity={o}>
            <rect x={n.x - 64} y={n.y + 38} width={128} height={18} rx={3} className="mem-plate" />
            <MapText at={{ x: n.x, y: n.y + 51 }} kind="plate-text">
              {m.text}
            </MapText>
          </g>
        );
      }
      return (
        <g key={key} opacity={o}>
          <rect x={sides.label.x - 21} y={sides.label.y - 12.5} width={42} height={17} rx={3} className="mem-plate" />
          <MapText at={sides.label} kind="plate-text">
            {iface}
          </MapText>
          {label && (
            <MapText
              at={{ x: sides.label.x, y: sides.label.y + (sides.label.y < geo.door(m.mark, m.iface).y ? -19 : 22) }}
              kind="glyph-label"
            >
              {label}
            </MapText>
          )}
        </g>
      );
    }
    case "light": {
      // A small lamp set on the cable just past the door's plate.
      const lamp = geo.door(m.mark, m.iface, 80);
      return (
        <g key={key} opacity={o}>
          {lit && <circle cx={lamp.x} cy={lamp.y} r={10} className="mem-light-glow" />}
          <circle cx={lamp.x} cy={lamp.y} r={4.5} className={lit ? "mem-light on" : "mem-light"} />
          {label && (
            <MapText at={{ x: lamp.x, y: lamp.y + 22 }} kind="glyph-label">
              {label}
            </MapText>
          )}
        </g>
      );
    }
    case "switch": {
      // A switch on the cable, a little further out.
      const at = geo.door(m.mark, m.iface, 116);
      return (
        <g key={key} opacity={o} transform={`translate(${at.x},${at.y})`}>
          <rect x={-9} y={-5} width={18} height={10} rx={5} className={lit ? "mem-switch on" : "mem-switch"} />
          <circle cx={lit ? 4 : -4} r={3.5} className="mem-switch-knob" />
          {!lit && <path d="M-12,8 l2,-1 M-4,10 l1,-1 M6,9 l2,1 M11,6 l1,1" className="mem-dust" />}
          {label && (
            <MapText at={{ x: 0, y: -13 }} kind="glyph-label">
              {label}
            </MapText>
          )}
        </g>
      );
    }
    case "address": {
      const addr = room.topology.devices.find((d) => d.id === m.mark)?.addrs?.[0]?.cidr.split("/")[0] ?? "";
      // A house at the edge, its cables all to the left: the address goes to its right, clear of the
      // next house's cable; otherwise under its name.
      const edge = ![...geo.links.values()].some(
        (l) => (l.a === m.mark || l.b === m.mark) && (geo.nodes.get(l.a === m.mark ? l.b : l.a)?.x ?? 0) >= n.x,
      );
      const a = edge ? { x: n.x + 20, y: n.y + 5 } : { x: n.x, y: n.y + 47 };
      return (
        <g key={key} opacity={o}>
          <MapText at={a} kind="address" anchor={edge ? "start" : "middle"}>
            {addr}
          </MapText>
          {label && (
            <MapText at={{ x: a.x, y: a.y + 15 }} kind="glyph-label" anchor={edge ? "start" : "middle"}>
              {label}
            </MapText>
          )}
        </g>
      );
    }
    default: {
      // Things kept by a machine, drawn just above it (or beside it, when a neighbour sits close above):
      // a ledger, a console, a sign, the registry, a board.
      const beside = [...geo.nodes.values()].some(
        (q) => q.id !== n.id && Math.abs(q.x - n.x) < 60 && n.y - q.y > 0 && n.y - q.y < 110,
      );
      return (
        <g key={key} opacity={o} transform={`translate(${beside ? n.x + 46 : n.x},${beside ? n.y + 4 : n.y - 34})`}>
          {m.glyph === "console" ? (
            <>
              <rect x={-16} y={-12} width={32} height={20} rx={3} className="mem-book" />
              <path d="M-10,-5 h6 M-2,-5 h4 M-10,1 h12" className="mem-runes" />
            </>
          ) : m.glyph === "sign" ? (
            <>
              <path d="M0,10 V-8" className="mem-post" />
              <rect x={-40} y={-20} width={80} height={14} rx={2} className="mem-book" />
              <MapText at={{ x: 0, y: -9 }} kind="plate-text">
                {m.text ?? ""}
              </MapText>
            </>
          ) : m.glyph === "board" ? (
            <>
              <rect x={-16} y={-14} width={32} height={22} rx={2} className="mem-book" />
              <path d="M-10,-8 h14 l3,2 l-3,2 h-14 M-10,1 h12 l3,2 l-3,2 h-12" className="mem-runes" />
            </>
          ) : (
            <>
              <rect x={-13} y={-10} width={26} height={18} rx={2} className="mem-book" />
              <path d="M0,-10 V8 M-9,-5 h6 M-9,-1 h6 M3,-5 h6 M3,-1 h6" className="mem-runes" />
            </>
          )}
          {label && (
            <MapText
              at={{ x: m.glyph === "sign" ? 0 : beside ? 22 : -22, y: m.glyph === "sign" ? -26 : 4 }}
              kind="glyph-label"
              anchor={m.glyph === "sign" ? "middle" : beside ? "start" : "end"}
            >
              {label}
            </MapText>
          )}
        </g>
      );
    }
  }
}

/** What the picture shows at time `t`. */
function mapState(scene: Scene, t: number, geo: Geometry): MapState {
  const nodes = new Map<string, "hidden" | "dim" | "shown" | "lit">();
  const links = new Map<string, number>();
  const drawn = new Set<string>();
  const hide = new Set(scene.hide ?? []);
  const beats = [...scene.beats].sort((a, b) => a.at - b.at);
  for (const id of geo.nodes.keys()) {
    const shows = beats.filter((b) => "show" in b && b.show.includes(id));
    nodes.set(id, hide.has(id) || (shows.length > 0 && !shows.some((b) => b.at <= t)) ? "hidden" : "shown");
  }
  for (const b of beats) {
    if (b.at > t) continue;
    if ("dim" in b) for (const id of b.dim) if (nodes.get(id) !== "hidden") nodes.set(id, "dim");
    if ("glow" in b) for (const id of b.glow) if (nodes.get(id) !== "hidden") nodes.set(id, "lit");
  }
  for (const id of geo.links.keys()) {
    if (hide.has(id)) {
      links.set(id, 0);
      continue;
    }
    const lays = beats.filter((b): b is Extract<Beat, { lay: string[] }> => "lay" in b && b.lay.includes(id));
    if (!lays.length) continue;
    const now = lays.filter((b) => b.at <= t).at(-1);
    if (!now) {
      links.set(id, 0);
      continue;
    }
    links.set(id, now.ms ? ease((t - now.at) / now.ms) : 1);
    if (now.drawn) drawn.add(id);
  }
  return { nodes, links, drawn, looks: scene.looks };
}

export function MemoryScene({ room, scene, label }: { room: RoomDef; scene: Scene; label: string }) {
  const still = useReducedMotion();
  const t = useSceneClock(still, scene);
  const geo = useMemo(() => geometry(room.topology, room.playerDevice), [room]);
  const state = mapState(scene, t, geo);
  const visible = (id: string) => state.nodes?.get(id) !== "hidden";
  const beats = scene.beats;

  // The latest of each mark (a light switched on replaces the same light off).
  const marks = new Map<string, Extract<Beat, { glyph: Glyph }>>();
  for (const b of [...beats].sort((a, c) => a.at - c.at))
    if ("glyph" in b && b.at <= t && visible(b.mark))
      marks.set(`${b.mark}:${b.iface ?? ""}:${b.glyph}:${b.text ? "t" : ""}`, b);

  const ledgers = new Map<string, Extract<Beat, { ledger: string }>[]>();
  for (const b of beats) if ("ledger" in b && b.at <= t) ledgers.set(b.ledger, [...(ledgers.get(b.ledger) ?? []), b]);

  return (
    <MemoryMap room={room} geo={geo} state={state} label={label}>
      {/* The weavers, at the head of the cable they're laying. */}
      {beats.map((b, i) => {
        if (!("lay" in b) || !b.weavers || t < b.at || !b.ms) return null;
        const f = (t - b.at) / b.ms;
        if (f >= 1.15) return null;
        return b.lay.map((id) => {
          const l = geo.links.get(id);
          if (!l) return null;
          const p = geo.along(id, l.a, Math.min(1, ease(f)));
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: beats are fixed
            <g key={`w${i}${id}`} transform={`translate(${p.x},${p.y})`} opacity={1 - ease((f - 1) / 0.15)}>
              <circle r={14} className="mem-weaver-glow" />
              <circle cx={-6} cy={-8} r={3} className="mem-weaver" />
              <circle cx={6} cy={-8} r={3} className="mem-weaver" />
              <MapText at={{ x: 0, y: -18 }} kind="glyph-label" opacity={1 - ease((f - 0.7) / 0.25)}>
                {memoryText.scene.weavers}
              </MapText>
            </g>
          );
        });
      })}
      {/* Calls into nothing: a ring spreading from a machine. */}
      {beats.map((b, i) => {
        if (!("call" in b) || t < b.at || !visible(b.call)) return null;
        const n = geo.nodes.get(b.call);
        if (!n) return null;
        const phase = Number.isFinite(t) ? (b.repeat ? (t - b.at) % b.repeat : t - b.at) : 900;
        if (phase > 2200) return null;
        const f = phase / 2200;
        // biome-ignore lint/suspicious/noArrayIndexKey: beats are fixed
        return <circle key={`c${i}`} cx={n.x} cy={n.y} r={16 + f * 70} className="mem-call" opacity={0.7 * (1 - f)} />;
      })}
      {[...marks.entries()].map(([k, m]) => drawGlyph(m, t, geo, room, k))}
      {[...ledgers.entries()].map(([dev, lines]) => {
        const n = geo.nodes.get(dev);
        if (!n || !visible(dev)) return null;
        // Written above the machine, on the side away from its cables (and inside the picture).
        const left =
          n.x - 150 > geo.box.x &&
          [...geo.links.values()].some(
            (l) => (l.a === dev || l.b === dev) && (geo.nodes.get(l.a === dev ? l.b : l.a)?.x ?? 0) > n.x,
          );
        return (
          <g key={`l${dev}`}>
            {lines.map((b, i) => {
              const fade = b.fadeAt !== undefined && t > b.fadeAt ? 1 - ease((t - b.fadeAt) / 1400) : 1;
              if (fade <= 0) return null;
              return (
                <MapText
                  key={b.line}
                  at={{ x: left ? n.x - 24 : n.x + 24, y: n.y - 70 - (lines.length - 1 - i) * 15 }}
                  kind={b.brass ? "ledger brass" : "ledger"}
                  anchor={left ? "end" : "start"}
                >
                  <tspan opacity={fadeIn(t, b.at) * fade}>{b.line}</tspan>
                </MapText>
              );
            })}
          </g>
        );
      })}
      {beats.map((b, i) =>
        "send" in b
          ? drawSend(b, t, geo, room, `s${i}`, b.at === Math.max(...beats.filter((x) => "send" in x).map((x) => x.at)))
          : null,
      )}
      {beats.map((b, i) => {
        if (!("tag" in b) || "send" in b || t < b.at) return null;
        // "a|b": halfway between two machines.
        const ends = b.tag.split("|").map((id) => geo.nodes.get(id));
        if (ends.some((e) => !e) || !b.tag.split("|").every(visible)) return null;
        const n = {
          x: ends.reduce((x, e) => x + (e?.x ?? 0), 0) / ends.length,
          y: ends.reduce((y, e) => y + (e?.y ?? 0), 0) / ends.length,
        };
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: beats are fixed
          <g key={`t${i}`} opacity={fadeIn(t, b.at, 700)}>
            <MapText at={{ x: n.x, y: b.below ? n.y + 78 : n.y - (b.lift ?? 40) }} kind="caption">
              {tagText(b.label, room)}
            </MapText>
          </g>
        );
      })}
    </MemoryMap>
  );
}
