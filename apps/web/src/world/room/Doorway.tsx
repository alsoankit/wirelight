import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { fill, voice } from "@wirelight/content";
import { type RefObject, useMemo } from "react";
import type { Object3D } from "three";
import { positionLocal, smoothstep, uniform, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { useSession } from "../../engine/store";
import { type KeeperCue, Messages } from "../observatory/Messages";
import { Plate } from "../Plate";
import { cableSpan, type DoorSlot, doorGeometry, type Vec3 } from "./layout";

// One door of a machine's room (CORE-08..13): its corridor's cable, the messages on it, its plate,
// the way through to the room at the other end, and, when the cable is out at this end, the loose
// end on the floor. Everything here is derived from the session; every action runs a real command.

export type DoorInfo = {
  device: string;
  iface: string;
  link: string;
  /** The machine at the other end, and whether the player can go in (CORE-10). */
  peer: string;
  enterable: boolean;
  /** Why not, when it can't be entered (the room's `access` text). */
  barred?: string;
  /** Plates show the door name (Floor 1), then its MAC address (Floor 2 on). */
  showMac: boolean;
  /** Messages crossing here can be caught by hand (the room has catching). */
  catchable: boolean;
  /** Loose cable ends here can be plugged in by clicking (0040). */
  cableControl: "works" | "broken" | undefined;
};

// The corridor's rune-line (CORE-12): dark until a message and its answer have crossed, then lit;
// broken when the link is down (dim, slowly breathing: never a fast flicker).
function Cable({ slot, state }: { slot: DoorSlot; state: "dark" | "lit" | "broken" }) {
  const span = cableSpan(slot);
  const brightness = useMemo(() => uniform(0.18), []);
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ transparent: true, toneMapped: false });
    m.colorNode = vec3(0.21, 1, 1.05).mul(brightness);
    // Fully visible at the doorway end, fading out into the corridor.
    m.opacityNode = smoothstep(-span.length / 2, span.length / 2 - 0.3, positionLocal.z);
    return m;
  }, [brightness, span.length]);
  useFrame(({ clock }, delta) => {
    const target = state === "lit" ? 1.6 : state === "broken" ? 0.05 + 0.04 * Math.sin(clock.elapsedTime * 0.8) : 0.18;
    brightness.value += (target - brightness.value) * (1 - Math.exp(-delta * 2));
  });
  // The box's local +z points back toward the doorway.
  const rotationY = span.along === "z" ? 0 : Math.PI / 2;
  return (
    <mesh position={span.centre} rotation={[0, rotationY, 0]} material={material}>
      <boxGeometry args={[0.12, 0.02, span.length]} />
    </mesh>
  );
}

// The cable's end, out of its door and lying on the floor (1.2): a short dark coil with a dim tip.
function LooseEnd({ at, door, onPlug }: { at: Vec3; door: string; onPlug?: () => void }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the HTML button below is the keyboard and screen-reader way
    <group position={at} onClick={onPlug}>
      <mesh rotation={[Math.PI / 2, 0, 0.6]}>
        <torusGeometry args={[0.24, 0.045, 8, 24, Math.PI * 1.6]} />
        <meshStandardMaterial color="#2a2622" roughness={0.9} />
      </mesh>
      <mesh position={[0.2, 0.02, 0.1]}>
        <sphereGeometry args={[0.05, 12, 8]} />
        <meshBasicMaterial color={[0.25, 1.1, 1.2]} toneMapped={false} />
      </mesh>
      {onPlug && (
        <Html center position={[0, 0.25, 0]} zIndexRange={[10, 0]}>
          <button
            type="button"
            className="world-chip"
            onClick={onPlug}
            aria-label={`${voice.cableEnd.label} (${door})`}
          >
            {voice.cableEnd.label}
          </button>
        </Html>
      )}
    </group>
  );
}

type Props = {
  info: DoorInfo;
  slot: DoorSlot;
  keeper: Vec3;
  watch: RefObject<Object3D | null>;
  cue: RefObject<KeeperCue>;
};

export function Doorway({ info, slot, keeper, watch, cue }: Props) {
  const g = doorGeometry(slot);
  const key = `${info.device}:${info.iface}`;
  const door = useSession((s) => s.status?.doors[key]);
  const corridor = useSession((s) => s.status?.corridors[info.link] ?? "dark");
  const end = useSession((s) => s.status?.cableEnds[key]);
  const exec = useSession((s) => s.exec);
  const goTo = useSession((s) => s.goTo);
  const openPanel = useSession((s) => s.openPanel);

  const readPlate = () => {
    openPanel({ kind: "plate", device: info.device, iface: info.iface });
    // Reading a plate is the machine telling you about its door (1.1): the click runs the command.
    void exec(info.device, `ip link show ${info.iface}`, "click");
  };
  const label = fill(voice.doorway.go, { door: info.iface, name: info.peer });

  return (
    <>
      <Cable slot={slot} state={corridor} />
      <Messages
        device={info.device}
        link={info.link}
        corridorEnd={g.corridorEnd}
        doorway={g.doorway}
        keeper={[keeper[0], 0.85, keeper[2] - 0.36]}
        watch={watch}
        cue={cue}
        catchable={info.catchable}
      />
      {door && (
        <Plate
          position={g.plate}
          name={info.iface}
          mac={info.showMac ? door.mac : undefined}
          linkUp={door.up}
          onOpen={readPlate}
        />
      )}
      {end === "out" && (
        <LooseEnd
          at={g.looseEnd}
          door={info.iface}
          onPlug={
            info.cableControl === "works"
              ? () => void exec(info.device, `lab cable plug ${info.iface}`, "click")
              : undefined
          }
        />
      )}
      {/* The way through (CORE-10): a chip in the arch; sealed rooms say why. */}
      <Html center position={[g.doorway[0], 2.9, g.doorway[2]]} zIndexRange={[10, 0]}>
        {info.enterable ? (
          <button
            type="button"
            className="world-chip"
            data-tour="door"
            onClick={() => goTo(info.peer)}
            aria-label={label}
          >
            → {info.peer}
          </button>
        ) : (
          <span className="world-chip" data-tone="sealed" title={info.barred}>
            {info.peer} · {info.barred}
          </span>
        )}
      </Html>
    </>
  );
}
