import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import { type Mesh, type Object3D, Vector3 } from "three";
import { progress } from "../../engine/clock";
import { useSession } from "../../engine/store";

// Messages on this room's cable, from the engine's trace (CORE-14): small cyan lights. One leaving
// this machine goes from the keeper, out through the doorway and down the corridor; one arriving
// comes the other way. Where it is comes only from its crossing (link.enter → link.exit) and network
// time, never from a timer of its own. Colours above 1 make them bloom.

const MESSAGE_COLOUR: [number, number, number] = [0.55, 2.6, 2.8];
const POOL = 6; // at most this many on screen at once

// What the keeper reacts to, in seconds of the render clock: a message reached it; one left it.
export type KeeperCue = { arrived: number; departed: number };

type Props = {
  device: string; // this room's machine
  link: string; // the cable through its doorway
  corridorEnd: [number, number, number];
  doorway: [number, number, number];
  keeper: [number, number, number];
  /** Pointed at the message the keeper should watch (the newest one on screen). */
  watch: RefObject<Object3D | null>;
  cue: RefObject<KeeperCue>;
  /** Messages can be caught by hand here (CORE-18): pointing slows time; clicking keeps a copy. */
  catchable?: boolean;
};

const AIMING_SPEED = 0.12;

// 0 → 1 over the first quarter of the path (the stretch of corridor beyond the doorway).
function emerge(t: number): number {
  return Math.min(Math.max(t / 0.25, 0), 1);
}

function along(points: Vector3[], t: number, out: Vector3): Vector3 {
  // Piecewise-linear path, t in [0, 1] split evenly by segment length.
  const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i] as Vector3));
  const total = lengths.reduce((a, b) => a + b, 0);
  let d = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i] as number;
    if (d <= len || i === lengths.length - 1) {
      return out.lerpVectors(points[i] as Vector3, points[i + 1] as Vector3, len === 0 ? 0 : d / len);
    }
    d -= len;
  }
  return out;
}

export function Messages({ device, link, corridorEnd, doorway, keeper, watch, cue, catchable = false }: Props) {
  const meshes = useRef<(Mesh | null)[]>([]);
  /** Which message each pooled mesh is showing now. */
  const slots = useRef<(number | null)[]>([]);
  // In from the corridor: corridor end → doorway → keeper. Out: the reverse.
  const inward = useMemo(
    () => [new Vector3(...corridorEnd), new Vector3(...doorway), new Vector3(...keeper)],
    [corridorEnd, doorway, keeper],
  );
  const outward = useMemo(() => [...inward].reverse(), [inward]);
  const seen = useRef(new Map<number, boolean>()); // frame id → leaving this machine?

  useFrame(({ clock }) => {
    const { onCables, status } = useSession.getState();
    const now = status?.now ?? 0;
    const here = onCables.filter((c) => c.link === link);
    // Keeper cues: a message from this machine just went on the cable; one to it just finished.
    for (const c of here)
      if (!seen.current.has(c.frameId)) {
        const leaving = c.from === device;
        seen.current.set(c.frameId, leaving);
        if (leaving) cue.current.departed = clock.elapsedTime;
      }
    for (const [frameId, leaving] of seen.current)
      if (!here.some((c) => c.frameId === frameId)) {
        if (!leaving) cue.current.arrived = clock.elapsedTime;
        seen.current.delete(frameId);
      }

    const pulse = 1 + Math.sin(clock.elapsedTime * 9) * 0.12;
    let newest: Mesh | null = null;
    meshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      const c = here[i];
      mesh.visible = !!c;
      slots.current[i] = c?.frameId ?? null;
      if (!c) return;
      const t = progress(c, now);
      const leaving = c.from === device;
      along(leaving ? outward : inward, t, mesh.position);
      // They grow out of the dark corridor and shrink back into it.
      mesh.scale.setScalar(pulse * emerge(leaving ? 1 - t : t));
      newest = mesh;
    });
    // Several doorways share one keeper: only clear what it watches if that message has gone.
    if (newest) watch.current = newest;
    else if (watch.current && !watch.current.visible) watch.current = null;
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: 3D messages are caught by pointing (raycast); the jar is the keyboard way
        <mesh
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pool of meshes, reused by slot
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          visible={false}
          onPointerOver={catchable ? () => useSession.getState().setSpeed(AIMING_SPEED) : undefined}
          onPointerOut={catchable ? () => useSession.getState().setSpeed(1) : undefined}
          onClick={
            catchable
              ? () => {
                  const frameId = slots.current[i];
                  useSession.getState().setSpeed(1);
                  if (frameId != null) void useSession.getState().catchFrame(frameId);
                }
              : undefined
          }
        >
          <sphereGeometry args={[0.13, 20, 12]} />
          <meshBasicMaterial color={MESSAGE_COLOUR} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
