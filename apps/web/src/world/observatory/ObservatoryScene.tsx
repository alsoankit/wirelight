import { roomTexts } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useCallback, useMemo } from "react";
import { useSession } from "../../engine/store";
import { useQuality } from "../../render/quality";
import { MOON_POSITION, MOON_TARGET } from "../moon";
import { Board, Desk } from "../room/Furniture";
import { MachineScene } from "../room/MachineScene";
import { KnightLetter } from "./KnightLetter";
import { LETTER, observatoryLayout } from "./layout";
import { Moonbeams } from "./Moonbeams";
import { RUNE_GLOWS, Runes } from "./Runes";
import { ScryingGlass } from "./ScryingGlass";
import { ObservatoryTools } from "./Tools";

// The Observatory, the player's own machine on every floor (CORE-07): the Knight's old base, with the
// Scrying Glass, his unfinished letter and the runes. An old fantasy ruin explored with modern tools
// (0051): only the Glass is modern here. A left world (0052). Its doors and everything that changes
// come from the room (MachineScene); this adds what only the Observatory has.

// Where the moon gets in: the barred window, the gap above the crumbled left wall, and the
// collapsed top of the back wall's right end.
const MOON_GAPS = [
  { from: [-4, 3.1, -3] as [number, number, number], width: 1.3, depth: 0.9 },
  { from: [-4, 2.4, 1.8] as [number, number, number], width: 2.6, depth: 1.2 },
  { from: [3, 2.4, -4] as [number, number, number], width: 1.6, depth: 1.0 },
];

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

export function ObservatoryScene({ arriving = false }: { arriving?: boolean }) {
  const quality = useQuality();
  const roomId = useSession((s) => s.roomId);
  const barred = useBarred();
  const doorCount = useMemo(() => {
    const room = roomId ? roomById(roomId) : undefined;
    const spec = room?.topology.devices.find((d) => d.id === room.playerDevice);
    return spec?.interfaces.length ?? 1;
  }, [roomId]);
  const layout = useMemo(() => observatoryLayout(doorCount), [doorCount]);

  return (
    <MachineScene device="observatory" layout={layout} barred={barred} glows={RUNE_GLOWS} arriving={arriving}>
      <Runes />
      <KnightLetter position={LETTER} />
      {quality.moonbeams && (
        <Moonbeams
          beams={MOON_GAPS}
          direction={[
            MOON_TARGET[0] - MOON_POSITION[0],
            MOON_TARGET[1] - MOON_POSITION[1],
            MOON_TARGET[2] - MOON_POSITION[2],
          ]}
        />
      )}
      <ScryingGlass position={[2.4, 0, 1.6]} />
      <ObservatoryTools />
      <Board device="observatory" kind="ledger" at={[-1.2, 0, -2.9]} turn={0.15} />
      <Desk device="observatory" at={[0.6, 0, 1.2]} />
    </MachineScene>
  );
}
