import { fill, floors, memoryText, regions } from "@wirelight/content";
import { floorDefs, roomById } from "@wirelight/rooms";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { PalaceModel } from "../world/map/PalaceModel";
import type { Look } from "../world/map/palace";

// The world map (0039, 0088, 0092): the Palace of a Thousand Doors on its hill, a small 3D model
// (world/map) beside the words. Restored floors are lit, warm windows and cyan light along the
// cables between them; the floor you're on is marked; the next one waits in thin mist, and what's
// further on lies under fog; the keep (Regions 5–8) stands dark in the mist above. The words are a
// list beside the model, so the map stays readable without the picture. Three uses: the Map's
// second view, a memory's "what's next" (the map as it was then: floors up to `restoredUpTo`
// restored, the next in mist), and the ending's backdrop (`WorldBackdrop`: every built floor
// restored, a faint light climbing the keep).

export type FloorState = "restored" | "here" | "open" | "mist" | "fog";

/** Each floor's state from progress (the Map), or as it was at a memory (`restoredUpTo`). */
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

/** How each state looks on the palace: lit when restored, half lit where you are, dark ahead, then mist. */
const LOOK: Record<FloorState, Look> = { restored: "lit", here: "half", open: "dark", mist: "mist", fog: "fog" };

export function WorldMapView({
  states,
  variant,
}: {
  states: Record<number, FloorState>;
  variant: "glass" | "memory" | "ending";
}) {
  const t = memoryText.world;
  const restored = Object.values(states).filter((s) => s === "restored" || s === "here").length;
  const total = Object.keys(states).length;
  const label = fill(t.label, { restored: String(restored), total: String(total) });
  const looks: Record<number, Look> = {};
  for (const [n, s] of Object.entries(states)) looks[Number(n)] = LOOK[s];
  const here = Object.entries(states).find(([, s]) => s === "here")?.[0];
  const hereN = here === undefined ? undefined : Number(here);
  const regionState = (r: number) => {
    const fs = Object.values(floors)
      .filter((f) => f.region === r)
      .map((f) => states[f.n]);
    if (fs.every((s) => s === "restored")) return "restored";
    if (fs.some((s) => s === "restored" || s === "here" || s === "open")) return "open";
    if (fs.some((s) => s === "mist")) return "mist";
    return "fog";
  };
  return (
    <div className="world-map" data-variant={variant}>
      <div className="world-model">
        <PalaceModel
          looks={looks}
          keepGlow={variant === "ending" || states[9] === "restored"}
          here={hereN}
          hereLabel={t.states.here}
          turn
          label={label}
        />
      </div>
      {/* The words beside the picture: every region and floor with its state (the model has no text). */}
      {variant !== "ending" && (
        <aside className="world-legend">
          <h3 className="world-title">{t.title}</h3>
          {Object.values(regions).map((r) => (
            <section key={r.n} className="world-region" data-state={regionState(r.n)}>
              <h4 className="world-region-name">{r.name}</h4>
              <ul>
                {Object.values(floors)
                  .filter((f) => f.region === r.n)
                  .map((f) => {
                    const s = states[f.n] ?? "fog";
                    return (
                      <li key={f.n} className="world-floor" data-state={s}>
                        <span className="world-step" aria-hidden="true" />
                        <span className="world-floor-name">{f.n === 0 ? f.name : `${f.n} · ${f.name}`}</span>
                        <span className="world-floor-state">{t.states[s]}</span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
          <p className="world-deeper-name">{t.deeper}</p>
          {variant === "glass" && <p className="world-turn">{t.turn}</p>}
        </aside>
      )}
    </div>
  );
}

/** The Map's world view: from progress, the floor you're on ringed. */
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
