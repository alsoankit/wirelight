/** Keys are two-word phrases derived from the room id (SRS §13.1). Not secret: cheaters only cheat themselves. */
const A = [
  "copper",
  "amber",
  "silver",
  "quiet",
  "hollow",
  "bakery",
  "salt",
  "iron",
  "violet",
  "lunar",
  "ashen",
  "golden",
];
const B = [
  "kitchen",
  "chapel",
  "thread",
  "harbor",
  "candle",
  "willow",
  "anchor",
  "sparrow",
  "mirror",
  "comet",
  "orchard",
  "attic",
];

/**
 * Rooms whose hashed key would repeat an earlier room's (two rooms must never share a key). The room
 * met first on the path keeps the hashed word; these get an unused pair instead. The room validator
 * checks every key is unique, so a new room that collides gets a line here.
 */
const TAKEN: Record<string, string> = {
  "f2.secret-48-bits": "salt-kitchen",
  "f4.pinned-memory": "amber-mirror",
  "f4.who-has-the-key": "bakery-willow",
  "f8.boss-closed-crossing": "iron-kitchen",
  "f9.two-envelopes": "salt-attic",
  "f9.secret-home-router": "bakery-sparrow",
};

export function keyFor(roomId: string): string {
  const fixed = TAKEN[roomId];
  if (fixed) return fixed;
  let h = 2166136261;
  for (let i = 0; i < roomId.length; i++) h = Math.imul(h ^ roomId.charCodeAt(i), 16777619) >>> 0;
  return `${A[h % A.length]}-${B[(h >>> 8) % B.length]}`;
}
