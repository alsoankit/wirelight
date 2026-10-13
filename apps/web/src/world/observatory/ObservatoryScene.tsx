import { Html } from "@react-three/drei";
import { roomTexts, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useCallback, useMemo } from "react";
import { useSession } from "../../engine/store";
import { useRegion } from "../region";
import { Board, Desk } from "../room/Furniture";
import { MachineScene } from "../room/MachineScene";
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
