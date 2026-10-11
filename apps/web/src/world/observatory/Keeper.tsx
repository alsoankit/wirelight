import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import { type Group, type Object3D, Quaternion, Vector2, Vector3 } from "three";
import { regionMaterial, techMaterial } from "../kit/regionMaterials";

// The keeper (world/lore.md, region-1 brief): a brass-and-stone automaton with a lantern head and
// one glowing eye, moss on its shoulders, seated at its desk facing the doorway. Old and new at once
// (0050): a stone body and brass casing around a dormant machine heart, at a desk with a screen.
// Built from simple shapes until a modelled keeper exists. Its head follows the message it watches.

type Props = {
  position: [number, number, number];
  rest: [number, number, number]; // where it looks when nothing is moving (the doorway)
  watch: RefObject<Object3D | null>;
};

type V3 = [number, number, number];

const UP = new Vector3(0, 1, 0);

// A cylinder from a to b (limbs, bars).
function Limb({ from, to, radius, material }: { from: V3; to: V3; radius: number; material: string }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    const dir = b.clone().sub(a);
    return {
      position: a.clone().add(b).multiplyScalar(0.5).toArray() as V3,
      quaternion: new Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
      length: dir.length(),
    };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} material={regionMaterial(material)} castShadow>
      <cylinderGeometry args={[radius, radius * 0.9, length, 12]} />
    </mesh>
  );
}

function Joint({ at, radius, material = "Brass" }: { at: V3; radius: number; material?: string }) {
  return (
    <mesh position={at} material={regionMaterial(material)} castShadow>
      <sphereGeometry args={[radius, 16, 12]} />
    </mesh>
  );
}

// The torso: a riveted barrel, wider at the chest.
function Torso() {
  const profile = useMemo(
    () =>
      [
        [0.2, 0],
        [0.3, 0.12],
        [0.34, 0.38],
        [0.31, 0.62],
        [0.22, 0.78],
      ].map(([r, y]) => new Vector2(r, y)),
    [],
  );
  return (
    <group position={[0, 0.78, 0]}>
      <mesh material={regionMaterial("Brass")} castShadow>
        <latheGeometry args={[profile, 24]} />
      </mesh>
      {[0.14, 0.58].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={regionMaterial("Iron")}>
          <torusGeometry args={[y < 0.3 ? 0.31 : 0.325, 0.025, 8, 32]} />
        </mesh>
      ))}
      {/* the machine heart behind a porthole, on the side facing the desk (−z) */}
      <group position={[0, 0.4, -0.33]}>
        <mesh material={regionMaterial("Brass")}>
          <torusGeometry args={[0.1, 0.022, 8, 24]} />
        </mesh>
        <mesh material={techMaterial(1.3)}>
          <circleGeometry args={[0.085, 24]} />
        </mesh>
      </group>
    </group>
  );
}

// A gear collar at the neck: a ring with teeth.
function Gear({ y }: { y: number }) {
  const teeth = 10;
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={regionMaterial("Brass")}>
        <torusGeometry args={[0.12, 0.028, 8, 24]} />
      </mesh>
      {Array.from({ length: teeth }, (_, i) => {
        const a = (i / teeth) * Math.PI * 2;
        return (
          <mesh
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed teeth
            key={i}
            position={[Math.cos(a) * 0.155, 0, Math.sin(a) * 0.155]}
            rotation={[0, -a, 0]}
            material={regionMaterial("Brass")}
          >
            <boxGeometry args={[0.05, 0.045, 0.035]} />
          </mesh>
        );
      })}
    </group>
  );
}

// The lantern head. Its +z side carries the eye; lookAt turns that side toward the target.
function LanternHead() {
  const bars = 6;
  return (
    <>
      <mesh position={[0, 0.03, 0]} material={regionMaterial("Brass")} castShadow>
        <cylinderGeometry args={[0.18, 0.16, 0.06, 24]} />
      </mesh>
      {/* glass panes */}
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.32, 24, 1, true]} />
        <meshStandardMaterial color="#cfe0e6" transparent opacity={0.18} roughness={0.1} depthWrite={false} />
      </mesh>
      {Array.from({ length: bars }, (_, i) => {
        const a = (i / bars) * Math.PI * 2 + Math.PI / bars;
        return (
          <mesh
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed bars
            key={i}
            position={[Math.cos(a) * 0.155, 0.22, Math.sin(a) * 0.155]}
            material={regionMaterial("Brass")}
          >
            <boxGeometry args={[0.025, 0.34, 0.025]} />
          </mesh>
        );
      })}
      {/* the flame inside */}
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshBasicMaterial color={[2.6, 1.9, 1.1]} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.2, 0]} color="#FFD9A0" intensity={1.6} distance={2.2} decay={2} />
      {/* cap and handle */}
      <mesh position={[0, 0.46, 0]} material={regionMaterial("Brass")} castShadow>
        <coneGeometry args={[0.2, 0.16, 24]} />
      </mesh>
      <mesh position={[0, 0.58, 0]} material={regionMaterial("Brass")}>
        <torusGeometry args={[0.06, 0.014, 8, 20]} />
      </mesh>
      {/* the one eye: a lens in a brass bezel on the front pane */}
      <group position={[0, 0.24, 0.16]}>
        <mesh material={regionMaterial("Brass")}>
          <torusGeometry args={[0.062, 0.016, 8, 24]} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.05, 24]} />
          <meshBasicMaterial color={[2.8, 2.2, 1.4]} toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

// Its desk: a stone block with brass trim and a slanted screen of glowing lines (old and new).
function Desk() {
  return (
    <group position={[0, 0, -0.78]}>
      <mesh position={[0, 0.42, 0]} material={regionMaterial("Main")} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.84, 0.62]} />
      </mesh>
      <mesh position={[0, 0.86, 0]} material={regionMaterial("Brass")} castShadow>
        <boxGeometry args={[1.58, 0.05, 0.7]} />
      </mesh>
      <group position={[0, 1.02, -0.12]} rotation={[-0.55, 0, 0]}>
        <mesh material={regionMaterial("Iron")} castShadow>
          <boxGeometry args={[0.8, 0.34, 0.04]} />
        </mesh>
        {[0.09, 0.03, -0.03, -0.09].map((y, i) => (
          <mesh key={y} position={[-0.08 + (i % 2) * 0.06, y, 0.022]} material={techMaterial(i * 0.9)}>
            <boxGeometry args={[0.5 - i * 0.08, 0.02, 0.005]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Keeper({ position, rest, watch }: Props) {
  const head = useRef<Group>(null);
  const body = useRef<Group>(null);
  const restPoint = useMemo(() => new Vector3(...rest), [rest]);
  const look = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(...rest), [rest]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    // A slow mechanical breath.
    if (body.current) body.current.position.y = Math.sin(t * 0.9) * 0.008;
    const h = head.current;
    if (!h) return;
    const target = watch.current;
    if (target?.visible) target.getWorldPosition(look);
    else look.copy(restPoint);
    aim.lerp(look, 1 - Math.exp(-delta * 5)); // the head turns smoothly, never snaps
    h.lookAt(aim);
  });

  const s = 0.42; // shoulder half-width
  // Its front faces −z: the desk, the doorway. (The head turns on its own to watch.)
  return (
    <group position={position}>
      <Desk />
      {/* stone stool and hips */}
      <mesh position={[0, 0.27, 0]} material={regionMaterial("Main")} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.4, 0.54, 16]} />
      </mesh>
      <group ref={body}>
        <mesh position={[0, 0.68, 0]} material={regionMaterial("Stone")} castShadow>
          <boxGeometry args={[0.56, 0.24, 0.42]} />
        </mesh>
        <Torso />
        {/* shoulders, with moss grown over them */}
        {[-s, s].map((x) => (
          <group key={x}>
            <Joint at={[x, 1.46, 0]} radius={0.12} />
            <mesh position={[x * 0.95, 1.56, 0.02]} material={regionMaterial("Leaf_Texture")} castShadow>
              <icosahedronGeometry args={[0.1, 0]} />
            </mesh>
          </group>
        ))}
        {/* arms resting on the desk */}
        {[-1, 1].map((side) => (
          <group key={side}>
            <Limb from={[side * s, 1.44, 0]} to={[side * 0.46, 1.08, -0.3]} radius={0.055} material="Iron" />
            <Joint at={[side * 0.46, 1.08, -0.3]} radius={0.07} />
            <Limb from={[side * 0.46, 1.08, -0.3]} to={[side * 0.3, 0.98, -0.62]} radius={0.05} material="Iron" />
            <mesh position={[side * 0.3, 0.97, -0.66]} material={regionMaterial("Brass")} castShadow>
              <boxGeometry args={[0.1, 0.06, 0.12]} />
            </mesh>
          </group>
        ))}
        <Limb from={[0, 1.54, 0]} to={[0, 1.7, 0]} radius={0.06} material="Iron" />
        <Gear y={1.6} />
        <group ref={head} position={[0, 1.7, 0]}>
          <LanternHead />
        </group>
      </group>
    </group>
  );
}
