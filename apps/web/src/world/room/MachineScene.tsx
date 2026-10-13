import { type RoomDef, roomById } from "@wirelight/rooms";
import { type ReactNode, Suspense, useMemo, useRef } from "react";
import type { Object3D } from "three";
import { useSession } from "../../engine/store";
import { Bloom } from "../../render/Bloom";
import { useQuality } from "../../render/quality";
import { Dust } from "../Dust";
import { Fireflies } from "../Fireflies";
import { StaticRoom } from "../kit/StaticRoom";
import { Keeper } from "../observatory/Keeper";
import type { KeeperCue } from "../observatory/Messages";
import { RoomLights } from "../observatory/RoomLights";
import { RoomCamera, VIEW_DIRECTION } from "../RoomCamera";
import { RuinDial } from "../RuinDial";
import { WindDriver } from "../WindDriver";
import { type DoorInfo, Doorway } from "./Doorway";
import { doorGeometry, type RoomLayout, type Vec3 } from "./layout";

// One machine's room (CORE-06): its layout, its keeper, and a doorway for each of its real doors,
// read from the room's topology (eth0 takes the first doorway, eth1 the second…). What changes is
// derived from the session: messages, corridors, plates, loose cable ends, the ruin.

type Glow = { position: Vec3; colour: string; strength: number };

/** Each door of `device` in this room: its cable, the machine at the other end, and what the player may do. */
export function doorsOf(room: RoomDef, device: string, barred: (peer: string) => string | undefined): DoorInfo[] {
  const spec = room.topology.devices.find((d) => d.id === device);
  const out: DoorInfo[] = [];
  for (const i of spec?.interfaces ?? []) {
    const link = room.topology.links.find(
      (l) => (l.a.device === device && l.a.iface === i.name) || (l.b.device === device && l.b.iface === i.name),
    );
    if (!link) continue;
    const peer = link.a.device === device && link.a.iface === i.name ? link.b.device : link.a.device;
    const access = room.access[peer]?.state ?? "off-limits";
    out.push({
      device,
      iface: i.name,
      link: link.id,
      peer,
      enterable: access === "enterable",
      barred: access === "enterable" ? undefined : barred(peer),
      showMac: room.floor !== 1,
      cableControl: room.controls.cableEnds?.[`${device}:${i.name}`],
    });
  }
  return out;
}

type Props = {
  device: string;
  layout: RoomLayout;
  barred: (peer: string) => string | undefined;
  glows: Glow[];
  arriving?: boolean;
  /** What only this room has (the Observatory's Glass, runes, the Knight's letter…). */
  children?: ReactNode;
};

export function MachineScene({ device, layout, barred, glows, arriving = false, children }: Props) {
  const watch = useRef<Object3D>(null);
  const cue = useRef<KeeperCue>({ arrived: -1, departed: -1 });
  const quality = useQuality();
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const doors = useMemo(() => (room ? doorsOf(room, device, barred) : []), [room, device, barred]);
  // CORE-38: ruin = failing checks ÷ all checks.
  const ruinLevel = useSession((s) => {
    const checks = Object.values(s.status?.health ?? {});
    return checks.length === 0 ? null : checks.filter((ok) => !ok).length / checks.length;
  });
  const first = layout.doorSlots[0];
  // Restoration spreads from the doorway (the door and its corridor are what rooms fix first).
  const origin: Vec3 = first ? [doorGeometry(first).doorway[0], 1, doorGeometry(first).doorway[2]] : [0, 1, 0];

  return (
    <>
      <RoomCamera target={[0, 1.1, -0.6]} distance={19} settleFrom={arriving ? 9 : 0} />
      <color attach="background" args={["#0b0d12"]} />
      <RuinDial level={ruinLevel} origin={origin} />
      <RoomLights glows={glows} />
      <Suspense fallback={null}>
        <StaticRoom placements={layout.placements} extras={layout.extras} toCamera={VIEW_DIRECTION} />
      </Suspense>
      <WindDriver />
      {quality.fireflies && <Fireflies bounds={layout.air} />}
      {quality.dust && <Dust bounds={layout.air} />}
      <Keeper position={layout.keeper} rest={[origin[0], 1.4, origin[2]]} watch={watch} cue={cue} />
      {doors.map((info, i) => {
        const slot = layout.doorSlots[i];
        return slot ? (
          <Doorway key={info.iface} info={info} slot={slot} keeper={layout.keeper} watch={watch} cue={cue} />
        ) : null;
      })}
      {children}
      {quality.bloom && <Bloom />}
    </>
  );
}
