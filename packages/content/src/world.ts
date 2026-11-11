// Words spoken inside the simulated network itself: what machines put in their messages. Rooms pass
// these to the simulator, so the text stays here.

/**
 * A machine's answer to a message you sent it (0125: no keys). It must differ from the background
 * messages (`hello from …`, `… is here`): rooms are won when this exact answer arrives.
 */
export const answerFrom = (name: string) => `${name} here. Got your message.`;

/** Kitchen's answer to a direct message. */
export const lanternReply = answerFrom("kitchen");

/** Kitchen's regular message to the observatory (Floor 1), without a key. */
export const lanternHello = "hello from kitchen";

/** What the observatory's background traffic sends. */
export const automaticMessage = "hello from the observatory";

/** What cellar keeps calling, to a name nobody has (Floor 2's boss). */
export const mothCall = "is anyone there?";

/** Kitchen's background announcement (shown sealed until Floor 6). */
export const lanternAnnouncement = "kitchen is here";

/** Any machine's background announcement (Floors 2–4, sealed until Floor 6): `<name> is here`. */
export const announcement = (name: string) => `${name} is here`;

/** The name a machine gives when it answers a broadcast and is the one waiting for you (4.2). */
export const waitingForYou = (name: string) => `I'm here — ${name}. I'm the one waiting for your message.`;

/** Kitchen's answer to an old-style frame written to its new door (5.1): no key, a nudge toward its house. */
export const lanternNewDoorReply = "I'm here — kitchen. Write to my house; my door changes.";

/** Kitchen's announcement once it can be opened all the way (6.1): what it says, inside the packet. */
export const lanternInsideMessage = "hello from kitchen, at 10.0.1.7";
