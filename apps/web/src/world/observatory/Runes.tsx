import { useMemo } from "react";
import { BoxGeometry, type BufferGeometry, Matrix4, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { color, mix } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ruinHere } from "../ruin";

// Runes carved into the stone by the first wire-weavers (0052): the room's own light. Single glyphs
// scattered over the walls, their positions suggesting two or three shapes. Dark in ruin; they
// relight one by one as the restoration wave reaches them (the material reads the ruin at its own
// position). All strokes are one mesh (one draw call); each group also casts a warm light
// (RUNE_GLOWS, used by RoomLights).
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

// A single upright glyph on a wall.
function glyphAt(at: Vector3, wall: Wall, size = 0.18): Mark {
  return { centre: at, u: wall.u, v: UP, normal: wall.normal, size, glyph: nextGlyph() };
}

// Runes scattered over the walls, single glyphs set well apart; only where they sit suggests a shape
// (owner: no carved outlines; the positions convey the shapes). Three shapes, no more:
// - a tall diamond of four glyphs across the back wall, from low stone to the broken top;
// - a wide triangle of three glyphs on the left wall;
// - a shallow arc of three glyphs under the barred window.
const MARKS: Mark[] = [
  glyphAt(onBack(-3.0, 0.7), BACK),
  glyphAt(onBack(-3.6, 1.75), BACK),
  glyphAt(onBack(-2.4, 1.75), BACK),
  glyphAt(onBack(-3.0, 2.85), BACK),
  glyphAt(onLeft(-3.3, 0.8), LEFT),
  glyphAt(onLeft(-0.9, 0.8), LEFT),
  glyphAt(onLeft(-2.1, 1.75), LEFT),
  glyphAt(onLeft(-3.55, 2.32), LEFT, 0.15),
  glyphAt(onLeft(-3.0, 2.18), LEFT, 0.15),
  glyphAt(onLeft(-2.45, 2.32), LEFT, 0.15),
];

// The warm light each group casts (a little out from the wall).
export const RUNE_GLOWS: { position: [number, number, number]; colour: string; strength: number }[] = [
  { position: [-3.0, 1.75, -3.45], colour: "#FFD08A", strength: 2.4 }, // the diamond
  { position: [-3.45, 1.6, -2.4], colour: "#FFD08A", strength: 2.4 }, // the triangle and the window arc
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
