import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh } from "three";
import {
  abs,
  color,
  float,
  mix,
  mx_noise_float,
  mx_worley_noise_float,
  positionWorld,
  smoothstep,
  step,
  vec3,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { SLICE } from "./layout";

// What the descent falls past (ONB-05): the ground cut open like a cross-section (the same idea as
// the world map, 0039), with the glowing cable running straight down its middle. Turf, topsoil with
// tree roots, soil with stones, tilted bands of rock, then deep stone with faint crystals. Unlit: the
// colour is painted from depth and brightened near the cable, the only light down here. Dark
// boulders in front pass by faster than the slice, for depth. Seen only during the descent.

const GLOW = "#57d5de";
const MESSAGE: [number, number, number] = [0.45, 2.1, 2.3];
const BOULDERS: [number, number, number, number][] = [
  // x, y, z (in front of the slice), size
  [-2.6, -2.0, 1.6, 0.6],
  [2.4, -4.6, 2.0, 0.8],
  [-2.2, -7.6, 2.2, 0.9],
  [2.7, -10.4, 1.5, 0.7],
  [-2.8, -13, 1.8, 1.0],
];

export function EarthSlice() {
  const light = useRef<Mesh>(null);
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ fog: false });
    const x = positionWorld.x;
    const depth = positionWorld.y.negate(); // metres below the surface
    const wobble = mx_noise_float(vec3(x.mul(0.6), depth.mul(0.2), 1)).mul(0.25);
    const d = depth.add(wobble);
    // Base layers.
    let c = mix(color("#24331f"), color("#2e2218"), smoothstep(0.15, 0.45, d)); // turf → topsoil
    c = mix(c, color("#3b2c1f"), smoothstep(1.5, 2.5, d)); // soil
    // Tilted rock bands from 5 m down.
    const tilt = d.add(x.mul(0.18));
    const band = mx_noise_float(vec3(0, tilt.mul(0.7), 3))
      .mul(0.5)
      .add(0.5);
    const rock = mix(color("#2c313b"), color("#46505f"), smoothstep(0.35, 0.65, band));
    c = mix(c, rock, smoothstep(3.6, 4.4, d));
    c = mix(c, color("#262b36"), smoothstep(9, 13, d)); // deep stone
    // Stones in the soil: rounded grey lumps.
    const lump = float(1).sub(smoothstep(0.18, 0.26, mx_worley_noise_float(vec3(x.mul(1.6), d.mul(1.6), 0))));
    c = mix(c, color("#55524d"), lump.mul(smoothstep(1.2, 2.2, d)).mul(float(1).sub(smoothstep(3.6, 4.4, d))));
    // Roots: thin pale wandering lines in the topsoil, thinning with depth.
    const rootLine = abs(mx_noise_float(vec3(x.mul(2.4), d.mul(0.9), 7)));
    const roots = float(1)
      .sub(smoothstep(0.02, 0.05, rootLine))
      .mul(float(1).sub(smoothstep(0.6, 3.2, d)));
    c = mix(c, color("#7a6248"), roots.mul(0.85));
    // Cracks in the rock.
    const crack = float(1).sub(smoothstep(0.0, 0.025, abs(mx_noise_float(vec3(x.mul(0.9), tilt.mul(0.5), 11)))));
    c = mix(c, color("#0d0f13"), crack.mul(smoothstep(4, 5, d)).mul(0.8));
    // Grass blades along the very top edge.
    const blades = step(
      mx_noise_float(vec3(x.mul(14), 0, 2))
        .mul(0.08)
        .add(0.06),
      d.negate().add(0.12),
    );
    c = mix(c, color("#3b5a33"), blades);
    // Faint crystals deep down, catching the cable's light.
    // (Small points: where a fine Worley pattern is near zero.)
    const crystal = float(1)
      .sub(smoothstep(0.0, 0.035, mx_worley_noise_float(vec3(x.mul(5), d.mul(5), 4))))
      .mul(
        step(
          0.7,
          mx_noise_float(vec3(x.mul(1.3), d.mul(1.3), 9))
            .mul(0.5)
            .add(0.5),
        ),
      )
      .mul(smoothstep(8, 11, d));
    // The cable's light, falling off to the sides.
    const near = float(1).sub(smoothstep(0, 3.6, abs(x)));
    const lit = c.mul(near.mul(near).mul(1.2).add(0.7)).add(color(GLOW).mul(near.pow(8).mul(0.05)));
    const withCrystals = lit.add(color(GLOW).mul(crystal.mul(near.add(0.3))));
    // The cable itself.
    const cable = float(1).sub(smoothstep(0.025, 0.06, abs(x)));
    m.colorNode = mix(withCrystals, color(GLOW).mul(1.8), cable.mul(smoothstep(0.05, 0.3, d)));
    return m;
  }, []);

  // A message light running down the cable.
  useFrame(({ clock }) => {
    if (!light.current) return;
    const t = (clock.elapsedTime * 0.5) % 1;
    light.current.position.set(0, -0.3 - t * (SLICE.depth - 1), SLICE.z + 0.06);
  });

  return (
    <group>
      <mesh position={[0, -SLICE.depth / 2, SLICE.z]} material={material}>
        <planeGeometry args={[SLICE.width, SLICE.depth]} />
      </mesh>
      {BOULDERS.map(([x, y, z, size]) => (
        <mesh key={`${x}:${y}`} position={[x, y, SLICE.z + z]} rotation={[x, y, 0.4]} scale={size}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color="#0b0d12" fog={false} />
        </mesh>
      ))}
      <mesh ref={light}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshBasicMaterial color={MESSAGE} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}
