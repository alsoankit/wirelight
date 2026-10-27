import { floors } from "@wirelight/content";
import {
  BoxGeometry,
  type BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The world map's palace (0088, 0092): the Palace of a Thousand Doors on its hill, built in code at
// low detail. Regions 1–4 are the outer terraces, one ring each, rising inward; Regions 5–8 are the
// tiers of the central keep (not built yet: always dark, always in mist). Each floor has its own
// place on its terrace, and the floors spiral round the hill and up, so the cable between them
// climbs from the outer gate to the keep. Everything is merged into a handful of buckets (one draw
// call each), rebuilt only when the floors' states change.

/** How a floor looks on the map (from its FloorState). */
export type Look = "lit" | "half" | "dark" | "mist" | "fog";

/** A terrace: one region's ring of the hill, from `r0` to `r1`, its top at `y`. */
const TERRACES: Record<number, { r0: number; r1: number; y: number; top: string }> = {
  1: { r0: 8.6, r1: 11.6, y: 0.5, top: "#34422a" },
  2: { r0: 6.4, r1: 8.6, y: 1.4, top: "#4f4537" },
  3: { r0: 4.3, r1: 6.4, y: 2.4, top: "#5c4f3d" },
  4: { r0: 2.5, r1: 4.3, y: 3.5, top: "#6b5d48" },
};

/** Each floor's place: its terrace and the angle round the hill (degrees; 90 faces the camera, the gate). */
const FLOOR_ANGLE: Record<number, number> = {
  0: 90,
  1: 145,
  2: 205,
  3: 255,
  4: 320,
  5: 15,
  6: 75,
  7: 135,
  8: 195,
  9: 262,
};
const SECTOR = 27;

/** The keep's tiers (Regions 5–8): radius and height, stacked from the high terrace. */
const KEEP = [
  { r: 2.15, h: 1.6 },
  { r: 1.85, h: 1.5 },
  { r: 1.55, h: 1.5 },
  { r: 1.25, h: 1.4 },
];

/** Warm stone for the palace, lit and in ruin; cyan is kept for the network's light (0090). */
const PALETTE = {
  stone: ["#b9a68a", "#4a443d"],
  tower: ["#9c8a72", "#3d3832"],
  roof: ["#8a5a44", "#2f2a26"],
  leaf: ["#5f7d42", "#29321f"],
  iron: ["#7a6e60", "#34312d"],
  pale: ["#dcc39a", "#544c41"],
} as const;
type Tone = keyof typeof PALETTE;
const VOID = "#16130f";
const CABLE_DARK = "#2a2622";

const deg = Math.PI / 180;
const TERRACE_WALL = "#625646";

/** A point on the hill: angle (degrees) and radius to x/z. */
function polar(r: number, a: number): [number, number] {
  return [r * Math.cos(a * deg), r * Math.sin(a * deg)];
}

/** Facing outward at angle `a`: the rotation that turns local +z to point away from the centre. */
function outward(a: number): number {
  return (90 - a) * deg;
}

function mat(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(0, ry, 0)),
    new Vector3(sx, sy, sz),
  );
}

// Unit shapes, base at y = 0 so a scale is a size.
const BOX = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const CYL = new CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
const CONE = new ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
const PYRAMID = new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
/** A pitched roof: width 1 (x), height 1, length 1 (z), ridge along z. */
const ROOF = new CylinderGeometry(1, 1, 1, 3)
  .rotateX(-Math.PI / 2)
  .translate(0, 0.5, 0)
  .scale(1 / Math.sqrt(3), 1 / 1.5, 1);
const TREE = new IcosahedronGeometry(1, 0);
const WHEEL = new TorusGeometry(1, 0.14, 4, 12);
const BLOB = new IcosahedronGeometry(1, 1);
const PANE = new BoxGeometry(1, 1, 1);

/** Merges geometries that all carry a position, a normal and one colour each. */
class Bucket {
  private parts: BufferGeometry[] = [];

  add(geo: BufferGeometry, m: Matrix4, hex: string, extra?: { name: string; value: number }) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    g.clearGroups();
    g.applyMatrix4(m);
    const n = g.attributes.position?.count ?? 0;
    const c = new Color(hex);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    if (extra) g.setAttribute(extra.name, new Float32BufferAttribute(new Float32Array(n).fill(extra.value), 1));
    this.parts.push(g);
  }

  build(): BufferGeometry | null {
    if (!this.parts.length) return null;
    const out = mergeGeometries(this.parts);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return out;
  }
}

/** A small deterministic hash for scattering (no Math.random: the map must look the same each time). */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export type PalaceGeometry = {
  /** Stone in ruin, the hill, dark cables and dark windows. */
  ruin: BufferGeometry | null;
  /** Restored stone: lit warm. */
  lit: BufferGeometry | null;
  /** Lit windows. */
  glow: BufferGeometry | null;
  /** Cables carrying the network's light. */
  cable: BufferGeometry | null;
  /** Mist and fog, with a `density` per blob. */
  mist: BufferGeometry | null;
  /** Where each floor sits, for the "you are here" mark. */
  anchors: Record<number, [number, number, number]>;
};

/** Builds the palace for the floors' looks. `keepGlow`: the ending's faint light rising up the keep. */
export function buildPalace(looks: Record<number, Look>, keepGlow: boolean): PalaceGeometry {
  const ruin = new Bucket();
  const lit = new Bucket();
  const glow = new Bucket();
  const cable = new Bucket();
  const mist = new Bucket();
  const anchors: PalaceGeometry["anchors"] = {};

  // The current look while a part is being built: which bucket the stone goes to, which windows glow.
  let look: Look = "dark";
  let pane = 0;
  const solid = (geo: BufferGeometry, m: Matrix4, tone: Tone) => {
    const bright = look === "lit" || look === "half";
    (bright ? lit : ruin).add(geo, m, PALETTE[tone][bright ? 0 : 1]);
  };
  /** A window on a face: lit on a restored floor, every other one on the floor you're on, dark otherwise. */
  const windowAt = (m: Matrix4) => {
    pane++;
    const on = look === "lit" || (look === "half" && pane % 2 === 0);
    if (on) glow.add(PANE, m, "#ffc777");
    else ruin.add(PANE, m, VOID);
  };

  /** A block building: `w` wide (tangent), `d` deep (outward), with windows on its outer face and a roof. */
  const building = (
    r: number,
    a: number,
    y: number,
    w: number,
    h: number,
    d: number,
    tone: Tone,
    roof: "pitched" | "pyramid" | "flat" | "none",
    roofH = 0.5,
  ) => {
    const [x, z] = polar(r, a);
    const ry = outward(a);
    const base = mat(x, y, z, ry);
    solid(BOX, base.clone().multiply(mat(0, 0, 0, 0, w, h, d)), tone);
    if (roof === "pitched")
      solid(ROOF, base.clone().multiply(mat(0, h, 0, Math.PI / 2, d * 1.08, roofH, w * 1.08)), "roof");
    if (roof === "pyramid") solid(PYRAMID, base.clone().multiply(mat(0, h, 0, 0, w * 1.1, roofH, d * 1.1)), "roof");
    if (roof === "flat") solid(BOX, base.clone().multiply(mat(0, h, 0, 0, w * 1.06, 0.06, d * 1.06)), tone);
    // Windows: rows and columns on the outer face, a step proud of the wall so they read at a distance.
    const cols = Math.max(1, Math.floor(w / 0.38));
    const rows = Math.max(1, Math.floor(h / 0.45));
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const wx = (i - (cols - 1) / 2) * (w / cols);
        const wy = (h * (j + 0.55)) / (rows + 0.2);
        windowAt(base.clone().multiply(mat(wx, wy, d / 2 + 0.01, 0, 0.11, 0.17, 0.04)));
      }
  };

  const tower = (r: number, a: number, y: number, radius: number, h: number, tone: Tone, cap: number) => {
    const [x, z] = polar(r, a);
    solid(CYL, mat(x, y, z, 0, radius, h, radius), tone);
    solid(CONE, mat(x, y + h, z, 0, radius * 1.3, cap, radius * 1.3), "roof");
    const ry = outward(a);
    for (let j = 0; j < Math.max(1, Math.floor(h / 0.7)); j++)
      windowAt(mat(x, 0, z, ry).multiply(mat(0, y + 0.45 + j * 0.7, radius + 0.01, 0, 0.12, 0.2, 0.04)));
  };

  const tree = (r: number, a: number, y: number, s: number) => {
    const [x, z] = polar(r, a);
    solid(CYL, mat(x, y, z, 0, 0.05, s * 0.5, 0.05), "tower");
    solid(TREE, mat(x, y + s * 0.85, z, a, s * 0.45, s * 0.55, s * 0.45), "leaf");
  };

  const wallRun = (r: number, a0: number, a1: number, y: number, h: number, tone: Tone, broken: boolean) => {
    const step = 5;
    for (let a = a0; a < a1 - 0.01; a += step) {
      const span = Math.min(step, a1 - a);
      const mid = a + span / 2;
      const [x, z] = polar(r, mid);
      const len = 2 * r * Math.sin((span * deg) / 2) + 0.04;
      // A ruined wall loses its top here and there.
      const hh = broken && hash(mid) < 0.35 ? h * (0.35 + hash(mid + 1) * 0.4) : h;
      solid(BOX, mat(x, y, z, outward(mid), len, hh, 0.32), tone);
    }
  };

  const inSector = (a: number, floor: number) => {
    const d = Math.abs(((a - (FLOOR_ANGLE[floor] ?? 0) + 540) % 360) - 180);
    return d < SECTOR;
  };
  const floorsOf = (region: number) =>
    Object.keys(FLOOR_ANGLE)
      .map(Number)
      .filter((n) => regionOf(n) === region);

  // --- Each region's ring outside its floors' places: filler in the region's state.
  const regionLook = (region: number): Look => {
    const ls = floorsOf(region).map((n) => looks[n] ?? "fog");
    if (ls.every((l) => l === "lit")) return "lit";
    if (ls.every((l) => l === "fog")) return "fog";
    return "dark";
  };
  const free = (region: number, a: number) => !floorsOf(region).some((n) => inSector(a, n));

  // --- The hill, its terraces and the forest round it.
  look = "dark";
  ruin.add(new CylinderGeometry(17.5, 17.5, 0.4, 40), mat(0, -0.8, 0), "#10140f");
  for (const region of [1, 2, 3, 4]) {
    const t = TERRACES[region];
    if (!t) continue;
    // A terrace whose floors are all restored is lit too: its ground and retaining wall warm up.
    const warm = regionLook(region) === "lit";
    const below = region === 1 ? -0.6 : (TERRACES[region - 1]?.y ?? 0);
    const side = new CylinderGeometry(t.r1, t.r1 + 0.15, t.y - below, 48, 1, true);
    (warm ? lit : ruin).add(side, mat(0, (t.y + below) / 2, 0), warm ? "#8c7a62" : TERRACE_WALL);
    const top = new CylinderGeometry(t.r1, t.r1, 0.02, 48);
    (warm ? lit : ruin).add(top, mat(0, t.y - 0.01, 0), warm ? brighten(t.top) : t.top);
  }
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * 360 + hash(i) * 4;
    const r = 12.6 + hash(i + 7) * 4.5;
    const [x, z] = polar(r, a);
    const s = 0.7 + hash(i + 3) * 0.6;
    ruin.add(CONE, mat(x, -0.6, z, 0, s * 0.45, s * 1.5, s * 0.45), hash(i + 9) < 0.5 ? "#1c2919" : "#223020");
  }

  // Region 1: the outer gardens and the old wall all the way round, its towers every 30 degrees.
  look = regionLook(1);
  for (let a = 0; a < 360; a += 30) if (free(1, a) && free(1, a + 5)) tower(11.4, a, 0.5, 0.42, 1.3, "tower", 0.5);
  for (let a = 0; a < 360; a += 15) {
    if (!free(1, a) || !free(1, a + 15)) continue;
    wallRun(11.4, a, a + 15, 0.5, 0.85, "stone", true);
  }
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * 360 + hash(i + 40) * 5;
    if (free(1, a)) tree(9.2 + hash(i + 41) * 1.6, a, 0.5, 0.55 + hash(i + 42) * 0.4);
  }
  // Region 2: sheds and walls of the works.
  look = regionLook(2);
  for (let a = 0; a < 360; a += 24) if (free(2, a)) building(7.5, a + hash(a) * 6, 1.4, 0.8, 0.5, 0.6, "iron", "flat");
  // Region 3: the town's houses all round the terrace.
  look = regionLook(3);
  for (let a = 0; a < 360; a += 13)
    if (free(3, a))
      building(5.3 + hash(a) * 0.5, a, 2.4, 0.42, 0.45 + hash(a + 1) * 0.25, 0.42, "stone", "pitched", 0.3);
  // Region 4: low chapels round the cathedral.
  look = regionLook(4);
  for (let a = 0; a < 360; a += 40) if (free(4, a)) building(3.6, a, 3.5, 0.55, 0.45, 0.5, "pale", "pitched", 0.3);

  // --- Each floor's own place.
  const place = (n: number) => {
    const a = FLOOR_ANGLE[n] ?? 0;
    const t = TERRACES[regionOf(n)];
    if (!t) return;
    const mid = (t.r0 + t.r1) / 2;
    const y = t.y;
    look = looks[n] ?? "fog";
    pane = 0;
    let top = 1.2;
    switch (n) {
      case 0: {
        // The outer gate: two towers and the arch between them, and the Knight's tower beside it.
        for (const s of [-1, 1]) building(11.4, a + s * 4.4, 0.5, 0.75, 1.5, 0.8, "tower", "pyramid", 0.6);
        const [x, z] = polar(11.4, a);
        solid(BOX, mat(x, 1.35, z, outward(a), 1.0, 0.45, 0.6), "stone");
        wallRun(11.4, a - 26, a - 6, 0.5, 0.85, "stone", false);
        wallRun(11.4, a + 6, a + 26, 0.5, 0.85, "stone", false);
        tower(10.0, a + 13, 0.5, 0.42, 2.3, "stone", 0.9);
        top = 3.4;
        break;
      }
      case 1:
        // The garden courts: low walled squares, trees inside, a pavilion.
        for (const da of [-14, 0, 14]) {
          const [x, z] = polar(mid, a + da);
          for (const [dx, dz, w, d] of [
            [0, 0.55, 1.1, 0.08],
            [0, -0.55, 1.1, 0.08],
            [0.55, 0, 0.08, 1.1],
            [-0.55, 0, 0.08, 1.1],
          ] as const)
            solid(BOX, mat(x, y, z, outward(a + da)).multiply(mat(dx, 0, dz, 0, w, 0.3, d)), "stone");
          tree(mid + 0.2, a + da + 3, y, 0.8);
        }
        building(mid - 0.9, a, y, 0.7, 0.6, 0.6, "stone", "pyramid", 0.5);
        wallRun(11.4, a - 26, a + 26, 0.5, 0.85, "stone", true);
        break;
      case 2:
        // The wall walk: the old wall at full height, its towers lived in.
        wallRun(11.4, a - 26, a + 26, 0.5, 1.15, "stone", false);
        for (const da of [-18, 0, 18]) tower(11.4, a + da, 0.5, 0.48, 1.9, "tower", 0.6);
        tree(mid - 0.4, a - 8, y, 0.7);
        tree(mid - 0.6, a + 9, y, 0.6);
        top = 3.0;
        break;
      case 3:
        // The undercroft and the mill court: long vaulted halls, a mill wheel at the terrace's edge.
        building(mid, a - 9, y, 1.5, 0.75, 0.9, "iron", "pitched", 0.45);
        building(mid - 0.3, a + 10, y, 1.0, 0.9, 0.8, "stone", "flat");
        {
          const [x, z] = polar(t.r1 - 0.1, a);
          solid(WHEEL, mat(x, y + 0.45, z, outward(a) + Math.PI / 2, 0.5, 0.5, 0.5), "iron");
          const [cx, cz] = polar(mid - 0.4, a + 15);
          solid(CYL, mat(cx, y, cz, 0, 0.12, 1.6, 0.12), "tower");
        }
        break;
      case 4:
        // The clock tower over the works.
        building(mid, a, y, 0.75, 2.6, 0.75, "tower", "pyramid", 0.9);
        building(mid + 0.1, a - 14, y, 1.2, 0.7, 0.8, "iron", "pitched", 0.4);
        building(mid - 0.2, a + 14, y, 0.9, 0.6, 0.7, "iron", "flat");
        {
          // The clock face: glows with the floor.
          const [x, z] = polar(mid + 0.39, a);
          const m = mat(x, y + 2.1, z, outward(a), 0.42, 0.42, 0.04);
          if (look === "lit" || look === "half") glow.add(CYL.clone().rotateX(Math.PI / 2), m, "#ffd9a0");
          else ruin.add(CYL.clone().rotateX(Math.PI / 2), m, VOID);
        }
        top = 4.2;
        break;
      case 5:
      case 6:
      case 7:
        // The town: houses close together, a square between them, the stair up to the next terrace.
        for (let i = 0; i < 7; i++) {
          const da = (i - 3) * 6.5 + (hash(n * 10 + i) - 0.5) * 2;
          const r = mid + (i % 2 ? 0.55 : -0.45);
          const h = 0.5 + hash(n * 10 + i + 3) * 0.45;
          building(r, a + da, y, 0.48, h, 0.5, "stone", "pitched", 0.32);
        }
        {
          const [x, z] = polar(t.r0 + 0.3, a + 20);
          for (let s = 0; s < 4; s++)
            solid(
              BOX,
              mat(x, y, z, outward(a + 20)).multiply(mat(0, 0, -s * 0.18, 0, 0.5, 0.2 + s * 0.27, 0.2)),
              "stone",
            );
        }
        break;
      case 8:
        // The nave and the crossing: a long hall along the terrace, its transepts, a short tower.
        building(mid, a, y, 2.4, 1.0, 0.85, "pale", "pitched", 0.6);
        building(mid, a, y, 0.75, 1.0, 1.7, "pale", "pitched", 0.6);
        {
          const [x, z] = polar(mid, a);
          solid(BOX, mat(x, y + 1.0, z, outward(a), 0.55, 0.55, 0.55), "pale");
          solid(PYRAMID, mat(x, y + 1.55, z, outward(a), 0.6, 0.5, 0.6), "roof");
        }
        top = 3.0;
        break;
      case 9:
        // The west tower and its spire, a chapel, the cloister's square.
        building(mid, a, y, 0.8, 1.8, 0.8, "pale", "none");
        {
          const [x, z] = polar(mid, a);
          solid(PYRAMID, mat(x, y + 1.8, z, outward(a), 0.85, 1.7, 0.85), "roof");
          const [cx, cz] = polar(mid - 0.2, a + 17);
          for (const [dx, dz, w, d] of [
            [0, 0.6, 1.2, 0.18],
            [0, -0.6, 1.2, 0.18],
            [0.6, 0, 0.18, 1.2],
            [-0.6, 0, 0.18, 1.2],
          ] as const)
            solid(BOX, mat(cx, y, cz, outward(a + 17)).multiply(mat(dx, 0, dz, 0, w, 0.4, d)), "pale");
        }
        building(mid + 0.2, a - 16, y, 0.8, 0.8, 0.6, "pale", "pitched", 0.45);
        top = 4.2;
        break;
    }
    const [x, z] = polar(mid, a);
    anchors[n] = [x, y + top, z];
    // Mist: thin over the next floor, thick over what's further on (drawn as soft blobs).
    if (look === "mist" || look === "fog") {
      const density = look === "mist" ? 0.45 : 0.95;
      for (let i = 0; i < 3; i++) {
        const [bx, bz] = polar(mid, a + (i - 1) * 14);
        mist.add(BLOB, mat(bx, y + 0.6, bz, i, 1.5, 1.0, 1.5), "#7d8796", { name: "density", value: density });
      }
    }
  };
  for (const n of Object.keys(FLOOR_ANGLE).map(Number)) if (looks[n] !== undefined) place(n);

  // Thick fog over any region no one has reached, all the way round its ring.
  for (const region of [2, 3, 4]) {
    if (regionLook(region) !== "fog") continue;
    const t = TERRACES[region];
    if (!t) continue;
    for (let a = 0; a < 360; a += 40) {
      if (!free(region, a)) continue;
      const [x, z] = polar((t.r0 + t.r1) / 2, a);
      mist.add(BLOB, mat(x, t.y + 0.5, z, a, 1.7, 0.9, 1.7), "#7d8796", { name: "density", value: 0.8 });
    }
  }

  // --- The keep (Regions 5–8): not built yet, dark tiers in mist, the crown's spire above them.
  look = "dark";
  let ky = TERRACES[4]?.y ?? 3.5;
  KEEP.forEach((tier, i) => {
    solid(CYL, mat(0, ky, 0, 0, tier.r, tier.h, tier.r), i % 2 ? "tower" : "stone");
    solid(CYL, mat(0, ky + tier.h, 0, 0, tier.r + 0.18, 0.1, tier.r + 0.18), "tower");
    for (let k = 0; k < 8; k++) {
      const a = k * 45 + 22.5 + i * 10;
      const [x, z] = polar(tier.r * 0.93, a);
      ruin.add(PANE, mat(x, ky + tier.h * 0.5, z, outward(a), 0.12, 0.3, 0.06), VOID);
    }
    // Side towers on the lower tiers: the keep's silhouette, its bridges between towers.
    if (i < 2)
      for (const a of [40 + i * 90, 220 + i * 90]) {
        const [x, z] = polar(tier.r + 0.35, a);
        solid(CYL, mat(x, ky, z, 0, 0.32, tier.h + 0.7, 0.32), "tower");
        solid(CONE, mat(x, ky + tier.h + 0.7, z, 0, 0.42, 0.7, 0.42), "roof");
      }
    for (let k = 0; k < 3; k++) {
      const [x, z] = polar(tier.r, k * 120 + i * 30);
      mist.add(BLOB, mat(x, ky + tier.h * 0.5, z, k, 1.5, 0.8, 1.5), "#7d8796", {
        name: "density",
        value: keepGlow ? 0.35 : 0.6,
      });
    }
    ky += tier.h + 0.1;
  });
  solid(CONE, mat(0, ky, 0, 0, 0.75, 2.6, 0.75), "tower");
  mist.add(BLOB, mat(0, ky + 1.2, 0, 0, 1.4, 1.6, 1.4), "#7d8796", { name: "density", value: keepGlow ? 0.3 : 0.55 });

  // --- The cables: floor to floor round the hill and up, lit where both ends are restored.
  const order = Object.keys(FLOOR_ANGLE)
    .map(Number)
    .filter((n) => looks[n] !== undefined)
    .sort((p, q) => p - q);
  const ground = (n: number) => {
    const t = TERRACES[regionOf(n)] ?? { r0: 0, r1: 0, y: 0 };
    return { r: (t.r0 + t.r1) / 2 - 0.5, a: FLOOR_ANGLE[n] ?? 0, y: t.y + 0.06 };
  };
  const bright = (l: Look | undefined) => l === "lit" || l === "half";
  for (let i = 1; i < order.length; i++) {
    const from = order[i - 1] as number;
    const to = order[i] as number;
    const p = ground(from);
    const q = ground(to);
    const sweep = (((q.a - p.a) % 360) + 360) % 360;
    const pts: Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const s = k / 10;
      // Along the terrace first, then up the terrace wall near the end (a cable follows the stone).
      const climb = Math.min(1, Math.max(0, (s - 0.6) / 0.3));
      const [x, z] = polar(p.r + (q.r - p.r) * climb, p.a + sweep * s);
      pts.push(new Vector3(x, p.y + (q.y - p.y) * climb, z));
    }
    const tube = new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.05, 4);
    if (bright(looks[from]) && bright(looks[to])) cable.add(tube, new Matrix4(), "#5ee0e8");
    else ruin.add(tube, new Matrix4(), CABLE_DARK);
    tube.dispose();
  }
  // Up the keep from the last floor to the crown: dark until the ending, when a faint light climbs it.
  {
    const last = order.at(-1);
    if (last !== undefined) {
      const p = ground(last);
      const pts: Vector3[] = [];
      for (let k = 0; k <= 16; k++) {
        const s = k / 16;
        // Hugging the keep's tiers as they narrow on the way up.
        const r = k === 0 ? p.r : 2.3 - s * 1.0;
        const [x, z] = polar(r, p.a + s * 540);
        pts.push(new Vector3(x, p.y + s * (ky - p.y), z));
      }
      const tube = new TubeGeometry(new CatmullRomCurve3(pts), 80, 0.04, 4);
      if (keepGlow) cable.add(tube, new Matrix4(), "#5ee0e8");
      else ruin.add(tube, new Matrix4(), CABLE_DARK);
      tube.dispose();
    }
  }

  return {
    ruin: ruin.build(),
    lit: lit.build(),
    glow: glow.build(),
    cable: cable.build(),
    mist: mist.build(),
    anchors,
  };
}

/** A terrace's ground, a step brighter once its region is restored. */
function brighten(hex: string): string {
  return `#${new Color(hex).multiplyScalar(1.7).getHexString()}`;
}

function regionOf(n: number): number {
  return floors[n]?.region ?? 1;
}

/** The marker over the floor you're on. */
export const MARKER = new OctahedronGeometry(0.22, 0);
