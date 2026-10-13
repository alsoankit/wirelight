import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useSession } from "../../engine/store";

// The Knight's tools in the Observatory (CORE-34, CORE-35), shown only in rooms that have them:
// - the workbench, a slab of old stone where he built frames by hand (Floors 2–4);
// - the messenger, a small brass automaton by the door that keeps sending to the name on its card.
// Clicking either opens its panel; the panel runs the real command (lab send-frame, lab card).

const STONE = "#6d6a63";
const BRASS = "#b08a4e";

function Chip({ label, onClick, at }: { label: string; onClick: () => void; at: [number, number, number] }) {
  return (
    <Html center position={at} zIndexRange={[10, 0]}>
      <button type="button" className="world-chip" onClick={onClick}>
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
      <Chip label={voice.workbench.name} onClick={onOpen} at={[0, 1.25, 0]} />
    </group>
  );
}

function Messenger({ onOpen }: { onOpen: () => void }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={[1.4, 0, -2.6]} onClick={onOpen}>
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 0.64, 12]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* The address card it holds. */}
      <mesh position={[0.22, 0.5, 0.12]} rotation={[0, -0.6, 0.15]}>
        <planeGeometry args={[0.24, 0.16]} />
        <meshStandardMaterial color="#e8dcc4" roughness={1} />
      </mesh>
      <Chip label={voice.card.name} onClick={onOpen} at={[0, 1.2, 0]} />
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
