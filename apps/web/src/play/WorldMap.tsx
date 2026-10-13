import { fill, floors, memoryText, regions } from "@wirelight/content";
import { floorDefs, roomById } from "@wirelight/rooms";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";

// The world map (0039): the Deep Network, drawn as the way down. Each region is a place, its floors
// the steps of a winding stair; restored floors glow, the floor you're on is ringed, the next one
// waits in thin mist, and what's further down lies under fog (still readable: the fog is drawn behind
// the words, never over them). Three uses: the Glass's second view, a memory's "what's next" (the
// map as it was then: floors up to `restoredUpTo` restored, the next in mist), and the ending's
// backdrop (`WorldBackdrop`: every built floor restored, the deeper network in mist).

export type FloorState = "restored" | "here" | "open" | "mist" | "fog";

const W = 1000;
const CARD_W = 480;
const CARD_H = 200;

type Placed = { n: number; x: number; y: number; region: number };
type Place = { n: number; x: number; y: number; w: number; h: number };

/**
 * Every floor's place: the regions are four places, two by two, read like a page (the way down
 * winds from the Overgrown Halls to the Cathedral); each region's floors are a stair going down.
 */
function places(): { regions: Place[]; floors: Placed[]; bottom: number } {
  const out: Placed[] = [];
  const cards: Place[] = [];
  Object.values(regions).forEach((r, i) => {
    const x0 = 10 + (i % 2) * (CARD_W + 30);
    const y0 = 56 + Math.floor(i / 2) * (CARD_H + 22);
    cards.push({ n: r.n, x: x0, y: y0, w: CARD_W, h: CARD_H });
    const fs = Object.values(floors).filter((f) => f.region === r.n);
    fs.forEach((f, j) => {
      out.push({ n: f.n, x: x0 + 42 + j * (fs.length > 2 ? 140 : 200), y: y0 + 74 + j * 46, region: r.n });
    });
  });
  const bottom = Math.max(...cards.map((c) => c.y + c.h));
  return { regions: cards, floors: out, bottom };
}

/** Each floor's state from progress (the Glass), or as it was at a memory (`restoredUpTo`). */
export function floorStates(
  cleared: Record<string, unknown>,
  current: number | undefined,
  restoredUpTo?: number,
): Record<number, FloorState> {
  const out: Record<number, FloorState> = {};
  const list = Object.values(floors).map((f) => f.n);
  if (restoredUpTo !== undefined) {
    for (const n of list) out[n] = n <= restoredUpTo ? "restored" : n === restoredUpTo + 1 ? "mist" : "fog";
    return out;
  }
  const done = (n: number) => {
    const boss = floorDefs.find((f) => f.floor === n)?.boss;
    return n === 0 ? !!cleared["p.first-message"] : !!(boss && cleared[boss]);
  };
  const firstOpen = list.find((n) => !done(n));
  for (const n of list)
    out[n] =
      n === current
        ? "here"
        : done(n)
          ? "restored"
          : n === firstOpen
            ? "open"
            : firstOpen !== undefined && n === firstOpen + 1
              ? "mist"
              : "fog";
  return out;
}

export function WorldMapView({
  states,
  variant,
}: {
  states: Record<number, FloorState>;
  variant: "glass" | "memory" | "ending";
}) {
  const p = places();
  const H = p.bottom + 64;
  const t = memoryText.world;
  const restored = Object.values(states).filter((s) => s === "restored" || s === "here").length;
  const total = Object.keys(states).length;
  const at = (n: number) => p.floors.find((f) => f.n === n);
  const regionState = (r: number) => {
    const fs = p.floors.filter((f) => f.region === r).map((f) => states[f.n]);
    if (fs.every((s) => s === "restored")) return "restored";
    if (fs.some((s) => s === "restored" || s === "here" || s === "open")) return "open";
    if (fs.some((s) => s === "mist")) return "mist";
    return "fog";
  };
  const deeperMist = variant === "ending" || states[9] === "restored";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="world-map"
      data-variant={variant}
      role="img"
      aria-label={fill(t.label, { restored: String(restored), total: String(total) })}
    >
      <defs>
        <filter id="world-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <radialGradient id="world-glow">
          <stop offset="0" className="world-glow-in" />
          <stop offset="1" className="world-glow-out" />
        </radialGradient>
      </defs>
      <text x={24} y={34} className="world-title">
        {t.title}
      </text>
      {/* The places. */}
      {p.regions.map((r) => {
        const s = regionState(r.n);
        return (
          <g key={r.n} className="world-region" data-state={s}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={18} className="world-place" />
            {(s === "fog" || s === "mist") && (
              <g filter="url(#world-blur)" className="world-fog">
                <ellipse cx={r.x + r.w * 0.3} cy={r.y + r.h * 0.55} rx={r.w * 0.3} ry={r.h * 0.3} />
                <ellipse cx={r.x + r.w * 0.7} cy={r.y + r.h * 0.5} rx={r.w * 0.3} ry={r.h * 0.28} />
              </g>
            )}
            <text x={r.x + 20} y={r.y + 32} className="world-region-name">
              {regions[r.n]?.name}
            </text>
          </g>
        );
      })}
      {/* The stair down: each floor to the next. */}
      {p.floors.slice(1).map((f, i) => {
        const a = p.floors[i] as Placed;
        const lit =
          (states[a.n] === "restored" || states[a.n] === "here") &&
          (states[f.n] === "restored" || states[f.n] === "here");
        return (
          <path
            key={`p${f.n}`}
            d={`M${a.x},${a.y} C${a.x},${(a.y + f.y) / 2} ${f.x},${(a.y + f.y) / 2} ${f.x},${f.y}`}
            className={lit ? "world-way lit" : "world-way"}
          />
        );
      })}
      {p.floors.map((f) => {
        const s = states[f.n] ?? "fog";
        const name = floors[f.n]?.name ?? "";
        return (
          <g key={f.n} transform={`translate(${f.x},${f.y})`} className="world-floor" data-state={s}>
            {(s === "restored" || s === "here") && <circle r={26} fill="url(#world-glow)" />}
            {s === "mist" && <circle r={22} className="world-mist" filter="url(#world-blur)" />}
            <circle r={9} className="world-step" />
            {s === "here" && <circle r={15} className="world-here" />}
            <text x={18} y={-2} textAnchor="start" className="world-floor-name">
              {f.n === 0 ? name : `${f.n} · ${name}`}
            </text>
            <text x={18} y={14} textAnchor="start" className="world-floor-state">
              {t.states[s]}
            </text>
          </g>
        );
      })}
      {/* Deeper still, under the last region. */}
      {(() => {
        const last = p.regions.at(-1) as Place;
        const cx = last.x + last.w / 2;
        const from = at(9);
        return (
          <g className="world-deeper" data-state={deeperMist ? "mist" : "fog"}>
            <ellipse cx={cx} cy={p.bottom + 26} rx={200} ry={20} filter="url(#world-blur)" className="world-fog-deep" />
            {from && (
              <path
                d={`M${from.x},${from.y} C${from.x},${p.bottom + 10} ${cx},${p.bottom} ${cx},${p.bottom + 22}`}
                className="world-way faint"
              />
            )}
            <text x={cx} y={p.bottom + 50} textAnchor="middle" className="world-deeper-name">
              {t.deeper}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

/** The Glass's world view: from progress, the floor you're on ringed. */
export function WorldMap() {
  const cleared = useProgress((s) => s.cleared);
  const roomId = useSession((s) => s.roomId);
  const current = roomId ? roomById(roomId)?.floor : undefined;
  return (
    <div className="glass-world">
      <WorldMapView states={floorStates(cleared, current)} variant="glass" />
    </div>
  );
}

/** The ending's backdrop (END1, agent A): the whole map, every built floor restored, the deeper mist. */
export function WorldBackdrop() {
  const states = floorStates({}, undefined, Math.max(...floorDefs.map((f) => f.floor)));
  return (
    <div className="world-backdrop">
      <WorldMapView states={states} variant="ending" />
    </div>
  );
}
