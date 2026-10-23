import { roomById } from "@wirelight/rooms";
import { useSession } from "../../engine/store";
import { RoomWarmup, useShownRoom } from "../../render/RoomWarmup";
import { CorridorScene } from "../corridor/CorridorScene";
import { HallScene } from "../hall/HallScene";
import { HouseScene } from "../house/HouseScene";
import { ObservatoryScene } from "../observatory/ObservatoryScene";
import { SecretDoor } from "./SecretDoor";

// The room the player is standing in (CORE-10): the Observatory for their own machine, a machine's
// own room for any other. One room in view at a time; walking through a door swaps it.

export function World({ arriving = false }: { arriving?: boolean }) {
  // Walking to another machine swaps the room behind a brief veil, with its shaders compiled first
  // (render/RoomWarmup.tsx).
  const { roomId, here } = useShownRoom();
  const corridor = useSession((s) => s.corridor);
  const room = roomId ? roomById(roomId) : undefined;
  if (!room || !here) return null;
  // In a corridor, or gliding through one (0081): the corridor instead of a room.
  if (corridor) return <CorridorScene key={`${corridor.link}:${corridor.through ?? ""}`} corridor={corridor} />;
  return (
    <>
      <Scene roomId={room.id} here={here} arriving={arriving} />
      <RoomWarmup key={`warm:${room.id}:${here}`} roomId={room.id} here={here} />
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
