import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { fill, voice } from "@wirelight/content";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { type Group, MeshBasicMaterial, type Object3D, type Vector3 } from "three";
import { float, fract, mix, positionLocal, smoothstep, step, uniform, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { MARK_MS, useSession } from "../../engine/store";
import { TAB } from "../../play/keys";
import { useMachineLabel } from "../../play/roles";
import { goThrough, stepIntoCorridor } from "../corridor/move";
import { type KeeperCue, Messages } from "../observatory/Messages";
import { Plate } from "../Plate";
import { useRegion } from "../region";
import { cableSpan, type DoorSlot, doorGeometry, type Vec3 } from "./layout";
import { addToPile, type Scrap } from "./lostPile";
import { Sealed } from "./Sealed";

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
  /** …its house addresses (Floor 5 on), and streets apart from house numbers (Floor 7 on). */
  showAddrs: boolean;
  streets: boolean;
  /** The room's floor (what hovering a message may show). */
  floor: number;
  /** Messages crossing here can be caught by hand (the room has catching). */
  catchable: boolean;
  /** Loose cable ends here can be plugged in by clicking (0040). */
  cableControl: "works" | "broken" | undefined;
  /** The far end's key (`device:iface`), and whether another door here leads to the same machine. */
  farEnd: string;
  twin: boolean;
};

// The corridor's rune-line (CORE-12): dark until a message and its answer have crossed, then lit;
// broken when the link is down (dim, slowly breathing: never a fast flicker). Broken is also a
// shape (UI-21, rendering.md): the line breaks into dashes, cracked rather than whole.
function Cable({ slot, state }: { slot: DoorSlot; state: "dark" | "lit" | "broken" }) {
  const span = cableSpan(slot);
  const brightness = useMemo(() => uniform(0.18), []);
  const cracked = useMemo(() => uniform(0), []);
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ transparent: true, toneMapped: false });
    m.colorNode = vec3(0.21, 1, 1.05).mul(brightness);
    // Fully visible at the doorway end, fading out into the corridor; gaps every 40 cm when cracked.
    const fade = smoothstep(-span.length / 2, span.length / 2 - 0.3, positionLocal.z);
    const dashes = step(0.35, fract(positionLocal.z.mul(2.5)));
    m.opacityNode = fade.mul(mix(float(1), dashes, cracked));
    return m;
  }, [brightness, cracked, span.length]);
  useFrame(({ clock }, delta) => {
    cracked.value = state === "broken" ? 1 : 0;
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

/** Invisible click area filling the arch opening, inset from its edges. */
function GateStep({ slot, name, onStep }: { slot: DoorSlot; name: string; onStep: () => void }) {
  const g = doorGeometry(slot);
  const [hover, setHover] = useState(false);
  const rotationY = slot.wall === "back" ? 0 : Math.PI / 2;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D target (raycast); Shift and the door's number is the keyboard way
    <group
      position={[
        g.doorway[0] + (slot.wall === "left" ? 0.08 : 0),
        1.2,
        g.doorway[2] + (slot.wall === "back" ? 0.08 : 0),
      ]}
      rotation={[0, rotationY, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "";
        onStep();
      }}
    >
      <mesh material={HIT_MATERIAL}>
        <boxGeometry args={[1.45, 2.1, 0.08]} />
      </mesh>
      {hover && (
        <Html center position={[0, 0.5, 0]} zIndexRange={[20, 0]}>
          <div className="message-summary">{fill(voice.corridor.step, { name })}</div>
        </Html>
      )}
    </group>
  );
}

/** Invisible but still hit by the pointer (a hidden mesh would be skipped by raycasting). */
const HIT_MATERIAL = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

// Where messages died at this door (CORE-17): small faded scraps on the floor just inside it. They
// pile up while messages keep dying here (2.2's clue: ignored messages pile at lantern's door), each
// fading away about half a minute after it fell. They never say why: that's for the player to find out.
const PILE_MS = Math.max(MARK_MS, 30_000);
const PILE_MAX = 10;

function LostPile({ door, at, onReplay }: { door: string; at: Vec3; onReplay: (frameId: number) => void }) {
  const marks = useSession((s) => s.marks);
  // The store forgets a mark after MARK_MS; the pile remembers what fell here a little longer.
  const pile = useRef<Scrap[]>([]);
  const taken = useRef<ReadonlySet<number>>(new Set());
  const [, redraw] = useState(0);
  useEffect(() => {
    const next = addToPile(pile.current, taken.current, marks, door, performance.now(), PILE_MAX, PILE_MS);
    if (!next) return;
    pile.current = next.pile;
    taken.current = next.taken;
    redraw((n) => n + 1);
  }, [marks, door]);
  const groups = useRef<(Group | null)[]>([]);
  const material = useMemo(() => new MeshBasicMaterial({ color: "#b9ad9c", transparent: true, opacity: 0.55 }), []);
  useFrame(() => {
    const now = performance.now();
    let gone = false;
    pile.current.forEach((m, i) => {
      const age = (now - m.at) / PILE_MS;
      const g = groups.current[i];
      if (age >= 1) gone = true;
      if (g) g.scale.setScalar(age < 0.75 ? 1 : Math.max(0.001, 1 - (age - 0.75) / 0.25));
    });
    if (gone) {
      pile.current = pile.current.filter((m) => now - m.at < PILE_MS);
      redraw((n) => n + 1);
    }
  });
  return (
    <>
      {pile.current.map((m, i) => {
        // Scattered a little, each a bit higher than the last: a heap, not one spot.
        const dx = (((m.frameId * 37) % 11) - 5) * 0.045;
        const dz = (((m.frameId * 53) % 7) - 3) * 0.05;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: a 3D mark (raycast click); replays are also in the debrief
          <group
            key={m.frameId}
            ref={(g) => {
              groups.current[i] = g;
            }}
            position={[at[0] + dx, 0.035 + i * 0.008, at[2] + dz]}
            rotation={[-Math.PI / 2, 0, (m.frameId * 1.7) % Math.PI]}
            onClick={() => onReplay(m.frameId)}
          >
            <mesh material={material}>
              <planeGeometry args={[0.2, 0.14]} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// The cable's end, out of its door and lying on the floor (1.2): a short dark coil with a dim tip.
function LooseEnd({ at, door, onPlug, tab }: { at: Vec3; door: string; onPlug?: () => void; tab: number }) {
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
            data-tab={tab}
            onClick={onPlug}
            aria-label={fill(voice.cableEnd.plug, { door })}
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
  /** Its place among the room's doors (eth0 = 0): its number key is one more (CORE-47). */
  index: number;
  slot: DoorSlot;
  keeper: Vec3;
  viewDirection: Vector3;
  watch: RefObject<Object3D | null>;
  cue: RefObject<KeeperCue>;
};

export function Doorway({ info, index, slot, keeper, viewDirection, watch, cue }: Props) {
  const g = doorGeometry(slot);
  const key = `${info.device}:${info.iface}`;
  const door = useSession((s) => s.status?.doors[key]);
  const corridor = useSession((s) => s.status?.corridors[info.link] ?? "dark");
  const end = useSession((s) => s.status?.cableEnds[key]);
  const farEnd = useSession((s) => s.status?.cableEnds[info.farEnd]);
  // A spare way to a machine already reachable by another door can't be walked while its cable is out
  // (4.3's loose span); a room's only way stays walkable (1.2: you walk to the loose end).
  const walkable = info.enterable && !(info.twin && (end === "out" || farEnd === "out"));
  const replayLost = (frameId: number) => useSession.getState().setReplay(frameId);
  const region = useRegion();
  const exec = useSession((s) => s.exec);
  const openPanel = useSession((s) => s.openPanel);

  const readPlate = () => {
    openPanel({ kind: "plate", device: info.device, iface: info.iface });
    // Reading a plate is the machine telling you about its door (1.1): the click runs the command.
    void exec(info.device, `ip link show ${info.iface}`, "click");
  };
  const peer = useMachineLabel()(info.peer);
  const label = fill(voice.doorway.go, { door: info.iface, name: peer });
  // Number keys 1–9 go through the doors in order (CORE-47).
  const shortcut = index < 9 ? String(index + 1) : undefined;
  const enter = () => {
    void exec(info.device, `ip link show ${info.iface}`, "click");
    stepIntoCorridor(info.link, info.device);
  };

  return (
    <>
      <Cable slot={slot} state={corridor} />
      <GateStep slot={slot} name={peer} onStep={enter} />
      <Messages
        device={info.device}
        link={info.link}
        corridorEnd={g.corridorEnd}
        doorway={g.doorway}
        keeper={[keeper[0], 0.85, keeper[2] - 0.36]}
        watch={watch}
        cue={cue}
        catchable={info.catchable}
        floor={info.floor}
        viewDirection={viewDirection}
      />
      {door && (
        <Plate
          position={g.plate}
          name={info.iface}
          mac={info.showMac ? door.mac : undefined}
          addrs={info.showAddrs ? door.addrs : undefined}
          streets={info.streets}
          linkUp={door.up}
          onOpen={readPlate}
          tab={TAB.plate + index}
        />
      )}
      <LostPile
        door={key}
        at={[(g.doorway[0] + g.looseEnd[0]) / 2, 0, (g.doorway[2] + g.looseEnd[2]) / 2]}
        onReplay={replayLost}
      />
      {!info.enterable && <Sealed slot={slot} region={region} />}
      {end === "out" && (
        <LooseEnd
          at={g.looseEnd}
          door={info.iface}
          tab={TAB.cableEnd + index}
          onPlug={
            info.cableControl === "works"
              ? () => void exec(info.device, `lab cable plug ${info.iface}`, "click")
              : undefined
          }
        />
      )}
      {/* The way through (CORE-10): a chip in the arch; sealed rooms say why. */}
      <Html center position={[g.doorway[0], 2.9, g.doorway[2]]} zIndexRange={[10, 0]}>
        {walkable ? (
          <button
            type="button"
            className="world-chip"
            data-tour="door"
            data-tab={TAB.door + index}
            onClick={() => goThrough(info.link, info.device, info.peer)}
            aria-label={label}
            aria-keyshortcuts={shortcut}
          >
            {shortcut && <kbd className="chip-key">{shortcut}</kbd>}→ {peer}
          </button>
        ) : (
          <span
            className="world-chip"
            data-tone="sealed"
            data-tab={TAB.door + index}
            role="note"
            aria-label={fill(voice.doorway.sealed, { name: info.peer, why: info.barred ?? "" })}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: focus shows why it's closed (agent D)
            tabIndex={0}
          >
            {/* Just the name; why it's closed shows on hover or focus (styles.css, agent D). */}
            {info.peer}
            {info.barred && <span className="chip-why">{info.barred}</span>}
          </span>
        )}
      </Html>
      <Html center position={[g.doorway[0], 1.2, g.doorway[2]]} zIndexRange={[9, 0]}>
        <button
          type="button"
          className="corridor-gate-hit"
          data-tab={TAB.door + index}
          aria-label={fill(voice.corridor.step, { name: peer })}
          aria-keyshortcuts="Enter"
          onClick={enter}
        >
          <span>{fill(voice.corridor.step, { name: peer })}</span>
        </button>
      </Html>
    </>
  );
}

/** A door with no cable at all (a spare port): its plate, link down, and the dark doorway. */
export function EmptyDoor({ device, iface, slot }: { device: string; iface: string; slot: DoorSlot }) {
  const g = doorGeometry(slot);
  const door = useSession((s) => s.status?.doors[`${device}:${iface}`]);
  const exec = useSession((s) => s.exec);
  const openPanel = useSession((s) => s.openPanel);
  if (!door) return null;
  return (
    <Plate
      position={g.plate}
      name={iface}
      mac={door.mac}
      linkUp={door.up}
      onOpen={() => {
        openPanel({ kind: "plate", device, iface });
        void exec(device, `ip link show ${iface}`, "click");
      }}
    />
  );
}
