import { CatmullRomCurve3, Vector3 } from "three";
import { CAMERA, SLICE } from "./layout";

// The descent's camera move (ONB-05): up the path to the glowing doorway, then down through the
// ground beside the cable. One continuous move along two splines (where the camera is, where it looks),
// eased so it starts gently and gathers speed as it falls.
// (tech/rendering.md plans Theatre.js for authored cinematics; this code path can move there when
// the owner wants to hand-tune it in its editor.)

// Up the path toward the glowing arch, tipping down at the threshold, then straight down through
// the ground, looking at the cut slice of earth as it passes.
const FALL_Z = SLICE.z + 4.6;
const BOTTOM = -SLICE.depth + 2.5;

const where = new CatmullRomCurve3([
  CAMERA.position.clone(),
  new Vector3(-1.0, 1.4, 7.0),
  new Vector3(-0.2, 0.9, FALL_Z + 0.4),
  new Vector3(0, -1.4, FALL_Z),
  new Vector3(0, -8, FALL_Z),
  new Vector3(0, BOTTOM, FALL_Z),
]);

const looking = new CatmullRomCurve3([
  CAMERA.target.clone(),
  new Vector3(-0.2, 1.4, 0),
  new Vector3(0, 0.2, SLICE.z),
  new Vector3(0, -1.6, SLICE.z),
  new Vector3(0, -8.2, SLICE.z),
  new Vector3(0, BOTTOM - 0.4, SLICE.z),
]);

export const DESCENT_SECONDS = { full: 2.8, quick: 0.9, faster: 3 }; // `faster`: speed-up on click or key

/** Ease in (gentle start), then fall. */
function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

export function descentPose(u: number, position: Vector3, target: Vector3): void {
  const e = ease(Math.min(Math.max(u, 0), 1));
  // By distance along the path (not by control point), so the speed is even.
  where.getPointAt(e, position);
  looking.getPointAt(e, target);
}
