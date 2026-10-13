import {
  BoxGeometry,
  type BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Extra } from "./StaticRoom";

// Simple pieces made in code for the regions whose own kits aren't in yet (Regions 2–4): boxes,
// pipes, gears, gables, pointed windows. Each comes out in world space, unindexed, with only
// position and normal, so pieces sharing a material merge into one mesh (StaticRoom extras).

export type V3 = [number, number, number];

/** Unindexed, position and normal only (what StaticRoom merges). */
export function prep(source: BufferGeometry): BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source;
  const out = new BufferGeometry();
  out.setAttribute("position", (g.getAttribute("position") as BufferAttribute).clone());
  const normal = g.getAttribute("normal");
  if (normal) out.setAttribute("normal", (normal as BufferAttribute).clone());
  else out.computeVertexNormals();
  return out;
}

export function placed(g: BufferGeometry, position: V3, rotation: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
  const m = new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(...scale),
  );
  return prep(g).applyMatrix4(m);
}

export function box(size: V3, position: V3, rotation: V3 = [0, 0, 0]): BufferGeometry {
  return placed(new BoxGeometry(...size), position, rotation);
}

/** A cylinder (pipe, post, rod) from one point to another. */
export function rod(from: V3, to: V3, radius: number, segments = 10, radiusTo = radius): BufferGeometry {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const length = a.distanceTo(b);
  const g = prep(new CylinderGeometry(radiusTo, radius, length, segments, 1, false));
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return g.applyMatrix4(new Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
}

export function ball(at: V3, radius: number, segments = 10): BufferGeometry {
  return placed(new SphereGeometry(radius, segments, Math.max(4, Math.round(segments * 0.6))), at);
}

/** A ring (a flange round a pipe, a dial's rim) facing along `axis`. */
export function ring(at: V3, radius: number, tube: number, axis: "x" | "y" | "z", segments = 18): BufferGeometry {
  const rotation: V3 = axis === "z" ? [0, 0, 0] : axis === "x" ? [0, Math.PI / 2, 0] : [Math.PI / 2, 0, 0];
  return placed(new TorusGeometry(radius, tube, 6, segments), at, rotation);
}

/** A pipe along a path of points, with a round joint at each bend and a flange now and then. */
export function pipe(points: V3[], radius: number, flanges = true): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as V3;
    const b = points[i + 1] as V3;
    parts.push(rod(a, b, radius, 10));
    if (i > 0) parts.push(ball(a, radius * 1.25, 10));
    if (flanges) {
      const axis = Math.abs(b[0] - a[0]) > 0.01 ? "x" : Math.abs(b[1] - a[1]) > 0.01 ? "y" : "z";
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      for (let d = 0.6; d < length - 0.3; d += 1.4) {
        const t = d / length;
        parts.push(
          ring(
            [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
            radius * 1.15,
            radius * 0.35,
            axis,
            12,
          ),
        );
      }
    }
  }
  return parts;
}

/** A gear's outline: `teeth` teeth round a rim, a hub hole, extruded `thickness` (centred, facing +z). */
export function gearGeometry(radius: number, teeth: number, thickness: number, spokes = 0): BufferGeometry {
  const shape = new Shape();
  const root = radius * 0.86;
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const r = i % 4 === 1 || i % 4 === 2 ? radius : root;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const holes: Shape[] = [];
  if (spokes > 0) {
    // Windows between the spokes: lighter-looking wheels for the big gears.
    const inner = root * 0.78;
    const hub = radius * 0.24;
    for (let s = 0; s < spokes; s++) {
      const a0 = (s / spokes) * Math.PI * 2 + 0.22;
      const a1 = ((s + 1) / spokes) * Math.PI * 2 - 0.22;
      const hole = new Shape();
      hole.moveTo(Math.cos(a0) * hub * 1.3, Math.sin(a0) * hub * 1.3);
      for (let k = 0; k <= 6; k++) {
        const a = a0 + ((a1 - a0) * k) / 6;
        hole.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
      }
      hole.lineTo(Math.cos(a1) * hub * 1.3, Math.sin(a1) * hub * 1.3);
      holes.push(hole);
    }
  } else {
    const hole = new Shape();
    hole.absarc(0, 0, radius * 0.18, 0, Math.PI * 2, true);
    holes.push(hole);
  }
  shape.holes = holes;
  const g = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -thickness / 2);
  return prep(g);
}

/**
 * A house's gable end and roof, facing +z, centred on x = 0, its base at y = 0 on the wall face
 * (z = 0), the roof running back along −z for `depth`. Returns the triangular end and the two slopes.
 */
export function gable(width: number, rise: number, depth: number, overhang = 0.14) {
  const end = new Shape();
  end.moveTo(-width / 2, 0);
  end.lineTo(width / 2, 0);
  end.lineTo(0, rise);
  end.lineTo(-width / 2, 0);
  const wall = prep(new ExtrudeGeometry(end, { depth: 0.25, bevelEnabled: false })).translate(0, 0, -0.25);
  const half = width / 2 + overhang;
  const slope = Math.hypot(half, rise + overhang * (rise / (width / 2)));
  const angle = Math.atan2(rise, width / 2);
  const roofs = [-1, 1].map((side) =>
    box(
      [slope, 0.08, depth + overhang],
      [(side * half) / 2, rise / 2 + 0.03, -(depth - overhang) / 2],
      [0, 0, -side * angle],
    ),
  );
  return { wall, roofs };
}

/** A flat wall `width` × `height` (facing +z, centred on x = 0, base at y = 0) with holes cut out. */
export function wallWithHoles(width: number, height: number, depth: number, holes: Shape[]): BufferGeometry {
  const s = new Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.lineTo(-width / 2, 0);
  s.holes = holes;
  return prep(new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 })).translate(0, 0, -depth);
}

/** A doorway's outline from its left foot round to its right foot: pointed (lancet) or square. */
function doorOutline(doorWidth: number, doorHeight: number, pointed: boolean): [number, number][] {
  const w = doorWidth / 2;
  if (!pointed)
    return [
      [-w, 0],
      [-w, doorHeight],
      [w, doorHeight],
      [w, 0],
    ];
  const spring = Math.max(0, doorHeight - w * Math.sqrt(3));
  const points: [number, number][] = [[-w, 0]];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = ((i / steps) * Math.PI) / 3;
    points.push([w - 2 * w * Math.cos(a), spring + 2 * w * Math.sin(a)]);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const a = ((i / steps) * Math.PI) / 3;
    points.push([-w + 2 * w * Math.cos(a), spring + 2 * w * Math.sin(a)]);
  }
  points.push([w, 0]);
  return points;
}

/** A wall `width` × `height` with a doorway cut up from the floor (facing +z, centred, base at y = 0). */
export function wallWithDoor(
  width: number,
  height: number,
  depth: number,
  doorWidth: number,
  doorHeight: number,
  pointed: boolean,
): BufferGeometry {
  const s = new Shape();
  s.moveTo(-width / 2, 0);
  for (const [x, y] of doorOutline(doorWidth, doorHeight, pointed)) s.lineTo(x, y);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.lineTo(-width / 2, 0);
  return prep(new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 })).translate(0, 0, -depth);
}

/** A moulded frame round a doorway: a band `border` wide following its outline (facing +z). */
export function doorFrame(doorWidth: number, doorHeight: number, border: number, depth: number, pointed: boolean) {
  const outer = doorOutline(doorWidth + border * 2, doorHeight + border * (pointed ? 1.6 : 1), pointed);
  const inner = doorOutline(doorWidth, doorHeight, pointed);
  const s = new Shape();
  const [ox, oy] = outer[0] as [number, number];
  s.moveTo(ox, oy);
  for (const [x, y] of outer.slice(1)) s.lineTo(x, y);
  for (const [x, y] of [...inner].reverse()) s.lineTo(x, y);
  s.lineTo(ox, oy);
  return prep(new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 }));
}

/** A rectangle outline, for holes. */
export function rectShape(x0: number, y0: number, x1: number, y1: number): Shape {
  const s = new Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.lineTo(x0, y0);
  return s;
}

/** A pointed (equilateral) arch outline `width` wide, `height` tall from its sill, extruded `depth` (facing +z). */
export function lancetShape(width: number, height: number, y0 = 0): Shape {
  const w = width / 2;
  const spring = y0 + Math.max(0, height - w * Math.sqrt(3)); // where the arch begins
  const s = new Shape();
  s.moveTo(-w, y0);
  s.lineTo(w, y0);
  s.lineTo(w, spring);
  const steps = 8;
  // Each side is an arc of radius `width` round the opposite springing point.
  for (let i = 1; i <= steps; i++) {
    const a = ((i / steps) * Math.PI) / 3;
    s.lineTo(-w + 2 * w * Math.cos(a), spring + 2 * w * Math.sin(a));
  }
  for (let i = steps - 1; i >= 0; i--) {
    const a = ((i / steps) * Math.PI) / 3;
    s.lineTo(w - 2 * w * Math.cos(a), spring + 2 * w * Math.sin(a));
  }
  s.lineTo(-w, y0);
  return s;
}

export function lancet(width: number, height: number, depth: number): BufferGeometry {
  return prep(new ExtrudeGeometry(lancetShape(width, height), { depth, bevelEnabled: false, curveSegments: 4 }));
}

/** A frame round a pointed arch: the outer outline with the inner one cut out. */
export function lancetFrame(width: number, height: number, border: number, depth: number): BufferGeometry {
  // The border runs under the sill too: the outer outline starts `border` below the opening.
  const outer = lancetShape(width + border * 2, height + border * 2.2, -border);
  outer.holes = [lancetShape(width, height)];
  return prep(new ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 4 }));
}

/** Moves geometry made facing +z (on the back wall) onto a wall: "back" keeps it, "left" turns it to face +x. */
export function onWall(g: BufferGeometry, wall: "back" | "left", along: number, y: number, out = 0): BufferGeometry {
  const face = -4 + out;
  const m =
    wall === "back"
      ? new Matrix4().makeTranslation(along, y, face)
      : new Matrix4().makeRotationY(Math.PI / 2).premultiply(new Matrix4().makeTranslation(face, y, along));
  return g.applyMatrix4(m);
}

/** Groups pieces by material into StaticRoom extras (one mesh per material). */
export function extras(byMaterial: Record<string, BufferGeometry[]>): Extra[] {
  const out: Extra[] = [];
  for (const [name, parts] of Object.entries(byMaterial)) {
    if (parts.length === 0) continue;
    const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts);
    if (geometry) out.push({ name, geometry });
  }
  return out;
}

export function addTo(bag: Record<string, BufferGeometry[]>, name: string, ...parts: BufferGeometry[]) {
  const list = bag[name] ?? [];
  list.push(...parts);
  bag[name] = list;
}
