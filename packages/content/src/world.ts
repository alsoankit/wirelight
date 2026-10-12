// Words spoken inside the simulated network itself: what machines put in their messages. Rooms pass
// these to the simulator, so the text stays here.

/** Lantern's answer to a direct message; it carries the room's key. */
export const lanternReply = (key: string) => `hello from lantern — key: ${key}`;

/** What the Knight's messenger keeps sending. */
export const messengerMessage = "hello from the observatory";

/** Lantern's background announcement (shown sealed on Floor 0). */
export const lanternAnnouncement = "lantern is here";
