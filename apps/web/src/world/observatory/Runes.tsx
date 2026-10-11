import { useMemo } from "react";
import { BoxGeometry, type BufferGeometry, Matrix4, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { color, mix } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ruinHere } from "../ruin";

// Runes carved into the stone by the first wire-weavers (0052): the room's own light. They are laid
// out as carved shapes scattered over the standing walls: a diamond, a triangle, rings, small
// triangles on the doorway's jambs, a sigil on the upper wall (owner: shapes, not long lines; nothing
// over the arch). Dark in ruin; they relight one by one as
// the restoration wave reaches them (the material reads the ruin at its own position). All strokes
// are one mesh (one draw call); each area also casts a warm light (RUNE_GLOWS, used by RoomLights).
// Invented glyphs, not a real alphabet.

type Stroke = [number, number, number, number]; // u1, v1, u2, v2 in a glyph box of 1 × 1.5, centred

const GLYPHS: Stroke[][] = [
  [
    [0, -0.75, 0, 0.75],
    [0, 0.25, 0.4, 0.55],
    [0, -0.15, 0.4, 0.15],
  ],
  [
    [0, 0.75, 0.4, 0],
    [0.4, 0, 0, -0.75],
    [0, -0.75, -0.4, 0],
    [-0.4, 0, 0, 0.75],
  ],
  [
    [0, -0.75, 0, 0.75],
    [-0.4, 0.35, 0, 0.75],
    [0, 0.75, 0.4, 0.35],
  ],
  [
    [-0.35, -0.55, 0.35, 0.55],
    [-0.35, 0.55, 0.35, -0.55],
  ],
  [
    [-0.25, -0.75, -0.25, 0.75],
    [0.25, -0.75, 0.25, 0.75],
    [-0.25, 0.75, 0.25, 0.05],
  ],
  [
    [0, -0.75, 0, 0.75],
    [-0.35, -0.2, 0.35, -0.2],
    [-0.35, 0.3, 0.35, 0.3],
  ],
  [
    [-0.3, -0.75, -0.3, 0.75],
    [-0.3, 0.75, 0.3, 0.35],
    [0.3, 0.35, -0.3, -0.05],
    [-0.3, -0.05, 0.3, -0.75],
  ],
  [
    [0, -0.75, 0, 0.2],
    [0, 0.2, -0.35, 0.75],
    [0, 0.2, 0.35, 0.75],
  ],
];

type Wall = { normal: Vector3; u: Vector3 };
type Mark = { centre: Vector3; u: Vector3; v: Vector3; normal: Vector3; size: number; glyph: number };
type Stroke3 = { a: Vector3; b: Vector3; normal: Vector3 };

const UP = new Vector3(0, 1, 0);
const FACE = -3.965; // both walls' inner faces sit here (z for the back wall, x for the left)
const BACK: Wall = { normal: new Vector3(0, 0, 1), u: new Vector3(1, 0, 0) };
const LEFT: Wall = { normal: new Vector3(1, 0, 0), u: new Vector3(0, 0, 1) };

const onBack = (x: number, y: number) => new Vector3(x, y, FACE);
const onLeft = (z: number, y: number) => new Vector3(FACE, y, z);

// Deterministic variety: step through the glyphs in a fixed, uneven order.
let step = 0;
function nextGlyph(): number {
  step = (step + 3) % GLYPHS.length;
  return step;
}

// A run of glyphs along a line on a wall.
function row(from: Vector3, to: Vector3, count: number, wall: Wall, size = 0.17): Mark[] {
  return Array.from({ length: count }, (_, i) => ({
    centre: from.clone().lerp(to, count === 1 ? 0.5 : i / (count - 1)),
    u: wall.u,
    v: UP,
    normal: wall.normal,
    size,
    glyph: nextGlyph(),
  }));
}

// Glyphs round an arc (angles in radians, 0 = along the wall's u), each standing on the curve:
// its up points away from the centre.
function arc(centre: Vector3, radius: number, angles: number[], wall: Wall, size = 0.17): Mark[] {
  return angles.map((a) => {
    const radial = wall.u.clone().multiplyScalar(Math.cos(a)).addScaledVector(UP, Math.sin(a));
    const tangent = wall.u.clone().multiplyScalar(Math.sin(a)).addScaledVector(UP, -Math.cos(a));
    return {
      centre: centre.clone().addScaledVector(radial, radius),
      u: tangent,
      v: radial,
      normal: wall.normal,
      size,
      glyph: nextGlyph(),
    };
  });
}

function spread(from: number, to: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
}

// A circle drawn as short strokes (the sigil's rings).
function ring(centre: Vector3, radius: number, wall: Wall, segments = 32): Stroke3[] {
  const p = (a: number) =>
    centre
      .clone()
      .addScaledVector(wall.u, Math.cos(a) * radius)
      .addScaledVector(UP, Math.sin(a) * radius);
  return Array.from({ length: segments }, (_, i) => ({
    a: p((i / segments) * Math.PI * 2),
    b: p(((i + 1) / segments) * Math.PI * 2),
    normal: wall.normal,
  }));
}

// Glyphs at the corners of a regular shape, each standing on the shape (up = away from its centre),
// with the shape itself carved between them.
function shape(centre: Vector3, radius: number, sides: number, turn: number, wall: Wall, size = 0.12): Mark[] {
  const angles = Array.from({ length: sides }, (_, i) => turn + (i / sides) * Math.PI * 2);
  return [
    ...arc(centre, radius, angles, wall, size),
    { centre: centre.clone(), u: wall.u, v: UP, normal: wall.normal, size: size * 1.3, glyph: nextGlyph() },
  ];
}

function outline(centre: Vector3, radius: number, sides: number, turn: number, wall: Wall): Stroke3[] {
  const corner = (i: number) => {
    const a = turn + (i / sides) * Math.PI * 2;
    return centre
      .clone()
      .addScaledVector(wall.u, Math.cos(a) * radius)
      .addScaledVector(UP, Math.sin(a) * radius);
  };
  return Array.from({ length: sides }, (_, i) => ({ a: corner(i), b: corner(i + 1), normal: wall.normal }));
}

const SIGIL = onBack(-3.0, 2.78);
const DIAMOND = onBack(-3.0, 1.05);
const TRIANGLE = onLeft(-2.95, 1.05);
const SMALL_RING = onLeft(-1.0, 1.15);
const JAMB_LEFT = onBack(-1.58, 1.6);
const JAMB_RIGHT = onBack(1.58, 1.6);
const STUB = onBack(2.6, 1.0);

// Carved shapes scattered over the standing walls (no long lines, nothing over the doorway).
const MARKS: Mark[] = [
  ...shape(DIAMOND, 0.42, 4, Math.PI / 2, BACK),
  ...shape(TRIANGLE, 0.42, 3, Math.PI / 2, LEFT),
  ...arc(SMALL_RING, 0.3, spread(0, (Math.PI * 2 * 5) / 6, 6), LEFT, 0.1),
  ...shape(JAMB_LEFT, 0.26, 3, Math.PI / 2, BACK, 0.09),
  ...shape(JAMB_RIGHT, 0.26, 3, Math.PI / 2, BACK, 0.09),
  ...shape(STUB, 0.3, 4, Math.PI / 2, BACK, 0.1),
  // The sigil on the upper wall: eight small glyphs round a large one, inside two carved rings.
  ...arc(
    SIGIL,
    0.36,
    spread(0, (Math.PI * 2 * 7) / 8, 8).map((a) => a + Math.PI / 2),
    BACK,
    0.11,
  ),
  { centre: SIGIL.clone(), u: BACK.u, v: UP, normal: BACK.normal, size: 0.22, glyph: 1 },
];

const RINGS: Stroke3[] = [
  ...ring(SIGIL, 0.2, BACK, 24),
  ...ring(SIGIL, 0.52, BACK, 40),
  ...ring(SMALL_RING, 0.46, LEFT, 32),
  ...outline(DIAMOND, 0.62, 4, Math.PI / 2, BACK),
  ...outline(TRIANGLE, 0.66, 3, Math.PI / 2, LEFT),
  ...outline(JAMB_LEFT, 0.4, 3, Math.PI / 2, BACK),
  ...outline(JAMB_RIGHT, 0.4, 3, Math.PI / 2, BACK),
  ...outline(STUB, 0.44, 4, Math.PI / 2, BACK),
];

// The warm light each carved area casts (a little out from the wall).
export const RUNE_GLOWS: { position: [number, number, number]; colour: string; strength: number }[] = [
  { position: [-3.0, 1.8, -3.4], colour: "#FFD08A", strength: 2.6 }, // the diamond and the sigil
  { position: [-3.4, 1.2, -2.0], colour: "#FFD08A", strength: 2.6 }, // the triangle and the small ring
  { position: [0.6, 1.7, -3.35], colour: "#FFD08A", strength: 2.2 }, // the jambs and the stub
];

const STROKE_DEPTH = 0.012;

function strokeBox(a: Vector3, b: Vector3, normal: Vector3, width: number): BufferGeometry {
  const box = new BoxGeometry(a.distanceTo(b) + width, width, STROKE_DEPTH);
  const x = b.clone().sub(a).normalize();
  const y = new Vector3().crossVectors(normal, x);
  const centre = a.clone().add(b).multiplyScalar(0.5).addScaledVector(normal, 0.006);
  return box.applyMatrix4(new Matrix4().makeBasis(x, y, normal).setPosition(centre));
}

function buildGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const mark of MARKS) {
    for (const [u1, v1, u2, v2] of GLYPHS[mark.glyph] ?? []) {
      const a = mark.centre
        .clone()
        .addScaledVector(mark.u, u1 * mark.size)
        .addScaledVector(mark.v, v1 * mark.size);
      const b = mark.centre
        .clone()
        .addScaledVector(mark.u, u2 * mark.size)
        .addScaledVector(mark.v, v2 * mark.size);
      parts.push(strokeBox(a, b, mark.normal, Math.max(0.014, mark.size * 0.13)));
    }
  }
  for (const s of RINGS) parts.push(strokeBox(s.a, s.b, s.normal, 0.016));
  return mergeGeometries(parts) ?? new BoxGeometry(0, 0, 0);
}

export function Runes() {
  const { geometry, material } = useMemo(() => {
    const mat = new MeshStandardNodeMaterial({ roughness: 0.9 });
    mat.colorNode = color("#2a2622");
    // Dark in ruin (a faint ember so they can still be noticed), glowing gold where restored.
    mat.emissiveNode = color("#FFD08A").mul(mix(1.6, 0.035, ruinHere));
    return { geometry: buildGeometry(), material: mat };
  }, []);
  return <mesh geometry={geometry} material={material} />;
}
