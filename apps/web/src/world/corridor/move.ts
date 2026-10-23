import { useSession } from "../../engine/store";
import { reducedMotion } from "../../progress/motion";

// Moving between rooms (0081, CORE-47): through a doorway the player glides along its corridor into
// the next room (with reduced motion, straight there); stepping onto the cable stops in the corridor.

/** Goes through a door: from `from`'s room along the cable `link` into `to`'s room. */
export function goThrough(link: string, from: string, to: string): void {
  const s = useSession.getState();
  if (reducedMotion()) s.goTo(to);
  else s.passThrough(link, from, to);
}

/** Steps into the corridor of the cable `link` from `from`'s room, and stops there. */
export function stepIntoCorridor(link: string, from: string): void {
  useSession.getState().enterCorridor(link, from);
}
