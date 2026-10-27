import { CatmullRomCurve3, Vector3 } from "three";
import { BEYOND, CAMERA, PALACE, pathBeyond } from "./layout";

// The approach's camera move (ONB-05, 0088): up the path to the outer gate as its doors swing open,
// through the gateway, and on along the path toward the palace while the screen fades to the dark the
// game opens from. One continuous move along two splines (where the camera is, where it looks), eased
// so it starts gently and settles at the end.
// (tech/rendering.md plans Theatre.js for authored cinematics; this code path can move there when
// the owner wants to hand-tune it in its editor.)

export { DESCENT_SECONDS } from "./descentTiming";

const KEEP = new Vector3(PALACE.x, 20, PALACE.z); // the keep, a little below its spire

// Walking height, gently rising as the gaze lifts from the doors to the palace.
const where = new CatmullRomCurve3([
  CAMERA.position.clone(),
  new Vector3(-1.6, 1.6, 7.5),
  new Vector3(-0.3, 1.65, 3.2),
  new Vector3(0, 1.7, 0.6),
  new Vector3(pathBeyond(-2.5), 1.75, -2.5),
  new Vector3(pathBeyond(-6), 1.85, -6),
]);

// From the gate to the doors opening, then up to the palace through them.
const looking = new CatmullRomCurve3([
  CAMERA.target.clone(),
  new Vector3(-0.6, 2.2, -1),
  new Vector3(BEYOND.x * 0.6, 3.5, -12),
  KEEP.clone().lerp(new Vector3(0, 2, 0), 0.4),
  KEEP.clone(),
  KEEP.clone(),
]);

/** Ease in (gentle start), and out (it arrives, not stops). */
function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

export function approachPose(u: number, position: Vector3, target: Vector3): void {
  const e = ease(Math.min(Math.max(u, 0), 1));
  // Where: by distance along the path, so the walk is even. Looking: by control point, so the gaze
  // reaches the palace (the long last stretch) by the time the camera is in the gateway.
  where.getPointAt(e, position);
  looking.getPoint(e, target);
}

/** How far open the doors are (0 shut, 1 wide) at a point of the approach: open before the camera arrives. */
export function doorsOpen(u: number): number {
  const t = Math.min(Math.max(u / 0.5, 0), 1);
  return t * t * (3 - 2 * t);
}

/** How dark the screen is (0 clear, 1 the game's dark): the last part, past the gate. */
export function fadeOut(u: number): number {
  const t = Math.min(Math.max((u - 0.68) / 0.3, 0), 1);
  return t * t * (3 - 2 * t);
}
