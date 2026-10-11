import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import { type Mesh, Vector3 } from "three";

// B0 mock traffic: lantern's message comes up the corridor every 4 s, through the doorway, to the keeper;
// the answer goes back out. In B1 messages come from the simulator's event trace instead.
// Messages are cyan living light (CORE-14); colours above 1 make them bloom.

const PERIOD = 4; // seconds between messages (Floor 1: lantern writes every 4 s)
const TRAVEL = 1.6; // seconds each way
const PAUSE = 0.4; // the keeper reads it

const MESSAGE_COLOUR: [number, number, number] = [0.55, 2.6, 2.8];

// What the keeper reacts to: when (in seconds of the clock) a message last reached it, and when
// its answer last left. (In B1 these come from the trace's keeper decisions instead.)
export type KeeperCue = { arrived: number; departed: number };

type Props = {
  corridorEnd: [number, number, number];
  doorway: [number, number, number];
  keeper: [number, number, number];
  inbound: RefObject<Mesh | null>;
  cue: RefObject<KeeperCue>;
  onRoundTrip?: () => void;
};

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

export function MockTraffic({ corridorEnd, doorway, keeper, inbound, cue, onRoundTrip }: Props) {
  const outbound = useRef<Mesh>(null);
  const path = useMemo(
    () => [new Vector3(...corridorEnd), new Vector3(...doorway), new Vector3(...keeper)],
    [corridorEnd, doorway, keeper],
  );
  const back = useMemo(() => [...path].reverse(), [path]);
  const lastCycle = useRef(-1);
  const lastArrival = useRef(-1);
  const lastDeparture = useRef(-1);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime % PERIOD;
    const cycle = Math.floor(clock.elapsedTime / PERIOD);
    const inMesh = inbound.current;
    const outMesh = outbound.current;
    if (!inMesh || !outMesh) return;

    inMesh.visible = t < TRAVEL;
    if (inMesh.visible) along(path, t / TRAVEL, inMesh.position);

    const r = t - TRAVEL - PAUSE;
    outMesh.visible = r >= 0 && r < TRAVEL;
    if (outMesh.visible) along(back, r / TRAVEL, outMesh.position);

    // Tell the keeper: the message has reached its desk; its answer is leaving.
    if (t >= TRAVEL && lastArrival.current !== cycle) {
      lastArrival.current = cycle;
      cue.current.arrived = clock.elapsedTime;
    }
    if (r >= 0 && lastDeparture.current !== cycle) {
      lastDeparture.current = cycle;
      cue.current.departed = clock.elapsedTime;
    }

    // A message and its answer have both crossed: the corridor lights (CORE-12).
    if (r >= TRAVEL && lastCycle.current !== cycle) {
      lastCycle.current = cycle;
      onRoundTrip?.();
    }
    // A soft pulse as each message breathes; they grow out of the dark corridor and shrink back into it.
    const pulse = 1 + Math.sin(clock.elapsedTime * 9) * 0.12;
    inMesh.scale.setScalar(pulse * emerge(t / TRAVEL));
    outMesh.scale.setScalar(pulse * emerge(1 - r / TRAVEL));
  });

  return (
    <>
      <mesh ref={inbound} visible={false}>
        <sphereGeometry args={[0.13, 20, 12]} />
        <meshBasicMaterial color={MESSAGE_COLOUR} toneMapped={false} />
      </mesh>
      <mesh ref={outbound} visible={false}>
        <sphereGeometry args={[0.13, 20, 12]} />
        <meshBasicMaterial color={MESSAGE_COLOUR} toneMapped={false} />
      </mesh>
    </>
  );
}
