import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh, Vector3 } from "three";
import { positionLocal, smoothstep, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";

// The glowing rune-line along the old path, into the gate (ONB-01), with cyan lights drifting along
// it into the dark: messages on their way into the dungeon. Background life, slow and few: one
// enters the gate every few seconds, never a stream. Cyan only for messages (art-direction.md).

const LIGHTS = 3;
const CROSSING = 6; // seconds from the start of the path to the gate
const MESSAGE: [number, number, number] = [0.45, 2.1, 2.3];

type Props = { from: Vector3; to: Vector3 };

export function RuneLine({ from, to }: Props) {
  const lights = useRef<(Mesh | null)[]>([]);
  const length = from.distanceTo(to);
  const { material, centre, yaw } = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ transparent: true, toneMapped: false, depthWrite: false });
    // Faint along its length; fades out at the far end into the gate's dark, and at the near end.
    const along = positionLocal.z.div(length).add(0.5); // 0 at `to`, 1 at `from`
    m.colorNode = vec3(0.16, 0.75, 0.8);
    m.opacityNode = smoothstep(0, 0.12, along)
      .mul(smoothstep(1, 0.7, along))
      .mul(0.85);
    const c = from.clone().add(to).multiplyScalar(0.5);
    return { material: m, centre: c, yaw: Math.atan2(from.x - to.x, from.z - to.z) };
  }, [from, to, length]);

  useFrame(({ clock }) => {
    lights.current.forEach((mesh, i) => {
      if (!mesh) return;
      const t = ((clock.elapsedTime + (i * CROSSING) / LIGHTS) % CROSSING) / CROSSING;
      mesh.position.lerpVectors(from, to, t).setY(0.16);
      // Grow out of the path's start, shrink into the gate.
      const size = Math.min(t / 0.12, 1) * Math.min((1 - t) / 0.12, 1);
      mesh.scale.setScalar(size * (1 + Math.sin(clock.elapsedTime * 3 + i) * 0.08));
    });
  });

  return (
    <>
      <mesh position={[centre.x, 0.035, centre.z]} rotation={[0, yaw, 0]} material={material}>
        <boxGeometry args={[0.05, 0.012, length]} />
      </mesh>
      {Array.from({ length: LIGHTS }, (_, i) => (
        <mesh
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed set of lights
          key={i}
          ref={(m) => {
            lights.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.07, 16, 10]} />
          <meshBasicMaterial color={MESSAGE} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
