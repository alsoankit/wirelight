import { roomById } from "@wirelight/rooms";
import { useSession } from "../engine/store";
import type { CarvedOptions } from "./kit/carved";
import { TOWN_LOOK } from "./town/palette";

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
  /** Multiplies the textured kit pieces' restored colour (kits/kitMaterials.ts); default a gentle warm. */
  kitRestored?: string;
  /** How far ruin greys the textured kit pieces toward the ruined light (0–1; default 0.72). */
  kitRuinGrey?: number;
  /** How brightly glowing kit pieces (windows, lanterns) light when restored (default 1.8). */
  kitGlow?: number;
  /**
   * One kit material re-coloured when restored: the region's stone colour at the texture's own
   * brightness (`gamma` < 1 lifts dark courses), mixed in by `amount` (`floorAmount` on faces that
   * look up; kits/kitMaterials.ts).
   */
  kitStone?: { material: string; colour: string; amount: number; gamma?: number; floorAmount?: number };
  /**
   * Kit materials re-coloured outright, ruined and restored alike: the colour at the texture's own
   * brightness, mixed in by `amount`, so one kit can be built in another palette (0095).
   */
  kitTones?: { material: string; colour: string; amount: number; gamma?: number }[];
  /** Reworked models built into a room (kits/carvedKit.ts): the region's carved stone. */
  carved: CarvedOptions;
};

export const LOOKS: Record<RegionId, RegionLook> = {
  // The Overgrown Halls: moonlit blue ruin, warm rune light restored.
  1: {
    background: "#0b0d12",
    // Moonlight grey-blue, not navy (brief: stone #5B6370, moon #9AA7C2, fog #2A3140).
    ambient: { ruined: "#636b79", restored: "#8A7058" },
    sky: { ruined: "#99a1b2", restored: "#a08a70" },
    ground: { ruined: "#32343a", restored: "#3a3028" },
    fog: { ruined: "#2A3140", restored: "#3a2d22" },
    moon: { ruined: "#9AA7C2", restored: "#B8BCCB", strengthRuined: 1.25, strengthRestored: 0.45 },
    moss: { ruined: "#4b584c", restored: "#4f7a3c", amount: 1 },
    fireflies: "#D9F28A",
    dust: "#c8d2e6",
    carved: { tint: { restored: "#A89272", ruined: "#636973" }, moss: 0.8 },
  },
  // The Sorting Works: cold grey daylight through the skylights and cold vapour in ruin; warm amber
  // haze and lamplight restored.
  2: {
    background: "#0c0c0d",
    // Restored fill stays near neutral (a touch warm): amber belongs to the lamps and the metal.
    ambient: { ruined: "#7a7d84", restored: "#aaa096" },
    sky: { ruined: "#b4b8be", restored: "#cbbfae" },
    ground: { ruined: "#2e3238", restored: "#33302c" },
    fog: { ruined: "#23272d", restored: "#2c2925" },
    moon: { ruined: "#AAB2BC", restored: "#cfc0a8", strengthRuined: 1.3, strengthRestored: 0.6 },
    moss: { ruined: "#2c2b29", restored: "#3a2a1e", amount: 0.55 },
    carved: { tint: { restored: "#A89F93", ruined: "#5F6268" } },
    // Warm motes drifting up from the machines (never sparks in the face: background only).
    fireflies: "#F0B060",
    dust: "#b9bec6",
    // The fieldstone and the furniture keep their own colour when restored (near neutral, not the
    // default warm): amber belongs to the brass, the copper and the lamps.
    kitRestored: "#F6F4F0",
  },
  // The Lantern Town: its light lives with the town (town/palette.ts, agent D).
  3: TOWN_LOOK,
  // The Cathedral of Crossings: cold grey-blue and echoing in ruin; warm golden shafts and incense haze
  // restored.
  4: {
    background: "#0b0b0e",
    // Cold grey in ruin (brief: stone #55575E, light #7E8AA0), not navy; restored, pale sandstone
    // under a near-neutral fill, the gold and jewel colours left to the glass and its shafts.
    ambient: { ruined: "#6c6f77", restored: "#8f8b84" },
    sky: { ruined: "#9a9fa9", restored: "#c3bdb1" },
    ground: { ruined: "#2a2c31", restored: "#3a3229" },
    fog: { ruined: "#2a2d33", restored: "#5C4A38" },
    // Restored, pale daylight from the clerestory: the gold belongs to the windows' shafts and the
    // candles, so the stone reads as sandstone, not one orange-brown.
    moon: { ruined: "#8e95a4", restored: "#e2dccd", strengthRuined: 1.5, strengthRestored: 0.55 },
    moss: { ruined: "#45474c", restored: "#8c7a5c", amount: 0.45 },
    carved: { tint: { restored: "#D2C2A2", ruined: "#7A7B80" } },
    fireflies: null,
    dust: "#d8ccb0",
    // The cathedral kit's grey trim-sheet stone, warmed toward sandstone when restored (multiplied in
    // linear space, so as light as it can be: it can only darken).
    kitRestored: "#FFF4E4",
    // The trim sheet's red brick and grey ashlar become pale sandstone courses (brief: #C2A57E), so
    // a restored room is stone, gold light and jewel glass, not one orange-brown.
    kitStone: { material: "trim sheet", colour: "#C9B497", amount: 0.9, gamma: 0.72, floorAmount: 0.35 },
  },
};
