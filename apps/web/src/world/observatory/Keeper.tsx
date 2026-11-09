import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import { BoxGeometry, CylinderGeometry, type Group, PlaneGeometry, type PointLight, SphereGeometry } from "three";
import { color, float, floor, fract, mix, sin, step, uniform, uv } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { regionMaterial } from "../kit/regionMaterials";
import type { RegionId } from "../region";
import type { KeeperCue } from "./Messages";

// The keeper (0107): the machine in the middle of every room, the thing that really handles each
// message. A heavy old cabinet with a keyboard and an amber screen. It stands still: its screen
// brightens as a message arrives and dims when it is asleep (0042). Amber, never cyan: cyan belongs
// to messages (0090). (Its old beam toward the chosen door is gone: owner, 2026-11-10, "not accurate".)
// Built in code; its front is +z here. Its back is to its doorway, square to the walls, so its screen faces into the room.

type Props = {
  position: [number, number, number];
  region?: RegionId;
  /** Its desk holds messages it won't pass on (0042): the screen is nearly out. */
  asleep?: boolean;
  rest: [number, number, number]; // the doorway it turns its back to
  cue: RefObject<KeeperCue>; // when to brighten (a message arrived) and when to point (an answer left)
};

const ARRIVAL_SECONDS = 1.0;
const SCREEN_AT: [number, number, number] = [0, 1.12, 0.222];

// One keeper per room: one screen level.
const screenLevel = uniform(1);

const PLINTH = new BoxGeometry(1, 0.1, 0.72);
const BODY = new BoxGeometry(0.9, 0.62, 0.62);
const BRASS_BAND = new BoxGeometry(0.94, 0.045, 0.66);
const PANEL = new BoxGeometry(0.7, 0.4, 0.02);
const SLAT = new BoxGeometry(0.6, 0.02, 0.012);
const SHELF = new BoxGeometry(0.9, 0.06, 0.42);
const KEYS = new BoxGeometry(0.62, 0.02, 0.2);
const HEAD = new BoxGeometry(0.86, 0.62, 0.5);
const BEZEL = new BoxGeometry(0.72, 0.5, 0.04);
const SCREEN = new PlaneGeometry(0.62, 0.4);
const LAMP = new SphereGeometry(0.018, 10, 8);
const CONDUIT = new CylinderGeometry(0.025, 0.025, 1.3, 8);
const MAST = new CylinderGeometry(0.012, 0.012, 0.3, 6);
const SLATS = [0.3, 0.38, 0.46, 0.54];
const LAMPS = [-0.1, 0, 0.1];
const CONDUITS = [-0.32, 0.32];

/** The screen: lines of text in amber on dark glass, as bright as `screenLevel`. */
function screenMaterial() {
  const m = new MeshBasicNodeMaterial({ toneMapped: false });
  const rows = uv().y.mul(9);
  const row = fract(rows);
  const length = fract(sin(floor(rows).mul(12.9)).mul(437.5))
    .mul(0.5)
    .add(0.35);
  const text = step(0.35, row)
    .mul(float(1).sub(step(0.7, row)))
    .mul(step(0.07, uv().x))
    .mul(float(1).sub(step(length, uv().x)));
  m.colorNode = mix(color("#2a1606"), color("#FFC27A"), text).mul(screenLevel);
  return m;
}

export function Keeper({ position, rest, cue, region = 1, asleep = false }: Props) {
  const stone = regionMaterial("Stone", region);
  const iron = regionMaterial("Iron", region);
  const brass = regionMaterial("AgedBrass", region);
  const screen = useMemo(screenMaterial, []);
  const machine = useRef<Group>(null);
  const glow = useRef<PointLight>(null);
  const facing =
    Math.round(Math.atan2(rest[0] - position[0], rest[2] - position[2]) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI;

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const c = cue.current;
    const m = machine.current;
    if (!m) return;

    const sinceArrival = now - c.arrived;
    const arriving = sinceArrival >= 0 && sinceArrival < ARRIVAL_SECONDS;
    const pulse = arriving ? Math.sin((Math.PI * sinceArrival) / ARRIVAL_SECONDS) : 0;
    screenLevel.value = asleep ? 0.12 : 1 + pulse * 0.5;
    if (glow.current) glow.current.intensity = screenLevel.value;
  });

  return (
    <group position={position}>
      <group ref={machine} rotation={[0, facing, 0]}>
        <mesh geometry={PLINTH} material={iron} position={[0, 0.05, 0]} />
        <mesh geometry={BODY} material={stone} position={[0, 0.41, 0]} />
        <mesh geometry={BRASS_BAND} material={brass} position={[0, 0.41, 0]} />
        <mesh geometry={PANEL} material={iron} position={[0, 0.42, 0.315]} />
        {SLATS.map((y) => (
          <mesh key={y} geometry={SLAT} material={brass} position={[0, y, 0.33]} />
        ))}
        <mesh geometry={SHELF} material={stone} position={[0, 0.76, 0.12]} rotation={[0.2, 0, 0]} />
        <mesh geometry={KEYS} material={iron} position={[0, 0.795, 0.2]} rotation={[0.2, 0, 0]} />
        <mesh geometry={HEAD} material={stone} position={[0, 1.1, -0.06]} />
        <mesh geometry={BEZEL} material={iron} position={[0, 1.12, 0.2]} />
        <mesh geometry={SCREEN} material={screen} position={SCREEN_AT} />
        {LAMPS.map((x) => (
          <mesh key={x} geometry={LAMP} material={screen} position={[x, 0.83, 0.195]} />
        ))}
        {CONDUITS.map((x) => (
          <mesh key={x} geometry={CONDUIT} material={brass} position={[x, 0.75, -0.36]} />
        ))}
        <mesh geometry={MAST} material={brass} position={[0.3, 1.56, -0.1]} />
        <pointLight ref={glow} position={[0, 1.1, 0.55]} color="#FFD9A0" distance={2.6} decay={2} />
      </group>
    </group>
  );
}
