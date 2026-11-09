import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { roomById } from "@wirelight/rooms";
import { useMemo, useRef } from "react";
import { type PerspectiveCamera as Camera, Vector3 } from "three";
import { useSession } from "../engine/store";
import { useReducedMotion } from "../progress/motion";
import { captureMode } from "./prerender/RoomPicture";

// The fixed three-quarter view (0006, art-direction.md): a narrow lens, no orbit,
// and a gentle parallax that follows the pointer. With reduced motion (UI-23) the camera holds still:
// no parallax and no settling in (the arrival veil fades instead).

type Props = {
  target: [number, number, number];
  distance?: number;
  fov?: number;
  /** Start this many metres further out and settle in (arriving in the room, ONB-05). */
  settleFrom?: number;
  /** Lock the view only when this exact room has a picture; unsupported layouts keep live camera motion. */
  picture?: boolean;
  /** Rooms with a left-wall doorway use the mirrored three-quarter view. */
  direction?: Vector3;
};

// From the room toward the camera. Fixed for every room (no orbit), so static geometry facing away
// from it can be dropped (kit/StaticRoom.tsx).
export const VIEW_DIRECTION = new Vector3(1, 0.9, 1).normalize();
const PARALLAX = 0.5; // metres of camera drift at the screen edge
const LIFT_DROP = 2.6; // metres the view moves down while the console is open
const LIFT_OUT = 4; // …and how far it steps back

export function RoomCamera({
  target,
  distance = 24,
  fov = 28,
  settleFrom = 0,
  picture = false,
  direction = VIEW_DIRECTION,
}: Props) {
  const ref = useRef<Camera>(null);
  const lookAt = useMemo(() => new Vector3(...target), [target]);
  const home = useMemo(() => lookAt.clone().addScaledVector(direction, distance), [lookAt, direction, distance]);
  const right = useMemo(() => new Vector3(direction.z, 0, -direction.x).normalize(), [direction]);
  const wanted = useMemo(() => new Vector3(), []);
  const still = useReducedMotion();
  const lift = useRef(0);
  const aim = useMemo(() => new Vector3(), []);

  useFrame(({ pointer }, delta) => {
    const camera = ref.current;
    if (!camera) return;
    // Picture rooms (prototype): the camera never moves, so the live things stay on the picture.
    if (captureMode || picture) {
      camera.position.copy(home);
      camera.lookAt(lookAt);
      return;
    }
    // With the console slid up over the bottom of the screen, the view eases down and a little out,
    // so the room sits in the part still showing (it doesn't vanish under the console).
    const { consoleOpen, voiceGiven, roomId } = useSession.getState();
    const typing = roomId ? roomById(roomId)?.controls.console === "typing" : false;
    const target = consoleOpen && voiceGiven && typing ? 1 : 0;
    lift.current = still ? target : lift.current + (target - lift.current) * (1 - Math.exp(-delta * 4));
    const drop = lift.current * LIFT_DROP;
    if (still) {
      camera.position
        .copy(home)
        .addScaledVector(direction, lift.current * LIFT_OUT)
        .add({ x: 0, y: -drop, z: 0 });
      camera.lookAt(aim.copy(lookAt).add({ x: 0, y: -drop, z: 0 }));
      return;
    }
    wanted
      .copy(home)
      .addScaledVector(direction, lift.current * LIFT_OUT)
      .addScaledVector(right, pointer.x * PARALLAX)
      .add({ x: 0, y: pointer.y * PARALLAX * 0.6 - drop, z: 0 });
    camera.position.lerp(wanted, 1 - Math.exp(-delta * 3));
    aim.copy(lookAt).add({ x: 0, y: -drop, z: 0 });
    camera.lookAt(aim);
  });

  // The camera eases toward `home` every frame, so starting further out makes it settle in.
  const settle = still ? 0 : settleFrom;
  const start = useMemo(
    () =>
      home
        .clone()
        .addScaledVector(direction, settle)
        .add({ x: 0, y: settle * 0.4, z: 0 }),
    [home, direction, settle],
  );
  return <PerspectiveCamera ref={ref} makeDefault fov={fov} position={start.toArray()} near={0.5} far={120} />;
}
