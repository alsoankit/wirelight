import type { RoomDef } from "@wirelight/rooms";
import type { Topology } from "@wirelight/sim";
import type { ReactNode } from "react";

// The map a memory and a ride-along are drawn on (0066): the floor as it was, in the memory's sepia
// grade, laid out compactly so the picture fills its panel (a long road of crossings folds back on
// itself in two rows), two cables between the same machines drawn as two curves, every label with a
// dark halo so it stays readable where lines cross it. Pictures draw on top through `children`.

export type MapNode = { id: string; x: number; y: number; kind: "you" | "switch" | "router" | "house" };
export type MapLink = { id: string; a: string; ai: string; b: string; bi: string; bend: number };
export type Pt = { x: number; y: number };

export type Geometry = {
  nodes: Map<string, MapNode>;
  links: Map<string, MapLink>;
  box: { x: number; y: number; w: number; h: number };
  /** A point along a cable, `t` from 0 at `from`'s end to 1 at the other. */
  along(link: string, from: string, t: number): Pt;
  /** The door of a machine: a little way along its cable (or beside the machine, if it has none). */
  door(device: string, iface?: string, units?: number): Pt;
  /** The cable between two machines (the first, if there are two). */
  between(a: string, b: string): MapLink | undefined;
  path(link: MapLink): string;
  /** Beside a door: where its name is written (`label`), and the other side of the cable (`under`). */
  sides(device: string, iface?: string): { label: Pt; under: Pt; out: Pt };
  /** The side of a cable a door's name goes on, at that machine: up, unless another cable is there. */
  normal(link: string, device: string): [number, number];
  /** Where a machine's name is written, from the machine. */
  name(device: string): { x: number; y: number; anchor: "start" | "middle" | "end" };
};

/** The unit normal of a direction that points up the screen (where a cable's labels go). */
function upper(dx: number, dy: number): [number, number] {
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return ny > 0 || (ny === 0 && nx > 0) ? [-nx, -ny] : [nx, ny];
}

const COL = 210;
const ROW = 84;
/** Fewer machines to a column: more room between them. */
const rowFor = (rows: number) => (rows <= 3 ? 124 : ROW);
const BAND_COLS = 5;

export function geometry(t: Topology, start: string): Geometry {
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
  const byCol = new Map<number, string[]>();
  for (const d of t.devices) {
    const c = depth.get(d.id) ?? 0;
    byCol.set(c, [...(byCol.get(c) ?? []), d.id]);
  }
  const cols = Math.max(...depth.values()) + 1;
  const bands = cols > 6 ? Math.ceil(cols / BAND_COLS) : 1;
  const perBand = bands > 1 ? BAND_COLS : cols;
  const rows = Math.max(...[...byCol.values()].map((ids) => ids.length));
  const bandH = Math.max(rows, 1) * rowFor(rows) + (bands > 1 ? 70 : 0);
  const nodes = new Map<string, MapNode>();
  // In each column, the busiest machines (switches, crossings) go in the middle.
  const degreeOf = (id: string) => t.links.filter((l) => l.a.device === id || l.b.device === id).length;
  for (const [c, ids] of byCol) {
    const ranked = [...ids].sort((a, b) => degreeOf(b) - degreeOf(a));
    const ordered: string[] = [];
    ranked.forEach((id, k) => {
      if (k % 2 === 0) ordered.push(id);
      else ordered.unshift(id);
    });
    // Keep the original order among the quiet ones (houses read top to bottom as listed).
    if (ranked.every((id) => degreeOf(id) === degreeOf(ranked[0] as string))) ordered.splice(0, ordered.length, ...ids);
    byCol.set(c, ordered);
  }
  for (const [c, ids] of byCol) {
    const band = Math.floor(c / perBand);
    const j = c % perBand;
    const col = band % 2 === 0 ? j : perBand - 1 - j;
    ids.forEach((id, i) => {
      const spec = t.devices.find((d) => d.id === id);
      const kind: MapNode["kind"] =
        id === start
          ? "you"
          : spec?.bridges?.length
            ? "switch"
            : (spec?.interfaces.length ?? 0) > 1
              ? "router"
              : "house";
      nodes.set(id, {
        id,
        kind,
        x: col * (cols <= 2 ? 360 : cols <= 3 ? 260 : COL),
        y: band * bandH + (i - (ids.length - 1) / 2) * rowFor(rows),
      });
    });
  }
  // Two cables between the same machines bend apart.
  const pairs = new Map<string, string[]>();
  for (const l of t.links) {
    const k = [l.a.device, l.b.device].sort().join("|");
    pairs.set(k, [...(pairs.get(k) ?? []), l.id]);
  }
  const links = new Map<string, MapLink>();
  for (const l of t.links) {
    const k = [l.a.device, l.b.device].sort().join("|");
    const group = pairs.get(k) ?? [l.id];
    const i = group.indexOf(l.id);
    const bend = group.length > 1 ? (i - (group.length - 1) / 2) * 56 : 0;
    links.set(l.id, { id: l.id, a: l.a.device, ai: l.a.iface, b: l.b.device, bi: l.b.iface, bend });
  }
  const xs = [...nodes.values()].map((n) => n.x);
  const ys = [...nodes.values()].map((n) => n.y);
  const pad = { l: 80, r: 80, t: 46, b: 50 };
  const box = {
    x: Math.min(...xs) - pad.l,
    y: Math.min(...ys) - pad.t,
    w: Math.max(...xs) - Math.min(...xs) + pad.l + pad.r,
    h: Math.max(...ys) - Math.min(...ys) + pad.t + pad.b,
  };
  const ctrl = (l: MapLink): Pt | null => {
    const a = nodes.get(l.a);
    const b = nodes.get(l.b);
    if (!a || !b || l.bend === 0) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Always bend the same way for the same pair, whichever end is `a`.
    const sign = l.a < l.b ? 1 : -1;
    return {
      x: (a.x + b.x) / 2 + (-dy / len) * l.bend * 2 * sign,
      y: (a.y + b.y) / 2 + (dx / len) * l.bend * 2 * sign,
    };
  };
  const at = (l: MapLink, t: number): Pt => {
    const a = nodes.get(l.a) as MapNode;
    const b = nodes.get(l.b) as MapNode;
    const c = ctrl(l);
    if (!c) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  };
  // A busy machine's door names are staggered along their cables (near, far, near…) so neighbours
  // at narrow angles don't print over each other.
  const hubCache = new Map<string, Map<string, number>>();
  const hubDistance = (device: string, link: string): number => {
    if (degree(device) < 3) return 42;
    let placed = hubCache.get(device);
    if (!placed) {
      const n = nodes.get(device) ?? { x: 0, y: 0 };
      const mine = [...links.values()]
        .filter((x) => x.a === device || x.b === device)
        .map((x) => {
          const q = nodes.get(x.a === device ? x.b : x.a) ?? n;
          return { l: x, angle: Math.atan2(q.y - n.y, q.x - n.x) + x.bend / 1000 };
        })
        .sort((p, q) => p.angle - q.angle);
      // Each name goes near or far along its cable: the choice that keeps the closest two names
      // furthest apart wins (a busy machine has at most a handful of cables: try them all). Never
      // past a third of the way (a short cable between two busy machines).
      const opts = mine.map(({ l }) => {
        const a = nodes.get(l.a) as MapNode;
        const b = nodes.get(l.b) as MapNode;
        const len = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const [nx, ny] = normalAt(l, device);
        return [...new Set([60, 98].map((d) => Math.min(d, len * 0.34)))].map((d) => {
          const pt = at(l, l.a === device ? d / len : 1 - d / len);
          return { d, x: pt.x + nx * 12, y: pt.y + ny * 12 };
        });
      });
      let bestPick: number[] = opts.map(() => 0);
      let bestGap = -1;
      for (let mask = 0; mask < 1 << opts.length; mask++) {
        const pick = opts.map((o, i) => Math.min(o.length - 1, (mask >> i) & 1));
        const pts = pick.map((k, i) => opts[i]?.[k] as { x: number; y: number });
        let gap = 1e9;
        for (let i = 0; i < pts.length; i++)
          for (let j = i + 1; j < pts.length; j++)
            gap = Math.min(
              gap,
              Math.hypot((pts[i]?.x ?? 0) - (pts[j]?.x ?? 0), ((pts[i]?.y ?? 0) - (pts[j]?.y ?? 0)) * 2),
            );
        if (gap > bestGap + 0.5) {
          bestGap = gap;
          bestPick = pick;
        }
      }
      const done = new Map<string, number>();
      mine.forEach(({ l }, i) => {
        done.set(l.id, opts[i]?.[bestPick[i] ?? 0]?.d ?? 60);
      });
      placed = done;
      hubCache.set(device, placed);
    }
    return placed.get(link) ?? 60;
  };
  const degree = (device: string) => [...links.values()].filter((x) => x.a === device || x.b === device).length;
  // Where a machine's name goes: under it, unless a cable leaves downwards; then under and to the
  // side away from its cables.
  const nameAt = (device: string): { x: number; y: number; anchor: "start" | "middle" | "end" } => {
    const n = nodes.get(device) ?? { x: 0, y: 0 };
    const w = (device.length * 9) / 2;
    // The machine's own door names, as boxes.
    const doors = [...links.values()]
      .filter((x) => x.a === device || x.b === device)
      .map((x) => {
        const len =
          Math.hypot(
            (nodes.get(x.a)?.x ?? 0) - (nodes.get(x.b)?.x ?? 0),
            (nodes.get(x.a)?.y ?? 0) - (nodes.get(x.b)?.y ?? 0),
          ) || 1;
        const d = hubDistance(device, x.id) / len;
        const p = at(x, x.a === device ? d : 1 - d);
        const [nx, ny] = normalAt(x, device);
        return { x: p.x + nx * 12, y: p.y + ny * 12 + 4 };
      });
    const candidates: { x: number; y: number; anchor: "start" | "middle" | "end"; l: number; r: number }[] = [
      { x: 0, y: 31, anchor: "middle", l: -w, r: w },
      { x: -8, y: 32, anchor: "end", l: -8 - 2 * w, r: -8 },
      { x: 8, y: 32, anchor: "start", l: 8, r: 8 + 2 * w },
      { x: 0, y: -20, anchor: "middle", l: -w, r: w },
    ];
    const hits = (c: (typeof candidates)[number]) =>
      doors.filter((d) => d.x + 16 > n.x + c.l && d.x - 16 < n.x + c.r && d.y > n.y + c.y - 16 && d.y - 12 < n.y + c.y)
        .length;
    const best = candidates.reduce((p, c) => (hits(c) < hits(p) ? c : p));
    return { x: best.x, y: best.y, anchor: best.anchor };
  };
  // Up from the cable, unless that's where the machine's other cables go: then the other side.
  const normalAt = (l: MapLink, device: string): [number, number] => {
    const n = nodes.get(device) ?? { x: 0, y: 0 };
    const o = nodes.get(l.a === device ? l.b : l.a) ?? { x: n.x + 1, y: n.y };
    const [nx, ny] = upper(o.x - n.x, o.y - n.y);
    const len = Math.hypot(o.x - n.x, o.y - n.y) || 1;
    const dir = [(o.x - n.x) / len, (o.y - n.y) / len];
    let toward = 0;
    for (const x of links.values()) {
      if (x.id === l.id || (x.a !== device && x.b !== device)) continue;
      const q = nodes.get(x.a === device ? x.b : x.a);
      if (!q) continue;
      const ql = Math.hypot(q.x - n.x, q.y - n.y) || 1;
      const qx = (q.x - n.x) / ql;
      const qy = (q.y - n.y) / ql;
      // Only cables leaving at a narrow angle crowd this one's name.
      if (qx * (dir[0] ?? 0) + qy * (dir[1] ?? 0) < 0.6) continue;
      toward += qx * nx + qy * ny;
    }
    return toward > 0 ? [-nx, -ny] : [nx, ny];
  };
  return {
    nodes,
    links,
    box,
    along(link, from, t) {
      const l = links.get(link);
      if (!l) return { x: 0, y: 0 };
      return at(l, l.a === from ? t : 1 - t);
    },
    door(device, iface, units) {
      const l = [...links.values()].find(
        (x) => (x.a === device && (!iface || x.ai === iface)) || (x.b === device && (!iface || x.bi === iface)),
      );
      const n = nodes.get(device) ?? { x: 0, y: 0 };
      if (!l) return { x: n.x + 30, y: n.y };
      const along =
        (units ?? hubDistance(device, l.id)) /
        Math.max(
          40,
          Math.hypot(
            (nodes.get(l.a)?.x ?? 0) - (nodes.get(l.b)?.x ?? 0),
            (nodes.get(l.a)?.y ?? 0) - (nodes.get(l.b)?.y ?? 0),
          ),
        );
      return at(l, l.a === device ? along : 1 - along);
    },
    sides(device, iface) {
      const l = [...links.values()].find(
        (x) => (x.a === device && (!iface || x.ai === iface)) || (x.b === device && (!iface || x.bi === iface)),
      );
      const p = this.door(device, iface);
      if (!l) return { label: { x: p.x, y: p.y - 11 }, under: { x: p.x, y: p.y + 12 }, out: { x: p.x, y: p.y + 26 } };
      const [nx, ny] = normalAt(l, device);
      return {
        label: { x: p.x + nx * 12, y: p.y + ny * 12 + 4 },
        under: { x: p.x - nx * 12, y: p.y - ny * 12 },
        out: { x: p.x - nx * 27, y: p.y - ny * 27 },
      };
    },
    name: nameAt,
    normal(link, device) {
      const l = links.get(link);
      return l ? normalAt(l, device) : [0, -1];
    },
    between(a, b) {
      return [...links.values()].find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    },
    path(l) {
      const a = nodes.get(l.a) as MapNode;
      const b = nodes.get(l.b) as MapNode;
      const c = ctrl(l);
      return c ? `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}` : `M${a.x},${a.y} L${b.x},${b.y}`;
    },
  };
}

/** How far each cable is drawn (0 to 1), and how each machine shows (hidden, dim, lit). */
export type MapState = {
  links?: Map<string, number>;
  nodes?: Map<string, "hidden" | "dim" | "shown" | "lit">;
  /** A machine drawn as something else (Floor 3's hall before it had a keeper: a plain junction). */
  looks?: Record<string, MapNode["kind"] | "junction">;
  /** Cables drawn as a fresh pencil line (a plan), not a laid corridor. */
  drawn?: Set<string>;
  /** The cable a ride is crossing. */
  active?: Set<string>;
};

export function MemoryMap({
  room,
  geo,
  state = {},
  label,
  children,
}: {
  room: RoomDef;
  geo: Geometry;
  state?: MapState;
  label: string;
  children?: ReactNode;
}) {
  const { box } = geo;
  const shown = (id: string) => (state.nodes?.get(id) ?? "shown") !== "hidden";
  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      className="mem-map"
      role="img"
      aria-label={label}
      // Never drawn larger than about 1.3 screen pixels per unit: a small map stays a small picture.
      style={{ aspectRatio: `${box.w} / ${box.h}`, maxWidth: `${Math.round(box.w * 1.3)}px` }}
    >
      <defs>
        <radialGradient id="mem-glow">
          <stop offset="0" stopColor="#ffe9b0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffe9b0" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[...geo.links.values()].map((l) => {
        const drawn = state.links?.get(l.id) ?? 1;
        if (drawn <= 0 || !shown(l.a) || !shown(l.b)) return null;
        const d = geo.path(l);
        const a = geo.door(l.a, l.ai);
        const b = geo.door(l.b, l.bi);
        const [anx, any] = geo.normal(l.id, l.a);
        const [bnx, bny] = geo.normal(l.id, l.b);
        return (
          <g key={l.id} className="mem-link" data-active={state.active?.has(l.id) ? "yes" : "no"}>
            <path
              d={d}
              pathLength={1}
              strokeDasharray={drawn < 1 ? `${drawn} 1` : undefined}
              className={state.drawn?.has(l.id) ? "mem-cable drawn" : "mem-cable"}
            />
            {drawn >= 1 && (
              <>
                <text x={a.x + anx * 12} y={a.y + any * 12 + 4} textAnchor="middle" className="mem-door">
                  {l.ai}
                </text>
                <text x={b.x + bnx * 12} y={b.y + bny * 12 + 4} textAnchor="middle" className="mem-door">
                  {l.bi}
                </text>
              </>
            )}
          </g>
        );
      })}
      {[...geo.nodes.values()].map((n) => {
        const s = state.nodes?.get(n.id) ?? "shown";
        if (s === "hidden") return null;
        const look = state.looks?.[n.id] ?? n.kind;
        return (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} className={`mem-node ${look}`} data-state={s}>
            {s === "lit" && <circle r={34} fill="url(#mem-glow)" className="mem-lit" />}
            {look === "switch" ? (
              <rect x={-15} y={-10} width={30} height={20} rx={3} />
            ) : look === "router" ? (
              <polygon points="0,-15 15,0 0,15 -15,0" />
            ) : look === "junction" ? (
              <circle r={6} />
            ) : (
              <circle r={12} />
            )}
            <text x={geo.name(n.id).x} y={geo.name(n.id).y} textAnchor={geo.name(n.id).anchor} className="mem-name">
              {room.topology.devices.find((d) => d.id === n.id)?.hostname ?? n.id}
            </text>
          </g>
        );
      })}
      {children}
    </svg>
  );
}
