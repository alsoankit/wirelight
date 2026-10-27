import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type Mesh, Vector3 } from "three";
import { float, positionLocal, smoothstep, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";

// The glowing rune-line along the old path (ONB-01), under the gate's doors and on toward the palace,
// with cyan lights drifting along it: messages on their way in. Background life, slow and few: one
// passes the gate every few seconds, never a stream. Cyan only for messages (art-direction.md).

const LIGHTS = 4;
const SPEED = 1.1; // metres a second: an unhurried walk
const MESSAGE: [number, number, number] = [0.45, 2.1, 2.3];

type Props = { points: Vector3[] };

export function RuneLine({ points }: Props) {
  const lights = useRef<(Mesh | null)[]>([]);
  const { segments, total } = useMemo(() => {
    const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i] as Vector3));
    const total = lengths.reduce((a, b) => a + b, 0);
    let walked = 0;
    const segments = lengths.map((length, i) => {
      const from = points[i] as Vector3;
      const to = points[i + 1] as Vector3;
      const m = new MeshBasicNodeMaterial({ transparent: true, toneMapped: false, depthWrite: false });
      // Along the whole line (0 at its start, 1 at its end), for fading in at the start and out at the end.
      // The box's local +z points back toward `from`.
      const along = float(length / 2)
        .sub(positionLocal.z)
        .add(walked)
        .div(total);
      m.colorNode = vec3(0.16, 0.75, 0.8);
      m.opacityNode = smoothstep(0, 0.15, along)
        .mul(smoothstep(1, 0.6, along))
        .mul(0.85);
      walked += length;
      return {
        length,
        material: m,
        centre: from.clone().add(to).multiplyScalar(0.5),
        yaw: Math.atan2(from.x - to.x, from.z - to.z),
      };
    });
    return { segments, total };
  }, [points]);

  const at = useMemo(() => new Vector3(), []);
  useFrame(({ clock }) => {
    const crossing = total / SPEED;
    lights.current.forEach((mesh, i) => {
      if (!mesh) return;
      const t = ((clock.elapsedTime + (i * crossing) / LIGHTS) % crossing) / crossing;
      // Find the light's segment, then its place on it.
      let d = t * total;
      let k = 0;
      while (k < segments.length - 1 && d > (segments[k]?.length ?? 0)) d -= segments[k++]?.length ?? 0;
      const from = points[k] as Vector3;
      const to = points[k + 1] as Vector3;
      at.lerpVectors(from, to, d / (segments[k]?.length ?? 1));
      mesh.position.set(at.x, 0.16, at.z);
      // Grow out of the path's start, fade into the distance toward the palace.
      const size = Math.min(t / 0.08, 1) * Math.min((1 - t) / 0.35, 1);
      mesh.scale.setScalar(size * (1 + Math.sin(clock.elapsedTime * 3 + i) * 0.08));
    });
  });

  return (
    <>
      {segments.map((s) => (
        <mesh
          key={`${s.centre.x}:${s.centre.z}`}
          position={[s.centre.x, 0.035, s.centre.z]}
          rotation={[0, s.yaw, 0]}
          material={s.material}
        >
          <boxGeometry args={[0.05, 0.012, s.length]} />
        </mesh>
      ))}
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
