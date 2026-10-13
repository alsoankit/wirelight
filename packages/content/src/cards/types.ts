/**
 * Discovery cards (CORE-46): a short card naming an object the first time it's seen. Cards name
 * OBJECTS the player can see, never the ideas a room teaches (those wait for the debrief).
 */
export interface Card {
  id: string;
  floor: number;
  title: string;
  text: string;
  /** A longer "Tell me more", where the spec has one. */
  more?: string;
}
