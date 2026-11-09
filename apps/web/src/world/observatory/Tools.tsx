import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useSession } from "../../engine/store";
import { TAB } from "../../play/keys";
import { asRegion, LOOKS, type RegionId } from "../region";
import { Statue } from "../room/Statue";

// The robot's Frame builder (CORE-34), shown only in rooms where it has been found.

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

/**
 * The Frame builder in the room: the carved altar with its open book (candle-altar, CC BY 4.0), in the
 * region's carved stone, square to the walls and facing into the room like the keeper. The frame is
 * written in the book.
 */
function Workbench({ onOpen, region }: { onOpen: () => void; region: RegionId }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={[-2.5, 0, 0.9]} onClick={onOpen}>
      <Statue {...LOOKS[region].carved} slug="candle-altar" position={[0, 0, 0]} turn={0} scale={0.85} />
      <Chip label={voice.workbench.name} onClick={onOpen} at={[0, 1.35, 0]} tab={TAB.furniture + 4} />
    </group>
  );
}

export function ObservatoryTools() {
  const roomId = useSession((s) => s.roomId);
  const openPanel = useSession((s) => s.openPanel);
  const room = roomId ? roomById(roomId) : undefined;
  if (!room) return null;
  return (
    <>
      {room.controls.workbench === "works" && (
        <Workbench onOpen={() => openPanel({ kind: "workbench" })} region={asRegion(room.region)} />
      )}
    </>
  );
}
