import { Html } from "@react-three/drei";
import { fill, roomTexts, secretDoors } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useEffect } from "react";
import { useSession } from "../../engine/store";
import { TAB } from "../../play/keys";
import { goToRoom } from "../../play/RoomHud";
import { useProgress } from "../../progress/progress";
import { regionMaterial } from "../kit/regionMaterials";
import { type RegionId, useRegion } from "../region";
import { AT, secretHere, secretInCorridor } from "./secretPlaces";

// A secret room's door (decision 0065; CORE-45): once a floor's boss is cleared, a narrow door shows
// in the place its floor spec names, in the back corner of that room. Never before. Seeing it marks
// the secret room found (progress `secretsFound`, which the Menu reads); going through opens it.
//
// Where (floors/*.md, "Secret room"):
// - Why 48 Bits? — in 2.2's corridor (a moss-covered plate by a narrow door). The boss comes after
//   2.2, so it shows in the boss room's Observatory too, or nobody would ever find it.
// - The Peacekeeper — after the storm, where span-2 used to run (hall-b, where its end lay).
// - The Binary Behind /24 — after the census, behind the street sign on the square's corner post.
// - Inside Your Home Router — after the finale, at the foot of the spire.

/** Each region's door-frame material (also the near-edge doorways' frames, 0111). */
export const FRAME: Record<RegionId, string> = { 1: "Main", 2: "Iron", 3: "Sandstone", 4: "Sandstone" };

function DoorBody({
  region,
  at,
  turn,
  onOpen,
}: {
  region: RegionId;
  at: [number, number, number];
  turn: number;
  onOpen: () => void;
}) {
  const frame = regionMaterial(FRAME[region], region);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); its chip is the keyboard way
    <group position={at} rotation={[0, turn, 0]} onClick={onOpen}>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 1.0, 0]} material={frame}>
          <boxGeometry args={[0.14, 2.0, 0.22]} />
        </mesh>
      ))}
      <mesh position={[0, 2.07, 0]} material={frame}>
        <boxGeometry args={[1.0, 0.16, 0.24]} />
      </mesh>
      {/* The way in: dark, with a thread of warm light along the sill. */}
      <mesh position={[0, 1.0, -0.02]}>
        <planeGeometry args={[0.7, 2.0]} />
        <meshBasicMaterial color="#060504" />
      </mesh>
      <mesh position={[0, 0.03, 0.02]}>
        <boxGeometry args={[0.66, 0.03, 0.03]} />
        <meshBasicMaterial color={[1.4, 0.95, 0.5]} toneMapped={false} />
      </mesh>
      {region === 1 && (
        // The moss-covered plate beside it (floors/floor-2.md).
        <mesh position={[0.62, 1.25, 0.02]} material={regionMaterial("Leaf_Texture", 1)}>
          <boxGeometry args={[0.26, 0.18, 0.04]} />
        </mesh>
      )}
    </group>
  );
}

/**
 * In a machine's room (`device`: its back corner) or, with `corridor`, in the corridor's back wall at
 * `at` (0081).
 */
export function SecretDoor({
  device,
  corridor = false,
  at = AT,
  turn = Math.PI / 4,
}: {
  device?: string;
  corridor?: boolean;
  at?: [number, number, number];
  turn?: number;
}) {
  const roomId = useSession((s) => s.roomId);
  const won = useSession((s) => s.status?.won ?? false);
  const cleared = useProgress((s) => s.cleared);
  const region = useRegion();
  const room = roomId ? roomById(roomId) : undefined;
  const secret = room
    ? corridor
      ? secretInCorridor(room, cleared, won)
      : device
        ? secretHere(room, device, cleared, won)
        : undefined
    : undefined;
  useEffect(() => {
    if (secret) useProgress.getState().findSecret(secret);
  }, [secret]);
  if (!secret) return null;
  const words = secretDoors[secret as keyof typeof secretDoors] as { label: string; note: string } | undefined;
  const title = roomTexts[roomById(secret)?.content ?? secret]?.title ?? "";
  if (!words) return null;
  const open = () => {
    useProgress.getState().findSecret(secret);
    goToRoom(secret);
  };
  return (
    <>
      <DoorBody region={region} at={at} turn={turn} onOpen={open} />
      <Html center position={[at[0], 0.45, at[2]]} zIndexRange={[10, 0]}>
        <button
          type="button"
          className="world-chip"
          data-tone="secret"
          data-tab={TAB.door + 9}
          title={words.note}
          aria-label={fill(secretDoors.aria, { label: words.label, note: words.note, title })}
          onClick={open}
        >
          {words.label}
        </button>
      </Html>
    </>
  );
}
