import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type PerspectiveCamera as Camera, Vector3 } from "three";
import { useReducedMotion } from "../progress/motion";

// The fixed three-quarter view (0006, art-direction.md): a narrow lens, no orbit,
// and a gentle parallax that follows the pointer. With reduced motion (UI-23) the camera holds still:
// no parallax and no settling in (the arrival veil fades instead).

type Props = {
  target: [number, number, number];
  distance?: number;
  fov?: number;
  /** Start this many metres further out and settle in (arriving from the descent, ONB-05). */
  settleFrom?: number;
};

// From the room toward the camera. Fixed for every room (no orbit), so static geometry facing away
// from it can be dropped (kit/StaticRoom.tsx).
export const VIEW_DIRECTION = new Vector3(1, 0.9, 1).normalize();
const PARALLAX = 0.5; // metres of camera drift at the screen edge

export function RoomCamera({ target, distance = 24, fov = 28, settleFrom = 0 }: Props) {
  const ref = useRef<Camera>(null);
  const lookAt = useMemo(() => new Vector3(...target), [target]);
  const home = useMemo(() => lookAt.clone().addScaledVector(VIEW_DIRECTION, distance), [lookAt, distance]);
  const right = useMemo(() => new Vector3(1, 0, -1).normalize(), []);
  const wanted = useMemo(() => new Vector3(), []);
  const still = useReducedMotion();

  useFrame(({ pointer }, delta) => {
    const camera = ref.current;
    if (!camera) return;
    if (still) {
      camera.position.copy(home);
      camera.lookAt(lookAt);
      return;
    }
    wanted
      .copy(home)
      .addScaledVector(right, pointer.x * PARALLAX)
      .add({ x: 0, y: pointer.y * PARALLAX * 0.6, z: 0 });
    camera.position.lerp(wanted, 1 - Math.exp(-delta * 3));
    camera.lookAt(lookAt);
  });

  // The camera eases toward `home` every frame, so starting further out makes it settle in.
  const settle = still ? 0 : settleFrom;
  const start = useMemo(
    () =>
      home
        .clone()
        .addScaledVector(VIEW_DIRECTION, settle)
        .add({ x: 0, y: settle * 0.4, z: 0 }),
    [home, settle],
  );
  return <PerspectiveCamera ref={ref} makeDefault fov={fov} position={start.toArray()} near={0.5} far={120} />;
}
