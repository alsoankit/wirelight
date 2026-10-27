import { useMemo } from "react";
import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  PlaneGeometry,
  SphereGeometry,
  Vector2,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  attribute,
  color,
  dot,
  float,
  max,
  mix,
  normalWorld,
  positionWorld,
  sin,
  smoothstep,
  time,
  uniform,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { CAMERA, MOON_DIRECTION, PALACE } from "./layout";
import { HORIZON } from "./Sky";

// The Palace of a Thousand Doors on its hill (0088, 0092), seen from the outer gate: a dark silhouette
// that climbs in terraces to the central keep and its spire, inward and higher being newer. The outer
// wall with its towers (the Overgrown Halls), the works and their clock tower, the town's terraces,
// the cathedral on the high terrace, then the keep with the library's dome and a second tower beside
// it, and the spire where the palace meets the sky. A few warm windows; faint cyan runs along a few
// walls (the Deep Network, mostly dark). Made in code at low detail: four meshes, four draw calls.
// Unlit and unfogged: it paints its own night haze, so at this distance it reads, not vanishes.

const CYAN = "#5EE0E8";
const LOW = "#1a2740"; // the foot, near the haze
const HIGH = "#0b111e"; // the upper towers, darker against the sky
const RIM = "#3d5680"; // moonlight on the faces turned toward it

// Which way the camera is, round the palace (CylinderGeometry's angle: 0 faces +z, x = sin).
const FRONT = Math.atan2(CAMERA.position.x - PALACE.x, CAMERA.position.z - PALACE.z);

type Tier = { radius: number; top: number; sides: number };
// The terraces, outside in: each a ring wall standing on the one below.
const TIERS: Tier[] = [
  { radius: 17, top: 3.5, sides: 14 },
  { radius: 12.5, top: 6.5, sides: 12 },
  { radius: 9, top: 9.2, sides: 11 },
  { radius: 6, top: 11.8, sides: 10 },
];

function at(geometry: BufferGeometry, x: number, y: number, z: number, rotationY = 0): BufferGeometry {
  return geometry.applyMatrix4(new Matrix4().makeRotationY(rotationY).setPosition(x, y, z));
}

/** A point on a ring round the palace's middle, at an angle from the front. */
function round(radius: number, angle: number): [number, number] {
  return [Math.sin(FRONT + angle) * radius, Math.cos(FRONT + angle) * radius];
}

function tower(x: number, z: number, radius: number, bottom: number, top: number, roof: number): BufferGeometry[] {
  return [
    at(new CylinderGeometry(radius, radius * 1.08, top - bottom, 7), x, (top + bottom) / 2, z),
    at(new ConeGeometry(radius * 1.25, roof, 7), x, top + roof / 2, z),
  ];
}

// One geometry from many: every part needs the same attributes, so drop the ones no material uses.
function merged(parts: BufferGeometry[]): BufferGeometry {
  for (const p of parts) p.deleteAttribute("uv");
  return mergeGeometries(parts);
}

function stone(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // The crown of the hill, under the outer wall.
  parts.push(new LatheGeometry([new Vector2(19, -2), new Vector2(17.5, 0.5), new Vector2(0, 0.8)], 14));
  // The terraces' ring walls, each from the hill up to its own top, with towers on the outer two.
  TIERS.forEach((t, i) => {
    parts.push(at(new CylinderGeometry(t.radius, t.radius * 1.03, t.top + 1, t.sides), 0, (t.top - 1) / 2, 0));
    if (i > 1) return;
    const towers = i === 0 ? 8 : 5;
    for (let k = 0; k < towers; k++) {
      const [x, z] = round(t.radius, ((k + 0.5) / towers) * Math.PI * 2);
      parts.push(...tower(x, z, i === 0 ? 1 : 0.8, 0, t.top + 2.2, 1.6));
    }
  });
  // The gatehouse in the outer wall, facing the forest: two squat towers either side of the way in.
  for (const side of [-1, 1]) {
    const [x, z] = round(17.2, side * 0.12);
    parts.push(...tower(x, z, 1.3, 0, 6, 1.8));
  }
  // The works' clock tower, square, on the second terrace's front left.
  {
    const [x, z] = round(10.5, -0.75);
    parts.push(at(new BoxGeometry(2.2, 9, 2.2), x, 6.5 + 4.5 - 2, z, FRONT));
    parts.push(at(new ConeGeometry(1.9, 2.4, 4), x, 6.5 + 7 + 1.2, z, FRONT + Math.PI / 4));
  }
  // The town: rows of small houses on the third terrace, roofs pitched.
  for (let k = 0; k < 9; k++) {
    const angle = -1.3 + k * 0.33;
    const [x, z] = round(7.6, angle);
    const h = 1.4 + ((k * 7) % 3) * 0.35;
    parts.push(at(new BoxGeometry(1.6, h, 1.4), x, 9.2 + h / 2, z, FRONT + angle));
    parts.push(at(new ConeGeometry(1.15, 0.9, 4), x, 9.2 + h + 0.45, z, FRONT + angle + Math.PI / 4));
  }
  // The cathedral on the high terrace: a long nave across the front right, and its tower.
  {
    const [x, z] = round(3.6, 0.9);
    parts.push(at(new BoxGeometry(6.5, 3.2, 2.6), x, 11.8 + 1.6, z, FRONT + 0.9 + Math.PI / 2));
    parts.push(at(new ConeGeometry(2.1, 1.6, 4, 1), x, 11.8 + 3.2 + 0.8, z, FRONT + 0.9 + Math.PI / 4));
    const [tx, tz] = round(5.2, 1.45);
    parts.push(...tower(tx, tz, 0.7, 11.8, 17.5, 3.2));
  }
  // The keep: a tall drum stepping in as it rises, a crown that juts out, and the spire.
  parts.push(at(new CylinderGeometry(3, 3.2, 8, 8), 0, 11.8 + 4, 0));
  parts.push(at(new CylinderGeometry(2.2, 2.4, 3.2, 8), 0, 19.8 + 1.6, 0));
  parts.push(at(new CylinderGeometry(2.7, 2.2, 0.8, 8), 0, 23.0 + 0.4, 0));
  parts.push(at(new ConeGeometry(1.7, 6.5, 8), 0, 23.8 + 3.25, 0));
  // Beside the keep: the library tower with its star dome, and a slender tower with a bridge across.
  {
    const [lx, lz] = round(4.4, -1.25);
    parts.push(at(new CylinderGeometry(1.3, 1.4, 7.5, 8), lx, 11.8 + 3.75, lz));
    parts.push(at(new SphereGeometry(1.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lx, 19.3, lz));
    const [sx, sz] = round(4.6, 2.1);
    parts.push(...tower(sx, sz, 0.75, 11.8, 18.4, 2.6));
    const [bx, bz] = round(3.2, 2.1);
    parts.push(at(new BoxGeometry(0.6, 0.5, 2.6), bx, 16.6, bz, FRONT + 2.1));
  }
  return merged(parts);
}

// Warm windows: a few lit here and there, more in the town (its lanterns), each a little quad turned
// out from the wall it's in. `glow` per window, so they aren't all one brightness.
function windows(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (radius: number, angle: number, y: number, size: [number, number], glow: number) => {
    const [x, z] = round(radius + 0.06, angle);
    // A little larger than life, so they still read as windows from the gate.
    const quad = at(new PlaneGeometry(size[0] * 1.3, size[1] * 1.3), x, y, z, FRONT + angle);
    quad.deleteAttribute("uv");
    quad.deleteAttribute("normal");
    quad.setAttribute("glow", new Float32BufferAttribute(new Array(quad.getAttribute("position").count).fill(glow), 1));
    parts.push(quad);
  };
  // Outer wall and gatehouse.
  add(17.0, -0.32, 2.2, [0.45, 0.7], 0.7);
  add(17.0, 0.55, 2.0, [0.45, 0.7], 0.5);
  add(18.5, 0.12, 4.6, [0.4, 0.6], 0.9);
  // The works.
  add(12.5, -0.15, 5.0, [0.5, 0.8], 0.8);
  add(12.5, 0.4, 5.2, [0.5, 0.8], 0.55);
  // The town: lanterns along the terrace wall, and lit houses above it.
  for (const [angle, glow] of [
    [-0.9, 1],
    [-0.45, 0.8],
    [-0.1, 1],
    [0.3, 0.7],
    [0.75, 0.9],
  ] as const)
    add(9, angle, 8.1, [0.38, 0.55], glow);
  for (const [angle, glow] of [
    [-0.64, 0.75],
    [0.02, 1],
    [0.35, 0.85],
  ] as const)
    add(8.36, angle, 10.0, [0.38, 0.55], glow);
  // The cathedral's rose window, and two high in the keep.
  add(6.0, 0.25, 10.7, [0.7, 0.7], 0.6);
  add(3.0, 0, 17.5, [0.4, 0.75], 0.9);
  add(2.2, -0.15, 20.8, [0.35, 0.6], 0.7);
  return mergeGeometries(parts);
}

// The network's light along the walls: short runs, most of it dark (the palace is in ruin), and one
// line climbing the front of the keep toward the crown.
function network(): BufferGeometry {
  const arc = (radius: number, y: number, from: number, length: number) =>
    at(new CylinderGeometry(radius, radius, 0.22, 24, 1, true, FRONT + from, length), 0, y, 0);
  const parts = [
    arc(17.08, 3.0, -0.9, 0.7),
    arc(17.08, 3.0, 0.3, 0.45),
    arc(12.58, 6.0, -0.5, 0.95),
    arc(9.08, 8.7, 0.2, 0.6),
    arc(6.08, 11.3, -0.7, 1.1),
  ];
  const [x, z] = round(3.12, 0);
  parts.push(at(new BoxGeometry(0.2, 7.5, 0.05), x, 11.8 + 3.75, z, FRONT));
  return merged(parts);
}

// The hill the palace stands on, full size (the palace itself is drawn smaller, PALACE_SCALE): broad
// and long, its slopes lost in the forest and the haze, its top just clearing the trees.
const LIFT = 11.7; // the hilltop's height
const PALACE_SCALE = 0.6; // the palace is planned in its own units, then shrunk to sit on the hill

function hill(): BufferGeometry {
  const profile = [
    [52, -1],
    [38, 2.5],
    [26, 7],
    [16, 10.4],
    [11.5, LIFT - 0.2],
    [0, LIFT],
  ].map(([r, y]) => new Vector2(r, y));
  const g = new LatheGeometry(profile, 24);
  g.deleteAttribute("uv");
  return g;
}

export function Palace() {
  const { geometry, ground, material, lights, warm, lines, cyan } = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ fog: false });
    const y = positionWorld.y;
    const toMoon = uniform(MOON_DIRECTION.clone());
    const lit = max(dot(normalWorld, toMoon), 0);
    // Darker as it climbs; moonlight catching the faces turned toward it; the haze swallowing its foot.
    let c = mix(color(LOW), color(HIGH), smoothstep(8, 26, y));
    c = c.add(color(RIM).mul(lit.mul(lit).mul(0.55)));
    m.colorNode = mix(c, color(HORIZON), smoothstep(10, 0, y).mul(0.6));

    const w = new MeshBasicNodeMaterial({ fog: false, toneMapped: false });
    // Lamplight, each window its own strength, breathing very slowly (never a flicker, 0050).
    const glow = attribute("glow", "float");
    w.colorNode = color("#ffb35a")
      .mul(glow.mul(1.6))
      .mul(
        sin(time.mul(0.3).add(glow.mul(9)))
          .mul(0.06)
          .add(1),
      );

    const n = new MeshBasicNodeMaterial({ fog: false, toneMapped: false, transparent: true, depthWrite: false });
    n.colorNode = color(CYAN);
    n.opacityNode = float(0.38).add(sin(time.mul(0.4)).mul(0.08));
    return { geometry: stone(), ground: hill(), material: m, lights: windows(), warm: w, lines: network(), cyan: n };
  }, []);
  return (
    <group position={[PALACE.x, 0, PALACE.z]}>
      <mesh geometry={ground} material={material} />
      <group position={[0, LIFT, 0]} scale={PALACE_SCALE}>
        <mesh geometry={geometry} material={material} />
        <mesh geometry={lights} material={warm} />
        <mesh geometry={lines} material={cyan} />
      </group>
    </group>
  );
}

/** The ground beyond the clearing, to the palace's hill: plain, dark, and lost in the fog. */
export function FarGround() {
  return (
    <mesh position={[0, -0.5, -40]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[90, 24]} />
      <meshBasicMaterial color="#0e131b" />
    </mesh>
  );
}
