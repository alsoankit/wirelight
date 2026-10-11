import { useMemo } from "react";
import { AdditiveBlending } from "three";
import { color, float, hash, instanceIndex, mix, mod, positionLocal, sin, time, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { ruin } from "./ruin";
import { windDirection, windTravel } from "./wind";

// Dust in the air (0021): faint motes that hang and drift, carried along when a gust moves through.
// Most visible in ruin, where the moonlight catches them; barely there when restored. Background only.

type Bounds = { min: [number, number, number]; max: [number, number, number] };

const COUNT = 36;

export function Dust({ bounds }: { bounds: Bounds }) {
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const i = float(instanceIndex);
    const h1 = hash(i.add(3.3));
    const h2 = hash(i.add(29.1));
    const h3 = hash(i.add(61.7));
    const h4 = hash(i.add(88.8));
    const [x0, y0, z0] = bounds.min;
    const [x1, y1, z1] = bounds.max;
    const size = vec3(x1 - x0, y1 - y0, z1 - z0);
    const start = vec3(x0, y0, z0);
    // Home, pushed downwind by how far the air has moved, wrapped to stay inside the room.
    const home = start.add(vec3(h1, h2, h3).mul(size));
    const carried = home.add(windDirection.mul(windTravel.mul(h4.mul(0.6).add(0.7))));
    const wrapped = start.add(mod(carried.sub(start), size));
    // A slow hang and sink of its own.
    const hang = vec3(0, sin(time.mul(0.3).add(h4.mul(6.28))).mul(0.12), 0);
    m.positionNode = positionLocal.add(wrapped).add(hang);
    m.colorNode = color("#c8d2e6").mul(mix(float(0.08), float(0.32), ruin).mul(h2.mul(0.5).add(0.5)));
    return m;
  }, [bounds]);

  return (
    <instancedMesh args={[undefined, undefined, COUNT]} material={material} frustumCulled={false}>
      <icosahedronGeometry args={[0.012, 0]} />
    </instancedMesh>
  );
}
