import { roomById } from "@wirelight/rooms";
import { useSession } from "../../engine/store";
import { HallScene } from "../hall/HallScene";
import { HouseScene } from "../house/HouseScene";
import { ObservatoryScene } from "../observatory/ObservatoryScene";
import { SecretDoor } from "./SecretDoor";

// The room the player is standing in (CORE-10): the Observatory for their own machine, a machine's
// own room for any other. One room in view at a time; walking through a door swaps it.

export function World({ arriving = false }: { arriving?: boolean }) {
  const roomId = useSession((s) => s.roomId);
  const here = useSession((s) => s.here);
  const room = roomId ? roomById(roomId) : undefined;
  if (!room || !here) return null;
  return (
    <>
      <Scene roomId={room.id} here={here} arriving={arriving} />
      {/* A secret room's door, once the floor's boss is cleared (0065; agent D). */}
      <SecretDoor key={`secret:${room.id}:${here}`} device={here} />
    </>
  );
}

function Scene({ roomId, here, arriving }: { roomId: string; here: string; arriving: boolean }) {
  const room = roomById(roomId);
  if (!room) return null;
  if (here === room.playerDevice) return <ObservatoryScene key={`${roomId}:${here}`} arriving={arriving} />;
  const spec = room.topology.devices.find((d) => d.id === here);
  // A machine with a bridge (a switch) or several doors (a router) gets a hall: room for its doors,
  // its boards and the keeper's desk or lectern. (Region-specific rooms come with each region's kit.)
  if (spec?.bridges?.length || (spec?.interfaces.length ?? 0) > 1)
    return <HallScene key={`${roomId}:${here}`} device={here} />;
  return <HouseScene key={`${roomId}:${here}`} device={here} />;
}
