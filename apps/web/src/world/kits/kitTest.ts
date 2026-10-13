import type { RegionId } from "../region";
import { HEAVY_PIECES, KITS, type KitPiece } from "./catalog";
import type { KitPlacement } from "./placement";

// Dev only (`?kittest=1`): a handful of pieces from each of the region's kits, set out in rows across
// the room, to see how KitRoom draws them. Lamps, candles and windows are placed as glow pieces.

const GLOW_NAMES = /lantern|candle|torch|window|chandelier|lamp/i;
const PER_KIT = 6;

export function kitTestPieces(region: RegionId): KitPlacement[] {
  const out: KitPlacement[] = [];
  const kits = Object.values(KITS).filter((k) => k.region === region);
  kits.forEach((kit, row) => {
    const heavy = new Set(HEAVY_PIECES.filter((h) => h.kit === kit.id).map((h) => h.piece));
    const all = Object.entries(kit.pieces as Record<string, KitPiece>).filter(([name, p]) => {
      const width = Math.max(p.max[0] - p.min[0], p.max[2] - p.min[2]) * kit.scaleToRuins;
      return !heavy.has(name) && width <= 4.2;
    });
    // Evenly through the list, plus the first light source.
    const picks = new Set<string>();
    const light = all.find(([name]) => GLOW_NAMES.test(name));
    if (light) picks.add(light[0]);
    for (let i = 0; picks.size < PER_KIT && i < PER_KIT * 2; i++) {
      const entry = all[Math.floor((i * all.length) / (PER_KIT * 2))];
      if (entry) picks.add(entry[0]);
    }
    const z = -2.6 + row * 2.4;
    [...picks].forEach((piece, i) => {
      out.push({
        kit: kit.id,
        piece,
        position: [-3 + i * 1.3, 0, z],
        glow: GLOW_NAMES.test(piece) || undefined,
      });
    });
  });
  return out;
}
