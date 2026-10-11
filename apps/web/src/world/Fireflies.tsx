import { useMemo } from "react";
import { AdditiveBlending } from "three";
import { color, float, hash, instanceIndex, mix, positionLocal, sin, smoothstep, step, time, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { ruin } from "./ruin";

// Fireflies drifting through the air (region-1 brief, 0051): one instanced draw call, all motion on
// the GPU. Each wanders slowly around its own home and blinks on its own rhythm, every 2.5–6 s:
// a soft rise over about half a second and a slower fade, never a fast flicker (0050).
// A third of them show in ruin; nearly all once the room is restored.

type Bounds = { min: [number, number, number]; max: [number, number, number] };

const COUNT = 60;
const GLOW = "#D9F28A"; // warm yellow-green: never cyan, which means "alive" (messages)

export function Fireflies({ bounds }: { bounds: Bounds }) {
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const i = float(instanceIndex);
    const h1 = hash(i);
    const h2 = hash(i.add(17.3));
    const h3 = hash(i.add(41.7));
    const h4 = hash(i.add(73.1));
    const h5 = hash(i.add(97.9));
    const [x0, y0, z0] = bounds.min;
    const [x1, y1, z1] = bounds.max;
    const home = vec3(mix(float(x0), float(x1), h1), mix(float(y0), float(y1), h2), mix(float(z0), float(z1), h3));
    // Slow wandering: each axis its own speed (tens of seconds per loop) and phase.
    const wander = vec3(
      sin(time.mul(h4.mul(0.25).add(0.12)).add(h1.mul(6.28))).mul(0.6),
      sin(time.mul(h5.mul(0.2).add(0.08)).add(h2.mul(6.28))).mul(0.3),
      sin(time.mul(h3.mul(0.25).add(0.1)).add(h4.mul(6.28))).mul(0.6),
    );
    // The blink: within each firefly's period, rise over the first ~12%, fade by ~42%, then rest.
    const period = h5.mul(3.5).add(2.5);
    const phase = time.div(period).add(h4).fract();
    const blink = smoothstep(0.0, 0.12, phase).mul(float(1).sub(smoothstep(0.18, 0.42, phase)));
    // Which ones are out: a third in ruin, nearly all restored.
    const share = mix(float(0.95), float(0.33), ruin);
    const shown = float(1).sub(step(share, hash(i.add(5.5))));
    const glow = shown.mul(blink.mul(2.2).add(0.08));
    m.positionNode = positionLocal.mul(blink.mul(0.6).add(0.4)).add(home).add(wander);
    m.colorNode = color(GLOW).mul(glow);
    return m;
  }, [bounds]);

  return (
    <instancedMesh args={[undefined, undefined, COUNT]} material={material} frustumCulled={false}>
      <icosahedronGeometry args={[0.035, 1]} />
    </instancedMesh>
  );
}
