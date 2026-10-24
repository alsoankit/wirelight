import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { attribute, color, float, fract, length, mix, positionLocal, sin, smoothstep, time, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { VIEW_DIRECTION } from "../RoomCamera";
import type { Vec3 } from "../room/layout";
import { ruin } from "../ruin";

// The Sorting Works' steam (region-2 brief: "steam puffs"; in ruin "cold vapour", restored "steam
// warms to amber"): a few soft wisps rising slowly from the valves and vents the layout names. Pale
// grey-blue and sparse in ruin, warm and a little fuller restored. Slow and faint: background life,
// never a focus, never in front of a gameplay object. One draw call for every vent in the room; each
// wisp is a quad turned toward the fixed camera, moved in the shader.

const PER_VENT = 6;
const LIFE = 9; // seconds for one wisp to rise and fade

// The camera never turns (RoomCamera), so the quads can face it once, here.
const VIEW = VIEW_DIRECTION.clone();
const RIGHT = new Vector3(0, 1, 0).cross(VIEW).normalize();
const UP = VIEW.clone().cross(RIGHT).normalize();

export function Steam({ vents }: { vents: Vec3[] }) {
  const geometry = useMemo(() => {
    const n = vents.length * PER_VENT;
    const position = new Float32Array(n * 4 * 3);
    const corner = new Float32Array(n * 4 * 2);
    const phase = new Float32Array(n * 4);
    const index: number[] = [];
    vents.forEach((v, i) => {
      for (let k = 0; k < PER_VENT; k++) {
        const q = i * PER_VENT + k;
        // Staggered through the wisp's life, with a little of each vent's own rhythm.
        const p = (k + ((i * 0.37) % 1)) / PER_VENT;
        [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [-0.5, 0.5],
        ].forEach(([cx, cy], c) => {
          position.set(v, (q * 4 + c) * 3);
          corner.set([cx as number, cy as number], (q * 4 + c) * 2);
          phase[q * 4 + c] = p;
        });
        const b = q * 4;
        index.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(position, 3));
    g.setAttribute("corner", new BufferAttribute(corner, 2));
    g.setAttribute("phase", new BufferAttribute(phase, 1));
    g.setIndex(index);
    return g;
  }, [vents]);

  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const corner = attribute("corner", "vec2");
    const phase = attribute("phase", "float");
    const t = fract(time.div(LIFE).add(phase));
    const right = vec3(RIGHT.x, RIGHT.y, RIGHT.z);
    const up = vec3(UP.x, UP.y, UP.z);
    // Rising and slowing, swaying a little, spreading as it goes.
    const rise = t.mul(float(2).sub(t)).mul(0.75);
    const sway = sin(t.mul(4).add(phase.mul(6.28)))
      .mul(t)
      .mul(0.08);
    const size = t.mul(0.34).add(0.08);
    m.positionNode = positionLocal
      .add(vec3(0, rise, 0))
      .add(right.mul(sway))
      .add(right.mul(corner.x.mul(size)))
      .add(up.mul(corner.y.mul(size)));
    const soft = float(1).sub(smoothstep(0.1, 0.5, length(corner)));
    const fade = smoothstep(0, 0.18, t).mul(float(1).sub(smoothstep(0.4, 1, t)));
    m.colorNode = mix(color("#E9D3B4"), color("#9EA6B0"), ruin);
    m.opacityNode = soft.mul(fade).mul(mix(float(0.22), float(0.13), ruin));
    return m;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return vents.length > 0 ? <mesh geometry={geometry} material={material} frustumCulled={false} /> : null;
}
