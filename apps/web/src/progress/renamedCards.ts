// Discovery cards whose id has changed, old id → new id. A save made before the change still counts
// the card as found, so it isn't shown again and stays in the list of things found.
export const RENAMED_CARDS: ReadonlyMap<string, string> = new Map([
  ["slate", "scanner"],
  ["scrying-glass", "map"],
  ["navigator", "crossing-keeper"],
  ["lectern", "crossing-desk"],
  ["capture-jar", "captures"],
]);

/** Saved card ids, each renamed card under its new id (in the same order, once each). */
export function renameCards(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => RENAMED_CARDS.get(id) ?? id))];
}
