import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, type BufferGeometry, Matrix4 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { attribute, cos, cross, dot, positionLocal, sin, uniform } from "three/tsl";
import { ownRegionMaterial } from "../kit/regionMaterials";
import { gearGeometry } from "../kit/shapes";
import type { RegionId } from "../region";
import type { Gear } from "../room/layout";
import { ruin } from "../ruin";

// The Sorting Works' gear trains (region-2 brief): brass gears on the walls, seized in ruin, turning
// slowly once the room is restored ("gears start turning"). All gears are one mesh (one draw call);
// each vertex knows its gear's pivot, axis and speed, and the shader turns it by one shared angle.
// Slow and steady: background life, never a focus.

const SPEED = 0.22; // radians per second for a gear of spin 1, when fully restored

export function Gears({ gears, region }: { gears: Gear[]; region: RegionId }) {
  const angle = useMemo(() => uniform(0), []);
  const { geometry, material } = useMemo(() => {
    const parts: BufferGeometry[] = [];
    for (const g of gears) {
      const shape = gearGeometry(g.radius, g.teeth, 0.06, g.spokes ?? 0);
      const out = g.out ?? 0.08;
      // Made facing +z round the origin; set on its wall.
      const at =
        g.wall === "back"
          ? new Matrix4().makeTranslation(g.along, g.y, -4 + out)
          : new Matrix4().makeRotationY(Math.PI / 2).premultiply(new Matrix4().makeTranslation(-4 + out, g.y, g.along));
      shape.applyMatrix4(at);
      const n = shape.getAttribute("position").count;
      const pivot = new Float32Array(n * 3);
      const axis = new Float32Array(n * 3);
      const spin = new Float32Array(n);
      const [px, py, pz] = g.wall === "back" ? [g.along, g.y, -4 + out] : [-4 + out, g.y, g.along];
      const [ax, az] = g.wall === "back" ? [0, 1] : [1, 0];
      for (let i = 0; i < n; i++) {
        pivot.set([px, py, pz], i * 3);
        axis.set([ax, 0, az], i * 3);
        spin[i] = g.spin;
      }
      shape.setAttribute("pivot", new BufferAttribute(pivot, 3));
      shape.setAttribute("axis", new BufferAttribute(axis, 3));
      shape.setAttribute("spin", new BufferAttribute(spin, 1));
      parts.push(shape);
    }
    // A hall whose far walls are all doorways has no gears (mergeGeometries throws on none).
    const merged = parts.length ? mergeGeometries(parts) : null;
    const m = ownRegionMaterial("Brass", region);
    // Rodrigues' rotation round each gear's own axis through its pivot.
    const pivot = attribute("pivot", "vec3");
    const k = attribute("axis", "vec3");
    const theta = angle.mul(attribute("spin", "float"));
    const p = positionLocal.sub(pivot);
    const c = cos(theta);
    const s = sin(theta);
    const turned = p
      .mul(c)
      .add(cross(k, p).mul(s))
      .add(k.mul(dot(k, p)).mul(c.oneMinus()));
    m.positionNode = turned.add(pivot);
    return { geometry: merged, material: m };
  }, [gears, region, angle]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  useFrame((_, delta) => {
    // Seized in ruin; turning as the room comes back.
    angle.value += Math.min(delta, 0.1) * SPEED * Math.max(0, 1 - ruin.value);
  });

  return geometry ? <mesh geometry={geometry} material={material} frustumCulled={false} /> : null;
}
