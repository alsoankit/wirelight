import { modelUrl } from "../room/Statue";
import type { KitPlacement } from "./placement";

// Reworked models (tools/rework → public/assets/models) as room geometry: walls, stairs and arches that
// should take baked light. They go through KitRoom and the bake like any kit piece, merged per model,
// and keep the carved look (kit/carved.ts) in the region's colour (region.ts `carved`). What stands
// alone in a room (the region's statue, set dressing) stays a live `Statue`.

export const CARVED = "carved";

/** A reworked model placed as room geometry. */
export function carvedPiece(
  slug: string,
  position: KitPlacement["position"],
  { turn = 0, scale }: { turn?: number; scale?: number } = {},
): KitPlacement {
  return { kit: CARVED, piece: slug, position, rotationY: turn, ...(scale ? { scale } : {}) };
}

export const carvedUrl = (p: KitPlacement) => (p.kit === CARVED ? modelUrl(p.piece) : undefined);
