import { roomById } from "@wirelight/rooms";
import { useSession } from "../../engine/store";
import { HallScene } from "../hall/HallScene";
import { HouseScene } from "../house/HouseScene";
import { ObservatoryScene } from "../observatory/ObservatoryScene";

// The room the player is standing in (CORE-10): the Observatory for their own machine, a machine's
// own room for any other. One room in view at a time; walking through a door swaps it.

export function World({ arriving = false }: { arriving?: boolean }) {
  const roomId = useSession((s) => s.roomId);
  const here = useSession((s) => s.here);
  const room = roomId ? roomById(roomId) : undefined;
  if (!room || !here) return null;
  if (here === room.playerDevice) return <ObservatoryScene key={`${roomId}:${here}`} arriving={arriving} />;
  const spec = room.topology.devices.find((d) => d.id === here);
  // A machine with a bridge is a switch: its room is a sorting hall.
  if (spec?.bridges?.length) return <HallScene key={`${roomId}:${here}`} device={here} />;
  return <HouseScene key={`${roomId}:${here}`} device={here} />;
}
