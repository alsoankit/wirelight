import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef, useState } from "react";
import { AdditiveBlending, type Group, type Mesh, type Object3D, Quaternion, Vector3 } from "three";
import { normalView, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { type Crossing, progress } from "../../engine/clock";
import { useSession } from "../../engine/store";
import { type MessageKind, messageKind, messageSummary } from "../messageKind";
import { VIEW_DIRECTION } from "../RoomCamera";

// Messages on this room's cable, from the engine's trace (CORE-14): small cyan lights. One leaving
// this machine goes from the keeper, out through the doorway and down the corridor; one arriving
// comes the other way. Where it is comes only from its crossing (link.enter → link.exit) and network
// time, never from a timer of its own. Colours above 1 make them bloom.

// Living light, not a neon signal (0090): a pale cyan (#5EE0E8 mixed toward white, linear, lifted past the
// bloom threshold) with a soft halo round it and a short fading trail behind it. Still clearly cyan.
const MESSAGE_COLOUR: [number, number, number] = [0.42, 1.18, 1.24];
const HALO_COLOUR: [number, number, number] = [0.25, 0.85, 0.9];
// The trail: a few fading lights where the message just was (fractions of its whole path).
const TRAIL = [0.022, 0.044, 0.066];
const TRAIL_FADE = [0.45, 0.25, 0.12];

// The halo fades out toward its rim (strongest where it faces the camera), so it reads as a glow, not
// a bubble.
const HALO = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
HALO.colorNode = vec3(...HALO_COLOUR);
HALO.opacityNode = normalView.z.max(0).pow(3).mul(0.32);
HALO.toneMapped = false;
const POOL = 12; // at most this many on screen at once per cable (a storm fills them)

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
  /** The room's floor: what hovering a message may say (packets are sealed before Floor 6). */
  floor?: number;
  /** The active three-quarter room view. */
  viewDirection?: Vector3;
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

export function Messages({
  device,
  link,
  corridorEnd,
  doorway,
  keeper,
  watch,
  cue,
  catchable = false,
  floor = 1,
  viewDirection = VIEW_DIRECTION,
}: Props) {
  const meshes = useRef<(Group | null)[]>([]);
  /** Each slot's trail lights, behind it on its path. */
  const trails = useRef<(Mesh | null)[][]>([]);
  /** Each slot's four shapes (CORE-15), shown one at a time by the message's kind. */
  const shapes = useRef<Record<MessageKind, Mesh | null>[]>([]);
  /** Each slot's message now, for hovering. */
  const showing = useRef<(Crossing | null)[]>([]);
  const [hover, setHover] = useState<{ slot: number; text: string } | null>(null);
  /** Which message each pooled mesh is showing now. */
  const slots = useRef<(number | null)[]>([]);
  // In from the corridor: corridor end → doorway → keeper. Out: the reverse.
  const inward = useMemo(
    () => [new Vector3(...corridorEnd), new Vector3(...doorway), new Vector3(...keeper)],
    [corridorEnd, doorway, keeper],
  );
  const outward = useMemo(() => [...inward].reverse(), [inward]);
  const seen = useRef(new Map<number, boolean>()); // frame id → leaving this machine?
  const ringFacing = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), viewDirection),
    [viewDirection],
  );

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

    // A slow breath (under 1 Hz), not a flicker.
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
    let newest: Group | null = null;
    meshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      const c = here[i];
      mesh.visible = !!c;
      slots.current[i] = c?.frameId ?? null;
      showing.current[i] = c ?? null;
      const trail = trails.current[i] ?? [];
      for (const t of trail) if (t) t.visible = !!c;
      if (!c) return;
      const kind = messageKind(c.bytes);
      const parts = shapes.current[i];
      if (parts) for (const k of KINDS) if (parts[k]) (parts[k] as Mesh).visible = k === kind;
      const t = progress(c, now);
      const leaving = c.from === device;
      along(leaving ? outward : inward, t, mesh.position);
      // They grow out of the dark corridor and shrink back into it.
      // Size grows with the message's real length (CORE-15): a small ARP, a fuller ping.
      const size = 0.8 + Math.min(c.bytes.length / 1500, 1) * 0.8;
      mesh.scale.setScalar(pulse * size * emerge(leaving ? 1 - t : t));
      trail.forEach((ghost, k) => {
        if (!ghost) return;
        const behind = t - (TRAIL[k] ?? 0);
        ghost.visible = behind > 0;
        along(leaving ? outward : inward, behind, ghost.position);
        ghost.scale.setScalar(size * (1 - 0.18 * (k + 1)) * emerge(leaving ? 1 - behind : behind));
      });
      newest = mesh;
    });
    // Several doorways share one keeper: only clear what it watches if that message has gone.
    if (newest) watch.current = newest;
    else if (watch.current && !watch.current.visible) watch.current = null;
  });

  const enter = (i: number) => {
    if (catchable) useSession.getState().setSpeed(AIMING_SPEED);
    const c = showing.current[i];
    if (c) setHover({ slot: i, text: messageSummary(c.bytes, floor) });
  };
  const leave = () => {
    if (catchable) useSession.getState().setSpeed(1);
    setHover(null);
  };

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: 3D messages are pointed at (raycast); Captures and the Scanner are the keyboard way
        <group
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pool of messages, reused by slot
          key={i}
          ref={(g) => {
            meshes.current[i] = g;
          }}
          visible={false}
          onPointerOver={() => enter(i)}
          onPointerOut={leave}
          onClick={
            catchable
              ? () => {
                  const frameId = slots.current[i];
                  leave();
                  if (frameId != null) void useSession.getState().catchFrame(frameId);
                }
              : undefined
          }
        >
          {/* One orb for a message to one machine; a ring for everyone; a diamond for ARP; a cube for DHCP. */}
          <mesh ref={(m) => (slot(shapes.current, i).unicast = m)}>
            <sphereGeometry args={[0.13, 20, 12]} />
            <meshBasicMaterial color={MESSAGE_COLOUR} toneMapped={false} />
          </mesh>
          <mesh ref={(m) => (slot(shapes.current, i).broadcast = m)} visible={false} quaternion={ringFacing}>
            <torusGeometry args={[0.15, 0.035, 8, 24]} />
            <meshBasicMaterial color={MESSAGE_COLOUR} toneMapped={false} />
          </mesh>
          <mesh ref={(m) => (slot(shapes.current, i).arp = m)} visible={false}>
            <octahedronGeometry args={[0.15]} />
            <meshBasicMaterial color={MESSAGE_COLOUR} toneMapped={false} />
          </mesh>
          <mesh ref={(m) => (slot(shapes.current, i).dhcp = m)} visible={false} rotation={[0.6, 0.6, 0]}>
            <boxGeometry args={[0.18, 0.18, 0.18]} />
            <meshBasicMaterial color={MESSAGE_COLOUR} toneMapped={false} />
          </mesh>
          {/* The soft halo round every kind of message. */}
          <mesh raycast={() => null} material={HALO}>
            <sphereGeometry args={[0.28, 20, 12]} />
          </mesh>
          {hover?.slot === i && (
            <Html center position={[0, 0.45, 0]} zIndexRange={[20, 0]}>
              <div className="message-summary">{hover.text}</div>
            </Html>
          )}
        </group>
      ))}
      {/* Each message's trail: small fading lights where it just was. */}
      {Array.from({ length: POOL }, (_, i) =>
        TRAIL.map((_, k) => (
          <mesh
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pool, reused by slot
            key={`${i}-${k}`}
            ref={(m) => {
              trails.current[i] ??= [];
              (trails.current[i] as (Mesh | null)[])[k] = m;
            }}
            visible={false}
            raycast={() => null}
          >
            <sphereGeometry args={[0.08, 10, 6]} />
            <meshBasicMaterial
              color={HALO_COLOUR}
              transparent
              opacity={TRAIL_FADE[k] ?? 0}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        )),
      )}
    </>
  );
}

const KINDS: MessageKind[] = ["unicast", "broadcast", "arp", "dhcp"];

function slot(all: Record<MessageKind, Mesh | null>[], i: number): Record<MessageKind, Mesh | null> {
  all[i] ??= { unicast: null, broadcast: null, arp: null, dhcp: null };
  return all[i];
}
