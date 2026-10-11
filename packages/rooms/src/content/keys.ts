/** Keys are two-word phrases derived from the room id (SRS §13.1). Not secret: cheaters only cheat themselves. */
const A = [
  "copper",
  "amber",
  "silver",
  "quiet",
  "hollow",
  "ember",
  "salt",
  "iron",
  "violet",
  "lunar",
  "ashen",
  "golden",
];
const B = [
  "lantern",
  "bell",
  "thread",
  "harbor",
  "candle",
  "willow",
  "anchor",
  "sparrow",
  "mirror",
  "comet",
  "orchard",
  "beacon",
];

export function keyFor(roomId: string): string {
  let h = 2166136261;
  for (let i = 0; i < roomId.length; i++) h = Math.imul(h ^ roomId.charCodeAt(i), 16777619) >>> 0;
  return `${A[h % A.length]}-${B[(h >>> 8) % B.length]}`;
}
