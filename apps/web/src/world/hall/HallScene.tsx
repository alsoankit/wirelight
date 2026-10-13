import { roomById } from "@wirelight/rooms";
import { useMemo } from "react";
import { useSession } from "../../engine/store";
import { useBarred } from "../observatory/ObservatoryScene";
import { useRegion } from "../region";
import { Board, Desk } from "../room/Furniture";
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

/** Beyond each doorway, the dark of the corridor (regions whose frames are part of the static room). */
function DoorDark({ count }: { count: number }) {
  return (
    <>
      {HALL_SLOTS.slice(0, count).map((slot) => {
        const g = doorGeometry(slot);
        const rotationY = slot.wall === "back" ? 0 : Math.PI / 2;
        return (
          <group key={`${slot.wall}${slot.at}`} position={[g.doorway[0], 0, g.doorway[2]]} rotation={[0, rotationY, 0]}>
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

export function HallScene({ device }: { device: string }) {
  const roomId = useSession((s) => s.roomId);
  const barred = useBarred();
  const count = useMemo(() => {
    const room = roomId ? roomById(roomId) : undefined;
    return room?.topology.devices.find((d) => d.id === device)?.interfaces.length ?? 4;
  }, [roomId, device]);
  const region = useRegion();
  const layout = useMemo(() => hallLayout(count, region), [count, region]);
  const glows = [{ position: [0, 2.6, -1] as [number, number, number], colour: "#FFC27A", strength: 2.6 }];
  return (
    <MachineScene device={device} layout={layout} barred={barred} glows={glows}>
      {region === 1 ? <DoorFrames count={count} /> : region !== 4 && <DoorDark count={count} />}
      <Board device={device} kind="mac" at={[-2.3, 0, 2.6]} turn={0.7} />
      <Desk device={device} at={[0.4, 0, 1.3]} />
      <Board device={device} kind="routes" at={[2.5, 0, 2.4]} turn={-0.6} />
    </MachineScene>
  );
}
