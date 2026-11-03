import type { Placement } from "../kit/StaticRoom";
import type { RegionId } from "../region";
import { cathedralObservatory, cathedralObservatoryPieces } from "../regions/cathedral";
import { hallsObservatory, hallsObservatoryPieces } from "../regions/halls";
import { townObservatory, townObservatoryPieces } from "../regions/town";
import { worksObservatory, worksObservatoryPieces } from "../regions/works";
import type { RoomLayout } from "../room/layout";

// The Observatory (the player's computer room), 8 × 8 m, centred on the origin. The camera looks from
// the front right, so only the back wall (z = −4) and the left wall (x = −4) are built: a cutaway, as
// in art-direction.md. The doorway is a round arch in the back wall at x = 0, leading to the corridor
// (−z); a second door is an arch in the left wall at z = 2. Each region dresses it its own way
// (regions/halls.ts for Region 1, works, town, cathedral); the frame below is the same everywhere.

/** Every piece the Observatory can use, in every region (for preloading). */
export const OBSERVATORY: Placement[] = [
  ...hallsObservatoryPieces(false),
  ...hallsObservatoryPieces(true),
  ...worksObservatoryPieces(false),
  ...worksObservatoryPieces(true),
  ...townObservatoryPieces(false),
  ...townObservatoryPieces(true),
  ...cathedralObservatoryPieces(false),
  ...cathedralObservatoryPieces(true),
];

/** The Observatory with one door (eth0, the back arch) or two (eth1, the left wall's arch). */
export function observatoryLayout(doors: number, region: RegionId = 1): RoomLayout {
  const frame = {
    doorSlots: [
      { wall: "back", at: 0 },
      { wall: "left", at: 2 },
    ] as RoomLayout["doorSlots"],
    keeper: [0, 0, -0.6] as RoomLayout["keeper"],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] } as RoomLayout["air"],
  };
  if (region === 2) return { ...frame, ...worksObservatory(doors > 1) };
  if (region === 3) return { ...frame, ...townObservatory(doors > 1) };
  if (region === 4) return { ...frame, ...cathedralObservatory(doors > 1) };
  return { ...frame, ...hallsObservatory(doors > 1) };
}

// Where things are, for the scene and the message paths.
export const DOORWAY = { x: 0, z: -4 } as const;
export const KEEPER = { position: [0, 0, -0.6] as [number, number, number] } as const;
// The corridor itself isn't built in the room view: beyond the doorway is darkness, and the cable
// runs a little way into it and fades. (Anything built behind the walls shows outside the cutaway.)
export const CORRIDOR_END_Z = -6.5;
