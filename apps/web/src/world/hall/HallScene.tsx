import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useMemo } from "react";
import { useSession } from "../../engine/store";
import { useBarred } from "../observatory/ObservatoryScene";
import { doorGeometry } from "../room/layout";
import { MachineScene } from "../room/MachineScene";
import { HALL_SLOTS, hallLayout } from "./layout";

// A switch's room (CORE-06): the sorting hall. Its doors are gaps in the walls with stone frames;
// the MAC board stands on the left (CORE-27); the keeper's desk sits before the keeper when it has
// forgotten its job (0042). Clicking the board reads it (`bridge fdb show`), or finds it clouded.

const STONE = "#6d6a63";

function DoorFrames({ count }: { count: number }) {
  return (
    <>
      {HALL_SLOTS.slice(0, count).map((slot) => {
        const g = doorGeometry(slot);
        const rotationY = slot.wall === "back" ? 0 : Math.PI / 2;
        return (
          <group key={`${slot.wall}${slot.at}`} position={[g.doorway[0], 0, g.doorway[2]]} rotation={[0, rotationY, 0]}>
            {[-0.95, 0.95].map((x) => (
              <mesh key={x} position={[x, 1.2, 0]}>
                <boxGeometry args={[0.18, 2.4, 0.4]} />
                <meshStandardMaterial color={STONE} roughness={0.95} />
              </mesh>
            ))}
            <mesh position={[0, 2.5, 0]}>
              <boxGeometry args={[2.1, 0.22, 0.42]} />
              <meshStandardMaterial color={STONE} roughness={0.95} />
            </mesh>
            {/* Beyond the doorway: the dark of the corridor. */}
            <mesh position={[0, 1.2, -0.25]}>
              <planeGeometry args={[1.75, 2.4]} />
              <meshBasicMaterial color="#030405" />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function Chip({ label, onClick, at }: { label: string; onClick: () => void; at: [number, number, number] }) {
  return (
    <Html center position={at} zIndexRange={[10, 0]}>
      <button type="button" className="world-chip" onClick={onClick}>
        {label}
      </button>
    </Html>
  );
}

function Board({ device }: { device: string }) {
  const roomId = useSession((s) => s.roomId);
  const exec = useSession((s) => s.exec);
  const openPanel = useSession((s) => s.openPanel);
  const state = roomId ? roomById(roomId)?.controls.macBoards?.[device] : undefined;
  if (!state) return null;
  const read = async () => {
    if (state === "works") {
      const { execId } = await exec(device, "bridge fdb show", "click");
      openPanel({ kind: "board", device, execId });
    } else openPanel({ kind: "board", device });
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={[-2.3, 0, 2.6]} rotation={[0, 0.7, 0]} onClick={() => void read()}>
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[1.5, 1.1, 0.1]} />
        <meshStandardMaterial color={state === "works" ? "#2f3a3c" : "#4a4f52"} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.12, 0.8, 0.12]} />
        <meshStandardMaterial color={STONE} />
      </mesh>
      <Chip label={voice.board.name} onClick={() => void read()} at={[0, 2.15, 0]} />
    </group>
  );
}

function Desk({ device }: { device: string }) {
  const roomId = useSession((s) => s.roomId);
  const asleep = useSession((s) => !!s.status?.desks[device]);
  const openPanel = useSession((s) => s.openPanel);
  const isDesk = roomId ? roomById(roomId)?.controls.desk === device : false;
  if (!isDesk) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={[0.4, 0, 1.3]} onClick={() => openPanel({ kind: "desk", device })}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.6, 1.0, 0.6]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.9} />
      </mesh>
      <Chip
        label={asleep ? `${voice.desk.name} ●` : voice.desk.name}
        onClick={() => openPanel({ kind: "desk", device })}
        at={[0, 1.4, 0]}
      />
    </group>
  );
}

export function HallScene({ device }: { device: string }) {
  const roomId = useSession((s) => s.roomId);
  const barred = useBarred();
  const count = useMemo(() => {
    const room = roomId ? roomById(roomId) : undefined;
    return room?.topology.devices.find((d) => d.id === device)?.interfaces.length ?? 4;
  }, [roomId, device]);
  const layout = useMemo(() => hallLayout(count), [count]);
  const glows = [{ position: [0, 2.6, -1] as [number, number, number], colour: "#FFC27A", strength: 2.6 }];
  return (
    <MachineScene device={device} layout={layout} barred={barred} glows={glows}>
      <DoorFrames count={count} />
      <Board device={device} />
      <Desk device={device} />
    </MachineScene>
  );
}
