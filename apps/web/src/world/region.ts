import { roomById } from "@wirelight/rooms";
import { useSession } from "../engine/store";

// Which region the room belongs to (rooms carry it: `roomById(id).region`), and each region's light
// on the ruin dial (world/art-briefs/region-*.md). Materials follow the region too
// (kit/regionMaterials.ts); layouts choose their dressing by region (observatory, house, hall).
//
// Balanced for the eyes in every region (0051): ruin and restored differ in colour and mood more than
// in brightness.

export type RegionId = 1 | 2 | 3 | 4;

export function asRegion(n: number | undefined): RegionId {
  return n === 2 || n === 3 || n === 4 ? n : 1;
}

/** The current room's region (Region 1 when there is no room). */
export function useRegion(): RegionId {
  const roomId = useSession((s) => s.roomId);
  return asRegion(roomId ? roomById(roomId)?.region : undefined);
}

type Pair = { ruined: string; restored: string };

export type RegionLook = {
  /** The void around the diorama. */
  background: string;
  ambient: Pair;
  sky: Pair;
  ground: Pair;
  fog: Pair;
  /** Baked light from outside (the moon in Region 1; grey daylight through skylights in the Works…). */
  moon: Pair & { strengthRuined: number; strengthRestored: number };
  /** Where stone ages: moss (Regions 1, 3), soot (2), dust (4). */
  moss: Pair & { amount: number };
  /** Ambient life in the air, always in the background: fireflies, warm motes, or none. */
  fireflies: string | null;
  dust: string;
};

export const LOOKS: Record<RegionId, RegionLook> = {
  // The Overgrown Halls: moonlit blue ruin, warm rune light restored.
  1: {
    background: "#0b0d12",
    ambient: { ruined: "#4A5878", restored: "#8A7058" },
    sky: { ruined: "#7f93c8", restored: "#a08a70" },
    ground: { ruined: "#30343c", restored: "#3a3028" },
    fog: { ruined: "#1E2433", restored: "#3a2d22" },
    moon: { ruined: "#8FA8E0", restored: "#B8BCCB", strengthRuined: 1.25, strengthRestored: 0.45 },
    moss: { ruined: "#4b584c", restored: "#4f7a3c", amount: 1 },
    fireflies: "#D9F28A",
    dust: "#c8d2e6",
  },
  // The Sorting Works: cold grey daylight through the skylights and cold vapour in ruin; warm amber
  // haze and lamplight restored.
  2: {
    background: "#0c0c0d",
    ambient: { ruined: "#7a7d84", restored: "#b08a62" },
    sky: { ruined: "#b4b8be", restored: "#d6aa74" },
    ground: { ruined: "#2e3238", restored: "#3a2c20" },
    fog: { ruined: "#23272d", restored: "#3b2a1c" },
    moon: { ruined: "#AAB2BC", restored: "#E3B27A", strengthRuined: 1.3, strengthRestored: 0.6 },
    moss: { ruined: "#2c2b29", restored: "#3a2a1e", amount: 0.55 },
    // Warm motes drifting up from the machines (never sparks in the face: background only).
    fireflies: "#F0B060",
    dust: "#b9bec6",
  },
  // The Lantern Town: a blue-black town asleep in ruin; deep blue night with lamplit windows restored.
  3: {
    background: "#0a0c14",
    ambient: { ruined: "#5a6488", restored: "#8a7a74" },
    sky: { ruined: "#7a88b8", restored: "#9a96a8" },
    ground: { ruined: "#1B1E2A", restored: "#3a3026" },
    fog: { ruined: "#1B1E2A", restored: "#22304A" },
    moon: { ruined: "#8FA0D0", restored: "#9fb0d8", strengthRuined: 1.5, strengthRestored: 0.5 },
    moss: { ruined: "#55594F", restored: "#6F8F5E", amount: 0.8 },
    fireflies: "#E8D890",
    dust: "#c4cce0",
  },
  // The Cathedral of Crossings: cold grey-blue and echoing in ruin; warm golden shafts and incense haze
  // restored.
  4: {
    background: "#0b0b0e",
    ambient: { ruined: "#6c7488", restored: "#706454" },
    sky: { ruined: "#98a4ba", restored: "#988462" },
    ground: { ruined: "#252A35", restored: "#3a2e22" },
    fog: { ruined: "#252A35", restored: "#5C4A38" },
    moon: { ruined: "#8a96ac", restored: "#F2CF8A", strengthRuined: 1.6, strengthRestored: 0.5 },
    moss: { ruined: "#45474c", restored: "#8c7a5c", amount: 0.45 },
    fireflies: null,
    dust: "#d8ccb0",
  },
};
