import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useSession } from "../../engine/store";
import { TAB } from "../../play/keys";

// The robot's Frame builder (CORE-34), shown only in rooms where it has been found.

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

export function ObservatoryTools() {
  const roomId = useSession((s) => s.roomId);
  const openPanel = useSession((s) => s.openPanel);
  const room = roomId ? roomById(roomId) : undefined;
  if (!room) return null;
  return <>{room.controls.workbench === "works" && <Workbench onOpen={() => openPanel({ kind: "workbench" })} />}</>;
}
