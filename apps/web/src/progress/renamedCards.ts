// Discovery cards whose id has changed, old id → new id. A save made before the change still counts
// the card as found, so it isn't shown again and stays in the list of things found.
const RENAMED_CARDS = new Map([["slate", "scanner"]]);

/** Saved card ids, each renamed card under its new id (in the same order, once each). */
export function renameCards(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => RENAMED_CARDS.get(id) ?? id))];
}
