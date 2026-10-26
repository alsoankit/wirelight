import { Html } from "@react-three/drei";
import { roomTexts, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useCallback, useMemo } from "react";
import { useSession } from "../../engine/store";
import { useRegion } from "../region";
import { Board, Desk } from "../room/Furniture";
import { MachineScene } from "../room/MachineScene";
import { WallArt, type WallArtMark } from "../room/WallArt";
import { KnightCorner } from "./KnightCorner";
import { KnightLetter } from "./KnightLetter";
import { LETTER, observatoryLayout } from "./layout";
import { RUNE_GLOWS, Runes } from "./Runes";
import { ScryingGlass } from "./ScryingGlass";
import { ObservatoryTools } from "./Tools";

// The Observatory, the player's own machine on every floor (CORE-07): the Knight's old base, with the
// Scrying Glass, his unfinished letter and the runes. An old fantasy ruin explored with modern tools
// (0051): only the Glass is modern here. A left world (0052). Its doors and everything that changes
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

/** Each region's emblem on a shield painted on the Observatory's wall (0091), clear of runes and lamps. */
const EMBLEM = { width: 1.1, aspect: 512 / 600 } as const;
const EMBLEMS: Record<number, WallArtMark> = {
  1: { ...EMBLEM, url: "/art/emblem-r1.webp", wall: "left", along: -2.0, y: 1.9 },
  2: { ...EMBLEM, url: "/art/emblem-r2.webp", wall: "left", along: -2.1, y: 1.65 },
  // Region 3: in the plaster panel between the corner and the first timber post.
  3: { ...EMBLEM, url: "/art/emblem-r3.webp", wall: "left", along: -3.0, y: 1.9 },
  // Region 4: in the plain bay before the tall window.
  4: { ...EMBLEM, url: "/art/emblem-r4.webp", wall: "left", along: -3.0, y: 1.9 },
};

/**
 * Where the Knight's corner stands on the left wall (0091), behind the second-door place (z 1.1–2.9)
 * where a region has one: Region 3 (one door) uses the panel between the posts at 0 and 2; Region 4
 * the plain bay after the window, clear of the shaft at 0.
 */
const KNIGHT_AT: Record<number, number> = { 1: 0.15, 2: 0.15, 3: 1.0, 4: 0.6 };

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

  return (
    <MachineScene
      device="observatory"
      layout={layout}
      barred={barred}
      glows={layout.glows ?? RUNE_GLOWS}
      arriving={arriving}
    >
      {/* The weavers' runes are Region 1's light; other regions bring their own (layout.glows). */}
      {region === 1 && <Runes />}
      {/* The region's emblem, painted by its people (0091); the Knight's corner below his portrait. */}
      {EMBLEMS[region] && <WallArt {...(EMBLEMS[region] as WallArtMark)} />}
      <KnightCorner along={KNIGHT_AT[region] ?? 0.15} />
      {region === 4 && <Runes set="chapel" />}
      <KnightLetter position={LETTER} />
      <ScryingGlass position={[2.4, 0, 1.6]} region={region} />
      {/* The Glass stands here too (CORE-31): its label opens it, like G. */}
      <Html center position={[2.4, 1.75, 1.6]} zIndexRange={[10, 0]}>
        <button
          type="button"
          className="world-chip"
          data-guide="glass"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "g" }))}
        >
          {voice.glass.title}
        </button>
      </Html>
      <ObservatoryTools />
      <Board device="observatory" kind="ledger" at={[-1.2, 0, -2.9]} turn={0.15} />
      <Desk device="observatory" at={[0.6, 0, 1.2]} />
      <Board device="observatory" kind="routes" at={[-3.0, 0, -0.6]} turn={1.1} />
    </MachineScene>
  );
}
