// Words spoken inside the simulated network itself: what machines put in their messages. Rooms pass
// these to the simulator, so the text stays here.

/** A machine's message or answer carrying the room's key (floors/floor-1.md: `hello from lantern — key: <word>`). */
export const helloWithKey = (name: string, key: string) => `hello from ${name} — key: ${key}`;

/** Lantern's answer to a direct message; it carries the room's key. */
export const lanternReply = (key: string) => helloWithKey("lantern", key);

/** Lantern's regular message to the observatory (Floor 1), without a key. */
export const lanternHello = "hello from lantern";

/** What the Knight's messenger keeps sending. */
export const messengerMessage = "hello from the observatory";

/** What moth keeps calling, to a name nobody has (Floor 2's boss). */
export const mothCall = "is anyone there?";

/** Lantern's background announcement (shown sealed until Floor 6). */
export const lanternAnnouncement = "lantern is here";

/** Any machine's background announcement (Floors 2–4, sealed until Floor 6): `<name> is here`. */
export const announcement = (name: string) => `${name} is here`;

/** One part of a key split across several answers (3.3: three letters, three parts). */
export const helloWithKeyPart = (name: string, part: number, of: number, text: string) =>
  `hello from ${name} — key, part ${part} of ${of}: ${text}`;

/** The name a machine gives when it answers a broadcast and says it keeps the key (4.2: `I'm here — anvil (I keep the key)`). */
export const keepsTheKey = (name: string) => `I'm here — ${name} (I keep the key)`;

/** Lantern's answer to an old-style frame written to its new door (5.1): no key, a nudge toward its house. */
export const lanternNewDoorReply = "I'm here — lantern. Write to my house; my door changes.";

/** Lantern's announcement once it can be opened (6.1): the message inside carries the key. */
export const lanternLampsRemember = (key: string) => `the lamps remember: ${key}`;
