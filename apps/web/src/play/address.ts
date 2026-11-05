/**
 * The address while `roomId` is played: /play?room=<id>, so a reload comes back to it (ONB-20). Other
 * options in the address (?tier=, ?backend=) stay. A link's own room (/play/<room>, 0044) doesn't once
 * the player has moved on, or the landing would offer that room again instead of this one.
 */
export function roomAddress(href: string, roomId: string): string {
  const url = new URL(href);
  url.pathname = "/play";
  url.searchParams.set("room", roomId);
  return url.toString();
}
