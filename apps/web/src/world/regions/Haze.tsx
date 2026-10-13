import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, DoubleSide, type Mesh, PlaneGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { color, float, mx_noise_float, positionWorld, smoothstep, time, uniform, uv, vec2 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { ruin } from "../ruin";

// A little incense haze in the Cathedral (region-4 brief): a few soft, faint sheets of warm air hung
// through the room, drifting slowly, there only as the room restores. One draw call; background only.

export function Haze() {
  const level = useMemo(() => uniform(0), []);
  const mesh = useRef<Mesh>(null);
  const { geometry, material } = useMemo(() => {
    const sheets = [
      { at: [-1.2, 1.6, -1.6], turn: 0.785 },
      { at: [0.8, 1.9, -0.2], turn: 0.785 },
      { at: [-2.2, 1.4, 0.8], turn: 0.785 },
    ].map(({ at, turn }) => {
      const g = new PlaneGeometry(4.5, 2.6);
      g.rotateY(turn);
      g.translate(at[0] as number, at[1] as number, at[2] as number);
      return g;
    });
    const m = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    });
    const edge = float(1).sub(smoothstep(0.15, 0.5, uv().sub(vec2(0.5, 0.5)).length()));
    const drift = mx_noise_float(positionWorld.mul(0.6).add(vec2(time.mul(0.05), 0).xxy))
      .mul(0.5)
      .add(0.5);
    m.colorNode = color("#C9A27A").mul(edge.mul(drift).mul(level).mul(0.07));
    return { geometry: mergeGeometries(sheets), material: m };
  }, [level]);
  useFrame(() => {
    level.value = 1 - ruin.value;
    if (mesh.current) mesh.current.visible = level.value > 0.02;
  });
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />;
}
