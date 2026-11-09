import { roomTexts } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useCallback, useMemo } from "react";
import { useSession } from "../../engine/store";
import { useRegion } from "../region";
import { EMBLEM_ASPECT, emblemUrl } from "../room/emblems";
import { Board, Desk } from "../room/Furniture";
import { MachineScene } from "../room/MachineScene";
import { RegionStatue } from "../room/RegionStatue";
import { Statue } from "../room/Statue";
import { DRESSING_AT, STATUE_AT, type StatueSpot } from "../room/standing";
import { WallArt, type WallArtMark } from "../room/WallArt";
import { WarTable } from "../room/WarTable";
import { observatoryLayout } from "./layout";
import { RUNE_GLOWS, Runes } from "./Runes";
import { ObservatoryTools } from "./Tools";

// The Observatory, the player's own machine on every floor (CORE-07): the robot's old base, with the
// planning table, an unfinished letter and the runes. An old ruin explored with modern tools (0051).
// A left world (0052). Its doors and everything that changes
// come from the room (MachineScene); this adds what only the Observatory has.

/** Why a machine beyond a door can't be entered, from the room's text. */
export function useBarred(): (peer: string) => string | undefined {
  const roomId = useSession((s) => s.roomId);
  return useCallback(
    (peer: string) => {
      const room = roomId ? roomById(roomId) : undefined;
      return room ? roomTexts[room.content]?.access?.[peer] : undefined;
    },
    [roomId],
  );
}

/** Where each region's emblem hangs on the Observatory's wall (0091), clear of runes, lamps and posts. */
const EMBLEM_AT: Record<number, Omit<WallArtMark, "url" | "aspect">> = {
  1: { wall: "left", along: -2.0, y: 1.95, width: 1.0 },
  // Region 2: where the round hatch was, below the gauge.
  2: { wall: "left", along: -2.1, y: 1.7, width: 1.0 },
  // Region 3: in the plaster panel between the corner and the first timber post.
  3: { wall: "left", along: -3.0, y: 1.95, width: 1.0 },
  // Region 4: in the plain bay before the tall window.
  4: { wall: "left", along: -3.0, y: 1.95, width: 1.0 },
};

export function ObservatoryScene({ arriving = false }: { arriving?: boolean }) {
  const roomId = useSession((s) => s.roomId);
  const barred = useBarred();
  const doorCount = useMemo(() => {
    const room = roomId ? roomById(roomId) : undefined;
    const spec = room?.topology.devices.find((d) => d.id === room.playerDevice);
    return spec?.interfaces.length ?? 1;
  }, [roomId]);
  const region = useRegion();
  const layout = useMemo(() => observatoryLayout(doorCount, region), [doorCount, region]);
  const room = roomId ? roomById(roomId) : undefined;

  return (
    <MachineScene
      device="observatory"
      layout={layout}
      barred={barred}
      glows={layout.glows ?? RUNE_GLOWS}
      arriving={arriving}
    >
      {/* The builders' runes are Region 1's light; other regions bring their own (layout.glows). */}
      {region === 1 && <Runes />}
      {/* The region's emblem, painted by its people (0091); machines where the old corner stood (0110). */}
      {EMBLEM_AT[region] && room && (
        <WallArt
          {...(EMBLEM_AT[region] as WallArtMark)}
          url={emblemUrl(region, room.id, room.playerDevice)}
          aspect={EMBLEM_ASPECT}
        />
      )}
      {STATUE_AT[region] && <RegionStatue region={region} place={STATUE_AT[region] as StatueSpot} />}
      {DRESSING_AT[region] && <Statue {...(DRESSING_AT[region] as Parameters<typeof Statue>[0])} />}
      {region === 4 && <Runes set="chapel" />}
      <WarTable position={[2.4, 0, 1.6]} region={region} />
      <ObservatoryTools />
      <Board device="observatory" kind="ledger" at={[-1.2, 0, -2.9]} turn={0.15} />
      <Desk device="observatory" at={[0.6, 0, 1.2]} />
      <Board device="observatory" kind="routes" at={[-3.0, 0, -0.6]} turn={1.1} />
    </MachineScene>
  );
}
