import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";
import { type RoomDef, roomById } from "@wirelight/rooms";
import { type ReactNode, Suspense, useMemo, useRef } from "react";
import type { Object3D } from "three";
import { Vector3 } from "three";
import { useSession } from "../../engine/store";
import { TAB } from "../../play/keys";
import { useQuality } from "../../render/quality";
import { lampsBaked } from "../bake/lightmap";
import { Dust } from "../Dust";
import { Fireflies } from "../Fireflies";
import { StaticRoom } from "../kit/StaticRoom";
import { KitRoom } from "../kits/KitRoom";
import { Keeper } from "../observatory/Keeper";
import type { KeeperCue } from "../observatory/Messages";
import { Moonbeams } from "../observatory/Moonbeams";
import { RoomLights } from "../observatory/RoomLights";
import { RoomPost } from "../post/RoomPost";
import { captureMode, hasPicture, pictureMode, RoomPicture } from "../prerender/RoomPicture";
import { RoomCamera, VIEW_DIRECTION } from "../RoomCamera";
import { RuinDial } from "../RuinDial";
import { LOOKS, useRegion } from "../region";
import { Gears } from "../regions/Gears";
import { Haze } from "../regions/Haze";
import { Steam } from "../regions/Steam";
import { BossPiece } from "./BossPiece";
import { type DoorInfo, Doorway, EmptyDoor } from "./Doorway";
import { doorSides, slotsFor } from "./doorSides";
import { type DoorSlot, doorGeometry, type RoomLayout, type Vec3 } from "./layout";
import { Statue } from "./Statue";

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
    const far = link.a.device === device && link.a.iface === i.name ? link.b : link.a;
    out.push({
      device,
      iface: i.name,
      link: link.id,
      peer,
      enterable: access === "enterable",
      barred: access === "enterable" ? undefined : barred(peer),
      showMac: room.floor >= 2,
      showAddrs: room.floor >= 5,
      streets: room.floor >= 7,
      catchable: !!room.controls.catching,
      floor: room.floor,
      cableControl: room.controls.cableEnds?.[`${device}:${i.name}`],
      farEnd: `${far.device}:${far.iface}`,
      twin: false,
    });
  }
  for (const d of out) d.twin = out.some((o) => o !== d && o.peer === d.peer);
  return out;
}

type Props = {
  device: string;
  layout: RoomLayout;
  barred: (peer: string) => string | undefined;
  glows: Glow[];
  arriving?: boolean;
  /** What only this room has (the Observatory's planning table, runes, the old letter…). */
  children?: ReactNode;
};

/** Where RoomCamera stands, for the picture (target and distance as below). */
const PICTURE_HOME = new Vector3(0, 1.1, -0.6).addScaledVector(VIEW_DIRECTION, 19);

export function MachineScene({ device, layout: given, barred, glows, arriving = false, children }: Props) {
  const watch = useRef<Object3D>(null);
  const cue = useRef<KeeperCue>({ arrived: -1, departed: -1 });
  const quality = useQuality();
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const region = useRegion();
  const look = LOOKS[region];
  const openPanel = useSession((s) => s.openPanel);
  const doors = useMemo(() => (room ? doorsOf(room, device, barred) : []), [room, device, barred]);
  const asleep = useSession((s) => !!s.status?.desks[device]);
  const empty = useMemo(() => {
    const spec = room?.topology.devices.find((d) => d.id === device);
    const linked = new Set(doors.map((d) => d.iface));
    return (spec?.interfaces ?? []).map((i) => i.name).filter((n) => n !== "lo" && !linked.has(n));
  }, [room, device, doors]);
  // Doors follow the Map (0111): each door takes a slot on the side facing the machine at its other end.
  const layout = useMemo(() => {
    if (!room) return given;
    const sides = doorSides(room.topology, room.playerDevice, device);
    // Only among the slots the room's walls open for this many doors (they are cut for the first N), so
    // walls and bakes stay right; new openings on the near edge come with the layouts (0111).
    const used = doors.length + empty.length;
    const { placed, rest } = slotsFor([...doors.map((d) => d.iface), ...empty], sides, given.doorSlots.slice(0, used));
    const doorSlots = [...placed, ...rest, ...given.doorSlots.slice(used)];
    return { ...given, doorSlots: doorSlots.filter((s): s is DoorSlot => !!s) };
  }, [given, room, device, doors, empty]);
  // The room restores on the win, all at once (playtest 2026-10-13, amending CORE-38's share of
  // failing checks): partial progress relights only the thing that was fixed (its corridor, its
  // plate's light), never the room. A room with no health checks still restores when won.
  const ruinLevel = useSession((s) => (s.status ? (s.status.won ? 0 : 1) : null));
  const first = layout.doorSlots[0];
  // Restoration spreads from the doorway (the door and its corridor are what rooms fix first).
  const origin: Vec3 = first ? [doorGeometry(first).doorway[0], 1, doorGeometry(first).doorway[2]] : [0, 1, 0];

  const pictureId = `r${region}-${device === "observatory" ? "observatory" : layout.doorSlots.length > 2 ? "hall" : "house"}-d${doors.length}`;
  const picture = pictureMode && hasPicture(pictureId);
  const baked = useMemo(() => lampsBaked(layout.placements, layout.extras, layout.kitPieces, region), [layout, region]);

  return (
    <>
      <RoomCamera target={[0, 1.1, -0.6]} distance={19} settleFrom={arriving ? 9 : 0} />
      <color attach="background" args={[look.background]} />
      <RuinDial level={ruinLevel} origin={origin} />
      <RoomLights glows={layout.glows ?? glows} region={region} baked={baked || picture} />
      {picture && (
        <Suspense fallback={null}>
          <RoomPicture id={pictureId} home={PICTURE_HOME} />
        </Suspense>
      )}
      {!picture && (
        <>
          <Suspense fallback={null}>
            <StaticRoom
              region={region}
              placements={layout.placements}
              extras={layout.extras}
              toCamera={VIEW_DIRECTION}
            />
          </Suspense>
          <Suspense fallback={null}>
            <KitRoom pieces={layout.kitPieces} region={region} toCamera={VIEW_DIRECTION} />
          </Suspense>
          {layout.statues?.map((s) => (
            <Statue key={`${s.slug}${s.position.join()}`} {...look.carved} {...s} />
          ))}
          {layout.gears && <Gears gears={layout.gears} region={region} />}
          {quality.moonbeams && layout.steam && <Steam vents={layout.steam} />}
          {quality.moonbeams && layout.beams && (
            <Moonbeams
              beams={layout.beams.list}
              direction={layout.beams.direction}
              colour={layout.beams.colour}
              ruined={layout.beams.ruined}
              restored={layout.beams.restored}
              pools={layout.beams.pools}
            />
          )}
          {region === 4 && <Haze haze={quality.moonbeams} glass={layout.stainedGlass} />}
        </>
      )}
      {!captureMode && quality.fireflies && look.fireflies && <Fireflies bounds={layout.air} colour={look.fireflies} />}
      {!captureMode && quality.dust && <Dust bounds={layout.air} colour={look.dust} />}
      {!captureMode && (
        <>
          <Keeper
            position={layout.keeper}
            rest={[origin[0], 1.4, origin[2]]}
            cue={cue}
            region={region}
            asleep={asleep}
          />
          {/* Ask the keeper why (CORE-25). */}
          <Html center position={[layout.keeper[0], 1.95, layout.keeper[2]]} zIndexRange={[10, 0]}>
            <button
              type="button"
              className="world-chip"
              data-tab={TAB.keeper}
              onClick={() => openPanel({ kind: "keeper", device })}
            >
              {voice.keeper.name}
            </button>
          </Html>
          {doors.map((info, i) => {
            const slot = layout.doorSlots[i];
            return slot ? (
              <Doorway
                key={info.iface}
                info={info}
                index={i}
                slot={slot}
                keeper={layout.keeper}
                watch={watch}
                cue={cue}
              />
            ) : null;
          })}
          {/* Doors with no cable (the home router's spare ports): the doorway and its plate, nothing beyond. */}
          {empty.map((iface, i) => {
            const slot = layout.doorSlots[doors.length + i];
            return slot ? <EmptyDoor key={iface} device={device} iface={iface} slot={slot} /> : null;
          })}
        </>
      )}
      <BossPiece
        device={device}
        region={region}
        slots={layout.doorSlots}
        doors={doors.length}
        hall={layout.doorSlots.length > 2}
      />
      {!picture && children}
      {/* The finishing pass: bloom, tone mapping, the region's grade, vignette (world/post). */}
      {!picture && <RoomPost />}
    </>
  );
}
