import { Vector3 } from "three";
import type { Placement } from "../world/kit/StaticRoom";

// The landing (ONB-01, 0088): the outer gate of the Palace of a Thousand Doors, at the edge of a night
// forest. The gate is what's left of the outer wall, its doors shut; an old path of flagstones leads up
// to it with the rune-line along it, and on through the gate toward the palace, which rises on its
// hill behind the trees. Units: metres; the gate stands at the origin facing +z (toward the camera).

const QUARTER = Math.PI / 2;

export const GATE_OPENING = new Vector3(0, 0, -0.3); // the middle of the gateway, under the doors
export const PATH_START = new Vector3(0, 0, 6.5);

// The palace on its hill (Palace.tsx): far behind the gate and a little right, so from the camera it
// rises over the arch and the treetops. Its foot is lost in the forest and the haze.
export const PALACE = new Vector3(14.5, 0, -55);

// Behind the gate the path goes on toward the palace, as far as the eye follows it into the trees.
export const BEYOND = new Vector3(PALACE.x * (14 / -PALACE.z), 0, -14);

/** Where the path beyond the gate runs (its middle), at a depth z < 0. */
export function pathBeyond(z: number): number {
  return (BEYOND.x * z) / BEYOND.z;
}

// Low and close, looking slightly up at the gate from the front left: the gate sits right of centre,
// the palace rises over it, and the text has the left of the screen.
export const CAMERA = { position: new Vector3(-3.4, 1.5, 12.5), target: new Vector3(-1.5, 2.7, 0), fov: 40 };
export const TO_CAMERA = CAMERA.position.clone().sub(CAMERA.target).normalize();

// The moon in the sky: high, behind the gate and to the right of the palace, clear of its towers.
export const MOON_DIRECTION = new Vector3(0.56, 0.36, -1).normalize();
// Where the baked moonlight comes from: the same side of the sky, but further round toward the
// front, so the gate's face is lit, not a silhouette against the moon (a usual stage cheat).
export const LIGHT_DIRECTION = new Vector3(0.75, 0.8, 0.45).normalize();

function gate(): Placement[] {
  return [
    // Whole, not broken: its doors (Doors.tsx) still hang in it.
    { piece: "Wall_ArchRound_Overgrown", position: [0, 0, 0] },
    { piece: "Wall_Overgrown", position: [-3, 0, 0] },
    { piece: "Wall_Broken", position: [-5, 0, 0.1], rotationY: 0.05 },
    { piece: "Wall_Half", position: [3, 0, 0] },
    { piece: "Wall_Double_Broken", position: [5, 0, -0.2], rotationY: -0.08 },
    { piece: "Column_Round", position: [-2, 0, 0.25] },
    { piece: "Column_Round_Short", position: [2, 0, 0.25] },
  ];
}

function rubble(): Placement[] {
  return [
    { piece: "Brick", position: [1.6, 0, 1.3], rotationY: 0.6 },
    { piece: "Bricks", position: [-3.6, 0, 1.4], rotationY: 0.3 },
    { piece: "Brick", position: [-1.9, 0, 2.6], rotationY: 1.1 },
    { piece: "Column_Round_Short", position: [4.2, 0.25, 2.2], rotation: [0, 0.4, QUARTER] },
  ];
}

// Deterministic scatter (no Math.random: the same forest every visit).
function scatter(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// The forest in rows of depth, each further into the haze (the fog melts them into the sky), so the
// scene reads in layers: the gate, the near trees, then two fading tree lines behind. A gap is left
// where the path runs on, so the palace's hill shows through the arch.
function forest(): Placement[] {
  const random = scatter(91);
  const out: Placement[] = [];
  const rows: { z: number; spread: number; count: number; scale: [number, number] }[] = [
    { z: -8, spread: 15, count: 9, scale: [1.2, 1.6] },
    { z: -16, spread: 26, count: 14, scale: [1.6, 2.2] },
    { z: -27, spread: 40, count: 18, scale: [2.0, 2.8] },
  ];
  for (const row of rows) {
    for (let i = 0; i < row.count; i++) {
      const x = -row.spread + ((i + 0.2 + random() * 0.6) / row.count) * row.spread * 2;
      const piece = random() < 0.5 ? "Tree_1" : "Tree_3";
      const z = row.z + (random() - 0.5) * 4;
      const rotationY = random() * Math.PI * 2;
      const scale = row.scale[0] + random() * (row.scale[1] - row.scale[0]);
      if (Math.abs(x - pathBeyond(z)) < 3 + Math.abs(z) * 0.12) continue;
      out.push({ piece, position: [x, 0, z], rotationY, scale });
    }
  }
  // Near trees at the sides of the clearing, and one big dark tree in the near left that frames the
  // shot (the text sits over it).
  out.push(
    { piece: "Tree_2", position: [-9.5, 0, -2.5], rotationY: 0.3, scale: 1.4 },
    { piece: "Tree_3", position: [9.5, 0, -1.5], rotationY: 1.7, scale: 1.45 },
    { piece: "DeadTree_2", position: [7.4, 0, 2.6], rotationY: 0.9, scale: 1.2 },
    { piece: "Tree_2", position: [-7.6, 0, 6.2], rotationY: 2.2, scale: 2.0 },
  );
  return out;
}

function undergrowth(): Placement[] {
  const bushes: [string, number, number, number][] = [
    ["Bush_Large", -5.2, 1.6, 0.4],
    ["Bush_2x1", -7.5, -1.5, 2.0],
    ["Bush_Large", 6.8, -1.2, 0.9],
    ["Bush_Round", -2.8, -2.2, 0.2],
    ["Bush_1x1", 1.6, 4.6, 1.7],
    // Behind the wall, either side of the path going on.
    ["Bush_Large", -3.4, -4.6, 0.4],
    ["Bush_Round", 4.6, -4.2, 1.1],
    ["Bush_2x2", -6.0, -5.4, 2.3],
    ["Bush_Round", 4.2, -9.6, 0.6],
  ];
  return bushes.map(([piece, x, z, r]): Placement => ({ piece, position: [x, 0, z], rotationY: r }));
}

export const LANDING: Placement[] = [...gate(), ...rubble(), ...forest(), ...undergrowth()];
