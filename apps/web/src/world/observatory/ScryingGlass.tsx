import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BoxGeometry, EdgesGeometry, type Group, type Mesh } from "three";
import { color, float, mix, positionLocal, sin, smoothstep, time } from "three/tsl";
import { LineBasicNodeMaterial, MeshBasicNodeMaterial } from "three/webgpu";
import { regionMaterial } from "../kit/regionMaterials";
import { ruin } from "../ruin";

// Stand-in for the Scrying Glass (CORE-31), old and new (0050): an ancient stone basin with a brass
// rim, and above it a hologram of the floor: two rooms and the cable between them, with a message
// (cyan, alive) crossing. The hologram is pale, never cyan, so only messages are cyan.

const HOLO = "#CFE3FF";

export function ScryingGlass({ position }: { position: [number, number, number] }) {
  const map = useRef<Group>(null);
  const dot = useRef<Mesh>(null);

  const { lines, rooms, cone } = useMemo(() => {
    const steady = mix(float(0.9), float(0.45), ruin);
    // A slow shimmer in ruin (several seconds per pulse; never a fast flicker).
    const shimmer = sin(time.mul(0.9)).mul(0.12).mul(ruin).add(1);
    const lineMaterial = new LineBasicNodeMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    lineMaterial.colorNode = color(HOLO).mul(steady.mul(shimmer).mul(1.4));
    const roomMaterial = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    roomMaterial.colorNode = color(HOLO).mul(steady.mul(0.14));
    // The projection cone from the basin: brightest at the bottom, gone at the top.
    const coneMaterial = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      side: 2,
    });
    coneMaterial.colorNode = color(HOLO).mul(
      float(1)
        .sub(smoothstep(-0.35, 0.35, positionLocal.y))
        .mul(steady.mul(0.12)),
    );
    return {
      lines: { geometry: new EdgesGeometry(new BoxGeometry(0.34, 0.2, 0.34)), material: lineMaterial },
      rooms: roomMaterial,
      cone: coneMaterial,
    };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (map.current) map.current.rotation.y = t * 0.25;
    // The message crosses the little cable every 4 s, in time with the room.
    if (dot.current) {
      const p = (t % 4) / 1.6;
      dot.current.visible = p < 1;
      dot.current.position.x = -0.3 + Math.min(p, 1) * 0.6;
    }
  });

  return (
    <group position={position}>
      {/* the stone basin with its brass rim */}
      <mesh position={[0, 0.42, 0]} material={regionMaterial("Main")}>
        <cylinderGeometry args={[0.55, 0.38, 0.84, 20]} />
      </mesh>
      <mesh position={[0, 0.85, 0]} rotation={[Math.PI / 2, 0, 0]} material={regionMaterial("Brass")}>
        <torusGeometry args={[0.53, 0.045, 8, 32]} />
      </mesh>
      <mesh position={[0, 1.2, 0]} material={cone}>
        <cylinderGeometry args={[0.5, 0.3, 0.7, 24, 1, true]} />
      </mesh>
      {/* the hologram: two rooms and the cable between them */}
      <group ref={map} position={[0, 1.45, 0]}>
        {[-0.38, 0.38].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <lineSegments geometry={lines.geometry} material={lines.material} />
            <mesh material={rooms}>
              <boxGeometry args={[0.34, 0.2, 0.34]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -0.08, 0]} material={rooms}>
          <boxGeometry args={[0.42, 0.015, 0.03]} />
        </mesh>
        <mesh ref={dot} position={[-0.3, -0.05, 0]}>
          <sphereGeometry args={[0.035, 12, 8]} />
          <meshBasicMaterial color={[0.55, 2.6, 2.8]} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
