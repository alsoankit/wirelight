// Shared key rules (CORE-47): a game key never fires while the player is typing, in a field or in
// the console. (The console's own key, `, still closes it from inside.)

/** Whether a key press is someone typing: in a text field, a list, an editable area, or the console. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || !!t.closest(".console");
}

/** Whether a key press comes with Ctrl, Alt or Meta (those belong to the browser and the system). */
export function withModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.altKey || e.metaKey;
}

/**
 * Tab ranks for the room's objects (UI-18), set as `data-tab` on their labels: plates, doorways,
 * cable ends, furniture, then the keeper (each plus its door's or its own place).
 */
export const TAB = { plate: 100, door: 200, cableEnd: 300, furniture: 400, keeper: 500 } as const;
