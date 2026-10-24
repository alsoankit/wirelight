import type { RegionId } from "../region";
import { cathedralCorridor } from "../regions/cathedral";
import { hallsCorridor } from "../regions/halls";
import { townCorridor } from "../regions/town";
import { worksCorridor } from "../regions/works";
import type { CorridorDressing } from "./frame";

// Each region's corridor (0081), dressed with its own pieces in its own file.
const BY_REGION: Record<RegionId, (half: number) => CorridorDressing> = {
  1: hallsCorridor,
  2: worksCorridor,
  3: townCorridor,
  4: cathedralCorridor,
};

const made = new Map<string, CorridorDressing>();

/** The region's corridor dressing for a corridor `half` long each way (built once per region and length). */
export function corridorDressing(region: RegionId, half: number): CorridorDressing {
  const key = `${region}:${half}`;
  let d = made.get(key);
  if (!d) {
    d = BY_REGION[region](half);
    made.set(key, d);
  }
  return d;
}
