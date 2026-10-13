import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useMemo, useRef } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, type Group } from "three";
import { useSession } from "../../engine/store";
import { TAB } from "../../play/keys";

// The Knight's tools in the Observatory (CORE-34, CORE-35), shown only in rooms that have them:
// - the workbench, a slab of old stone where he built frames by hand (Floors 2–4);
// - the messenger, a folded-paper bird by the door that keeps sending to the name on its card.
// Clicking either opens its panel; the panel runs the real command (lab send-frame, lab card).

const STONE = "#6d6a63";

function Chip({
  label,
  onClick,
  at,
  tab,
}: {
  label: string;
  onClick: () => void;
  at: [number, number, number];
  tab: number;
}) {
  return (
    <Html center position={at} zIndexRange={[10, 0]}>
      <button type="button" className="world-chip" data-tab={tab} onClick={onClick}>
        {label}
      </button>
    </Html>
  );
}

function Workbench({ onOpen }: { onOpen: () => void }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={[-2.5, 0, 0.9]} rotation={[0, 0.5, 0]} onClick={onOpen}>
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[1.5, 0.12, 0.75]} />
        <meshStandardMaterial color={STONE} roughness={0.95} />
      </mesh>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]}>
          <boxGeometry args={[0.28, 0.72, 0.55]} />
          <meshStandardMaterial color="#5a5750" roughness={1} />
        </mesh>
      ))}
      {/* A blank sheet waiting on the bench. */}
      <mesh position={[0.1, 0.845, 0.05]} rotation={[-Math.PI / 2, 0, 0.2]}>
        <planeGeometry args={[0.42, 0.3]} />
        <meshStandardMaterial color="#d8cdb8" roughness={1} />
      </mesh>
      <Chip label={voice.workbench.name} onClick={onOpen} at={[0, 1.25, 0]} tab={TAB.furniture + 4} />
    </group>
  );
}

// The messenger: a folded-paper bird perched on a little stone post by the door, the address card
// tucked under its foot. It breathes and shifts its wings a little (never a doll or a robot: playtest
// read the old brass figure as a chess pawn).
function paperBird(): BufferGeometry {
  // Flat folded planes: a keel-shaped body, two wings raised in a V, a tail and a pointed head.
  const tris: number[] = [
    // body (two sides of the keel)
    -0.16, 0, 0, 0.14, 0, 0, 0, -0.07, 0, 0.14, 0, 0, -0.16, 0, 0, 0, -0.07, 0.001,
    // left wing
    -0.08, 0, 0, 0.08, 0, 0, -0.02, 0.1, 0.2,
    // right wing
    0.08, 0, 0, -0.08, 0, 0, -0.02, 0.1, -0.2,
    // tail, up and back
    -0.16, 0, 0, -0.1, 0, 0, -0.26, 0.09, 0,
    // neck and head, folded forward
    0.14, 0, 0, 0.1, 0, 0, 0.2, 0.1, 0, 0.2, 0.1, 0, 0.17, 0.09, 0, 0.27, 0.07, 0,
  ];
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return g;
}

function Messenger({ onOpen }: { onOpen: () => void }) {
  const bird = useMemo(paperBird, []);
  const body = useRef<Group>(null);
  useFrame(({ clock }) => {
    const b = body.current;
    if (!b) return;
    const t = clock.elapsedTime;
    b.position.y = 0.98 + Math.sin(t * 1.3) * 0.012;
    b.rotation.z = Math.sin(t * 0.9) * 0.05;
  });
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={[1.4, 0, -2.6]} rotation={[0, -0.6, 0]} onClick={onOpen}>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.1, 0.14, 0.9, 7]} />
        <meshStandardMaterial color={STONE} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[0.3, 0.05, 0.24]} />
        <meshStandardMaterial color={STONE} roughness={0.95} />
      </mesh>
      {/* The address card under its foot. */}
      <mesh position={[0.02, 0.952, 0.03]} rotation={[-Math.PI / 2, 0, 0.25]}>
        <planeGeometry args={[0.2, 0.13]} />
        <meshStandardMaterial color="#e8dcc4" roughness={1} />
      </mesh>
      <group ref={body} position={[0, 0.98, 0]} scale={1.15}>
        <mesh geometry={bird}>
          <meshStandardMaterial color="#efe6d2" roughness={0.9} side={DoubleSide} emissive="#3a3428" />
        </mesh>
      </group>
      <Chip label={voice.card.name} onClick={onOpen} at={[0, 1.45, 0]} tab={TAB.furniture + 5} />
    </group>
  );
}

export function ObservatoryTools() {
  const roomId = useSession((s) => s.roomId);
  const openPanel = useSession((s) => s.openPanel);
  const room = roomId ? roomById(roomId) : undefined;
  if (!room) return null;
  const hasMessenger =
    room.topology.devices.find((d) => d.id === room.playerDevice)?.messenger ||
    room.topology.devices.find((d) => d.id === room.playerDevice)?.messengers?.length;
  return (
    <>
      {room.controls.workbench === "works" && <Workbench onOpen={() => openPanel({ kind: "workbench" })} />}
      {room.controls.card === "works" && hasMessenger && <Messenger onOpen={() => openPanel({ kind: "card" })} />}
    </>
  );
}
