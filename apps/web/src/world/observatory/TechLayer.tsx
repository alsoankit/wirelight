import { regionMaterial, techMaterial } from "../kit/regionMaterials";

// The modern layer of the Observatory (0050): circuitry set into the ancient stone, and the machine's
// core built into the left wall, half swallowed by growth. Dormant in ruin, awake when restored.
// All its light is the tech neon, never the colours reserved for gameplay (art-direction.md).

type Trace = { from: [number, number]; to: [number, number] };

// Traces on the back wall's inner face (z just in front of −4), as [x, y] points. They run from the
// core's corner along the wall and frame the doorway.
// Only where the stone is whole: none across the doorway or the broken top of the arch.
const BACK_WALL_TRACES: Trace[] = [
  { from: [-3.75, 1.15], to: [-1.6, 1.15] },
  { from: [-1.6, 1.15], to: [-1.6, 2.4] },
  { from: [-3.75, 0.75], to: [-2.3, 0.75] },
  { from: [-2.3, 0.75], to: [-2.3, 0.35] },
];

// Traces on the left wall's inner face (x just in front of −4), as [z, y] points.
const LEFT_WALL_TRACES: Trace[] = [
  { from: [-3.75, 1.15], to: [-1.85, 1.15] },
  { from: [-0.15, 1.6], to: [0.4, 1.6] },
  { from: [0.4, 1.6], to: [0.4, 2.0] },
];

const WIDTH = 0.045;

function BackTrace({ from, to, phase }: Trace & { phase: number }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  return (
    <mesh position={[(x1 + x2) / 2, (y1 + y2) / 2, -3.955]} material={techMaterial(phase)}>
      <boxGeometry args={[Math.abs(x2 - x1) + WIDTH, Math.abs(y2 - y1) + WIDTH, 0.02]} />
    </mesh>
  );
}

function LeftTrace({ from, to, phase }: Trace & { phase: number }) {
  const [z1, y1] = from;
  const [z2, y2] = to;
  return (
    <mesh position={[-3.955, (y1 + y2) / 2, (z1 + z2) / 2]} material={techMaterial(phase)}>
      <boxGeometry args={[0.02, Math.abs(y2 - y1) + WIDTH, Math.abs(z2 - z1) + WIDTH]} />
    </mesh>
  );
}

// The machine's core: an iron cabinet set into the stone, rows of status lights, a vent.
function Core({ z }: { z: number }) {
  const rows = 6;
  const columns = 4;
  return (
    <group position={[-3.8, 0, z]}>
      <mesh position={[0.05, 1.05, 0]} material={regionMaterial("Iron")} castShadow receiveShadow>
        <boxGeometry args={[0.32, 2.1, 1.3]} />
      </mesh>
      <mesh position={[0.22, 2.12, 0]} material={regionMaterial("Brass")} castShadow>
        <boxGeometry args={[0.06, 0.08, 1.4]} />
      </mesh>
      {Array.from({ length: rows * columns }, (_, i) => {
        const row = Math.floor(i / columns);
        const col = i % columns;
        return (
          <mesh
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed grid of lights
            key={i}
            position={[0.215, 1.75 - row * 0.14, -0.42 + col * 0.12]}
            material={techMaterial((i * 1.37) % 6.28)}
          >
            <boxGeometry args={[0.01, 0.04, 0.07]} />
          </mesh>
        );
      })}
      {/* the vent: dark slats */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed slats
          key={i}
          position={[0.215, 0.95 - i * 0.09, 0.25]}
          material={regionMaterial("Black")}
        >
          <boxGeometry args={[0.012, 0.03, 0.5]} />
        </mesh>
      ))}
    </group>
  );
}

export function TechLayer() {
  return (
    <>
      {BACK_WALL_TRACES.map((t, i) => (
        <BackTrace key={`b${t.from}${t.to}`} {...t} phase={i * 0.7} />
      ))}
      {LEFT_WALL_TRACES.map((t, i) => (
        <LeftTrace key={`l${t.from}${t.to}`} {...t} phase={2 + i * 0.7} />
      ))}
      <Core z={-1.1} />
    </>
  );
}
