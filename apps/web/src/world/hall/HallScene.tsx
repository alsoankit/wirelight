import { roomById } from "@wirelight/rooms";
import { useMemo } from "react";
import { useSession } from "../../engine/store";
import { useBarred } from "../observatory/ObservatoryScene";
import { useRegion } from "../region";
import { Board, Desk } from "../room/Furniture";
import { MachineScene } from "../room/MachineScene";
import { hallSlots } from "../room/plan";
import { RegionStatue } from "../room/RegionStatue";
import { SIDE_PLACE } from "../room/standing";
import { TownSquare } from "../town/TownSquare";
import { hallLayout } from "./layout";

// A switch's room (CORE-06): the sorting hall. Its doors are gaps in the walls with stone frames;
// the MAC board stands on the left (CORE-27); the keeper's desk sits before the keeper when it has
// forgotten its job (0042). Clicking the board reads it (`bridge fdb show`), or finds it clouded.

export function HallScene({ device }: { device: string }) {
  const roomId = useSession((s) => s.roomId);
  const barred = useBarred();
  const count = useMemo(() => {
    const room = roomId ? roomById(roomId) : undefined;
    return room?.topology.devices.find((d) => d.id === device)?.interfaces.length ?? 4;
  }, [roomId, device]);
  const region = useRegion();
  const layout = useMemo(() => {
    const room = roomId ? roomById(roomId) : undefined;
    return hallLayout(room ? hallSlots(room.topology, room.playerDevice, device) : count, region);
  }, [roomId, device, count, region]);
  const glows = [{ position: [0, 2.6, -1] as [number, number, number], colour: "#FFC27A", strength: 2.6 }];
  // A crossing hall (Region 4): the navigator stands between its lecterns, the stone map on one side,
  // its desk-lectern on the other, both clear of its silhouette and facing the room.
  const crossing = region === 4;
  return (
    <MachineScene device={device} layout={layout} barred={barred} glows={glows}>
      <Board device={device} kind="mac" at={[-2.3, 0, 2.6]} turn={0.7} />
      <Desk device={device} at={crossing ? [1.9, 0, -0.2] : [0.4, 0, 1.3]} />
      <Board
        device={device}
        kind="routes"
        at={crossing ? [-1.1, 0, -0.3] : [2.5, 0, 2.4]}
        turn={crossing ? Math.PI / 4 : -0.6}
      />
      {crossing && <Locks device={device} at={[-1.1, 0, -0.3]} />}
      {region === 3 && <TownSquare device={device} />}
      {region !== 1 && region !== 3 && <RegionStatue region={region} place={SIDE_PLACE(region)} />}
    </MachineScene>
  );
}

/**
 * A lock a room's win waits on, held by this machine (9.3: "crossing's and arch's lecterns each hold
 * a lock"): a brass padlock hung on the lectern's pedestal, shut until its check passes, then open and
 * softly lit. Read from the room's health checks named "…-lock" for this machine.
 */
function Locks({ device, at }: { device: string; at: [number, number, number] }) {
  const roomId = useSession((s) => s.roomId);
  const ids = useMemo(() => {
    const room = roomId ? roomById(roomId) : undefined;
    return (room?.healthChecks ?? [])
      .filter((h) => h.id.endsWith("-lock") && "device" in h.object && h.object.device === device)
      .map((h) => h.id);
  }, [roomId, device]);
  const open = useSession((s) => ids.map((id) => !!s.status?.health[id]).join(","));
  return (
    <>
      {ids.map((id, i) => {
        const isOpen = open.split(",")[i] === "true";
        return (
          <group key={id} position={[at[0] + 0.19, 0.62, at[2] + 0.19]} rotation={[0, Math.PI / 4, 0]}>
            <mesh>
              <boxGeometry args={[0.2, 0.17, 0.07]} />
              <meshStandardMaterial
                color="#b8913f"
                metalness={0.5}
                roughness={0.4}
                emissive="#E0B040"
                emissiveIntensity={isOpen ? 0.5 : 0}
              />
            </mesh>
            <mesh position={[isOpen ? 0.05 : 0, isOpen ? 0.16 : 0.1, 0]} rotation={[0, isOpen ? 0.6 : 0, 0]}>
              <torusGeometry args={[0.065, 0.016, 6, 16, Math.PI]} />
              <meshStandardMaterial color="#3a3530" metalness={0.6} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
