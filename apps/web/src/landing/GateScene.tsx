import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  DoubleSide,
  FogExp2,
  type PerspectiveCamera,
  type PointLight,
  Shape,
  ShapeGeometry,
  Vector3,
} from "three";
import { color, float, mix, positionLocal, sin, smoothstep, time } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { CinematicPost } from "../render/CinematicPost";
import { useQuality } from "../render/quality";
import { Fireflies } from "../world/Fireflies";
import { makeFlagstones } from "../world/kit/floor";
import { type Extra, StaticRoom } from "../world/kit/StaticRoom";
import { WindDriver } from "../world/WindDriver";
import { Bird } from "./Bird";
import { makeGround, makeMound } from "./ground";
import { CAMERA, GATE_OPENING, LANDING, LIGHT_DIRECTION, MOON_DIRECTION, MOUND, PATH_START, TO_CAMERA } from "./layout";
import { Mist } from "./Mist";
import { RuneLine } from "./RuneLine";
import { HORIZON, Sky } from "./Sky";

// The way down: the arch opening, dark at the top and glowing from below, where steps lead down
// toward the network's light. It's the scene's one bright place, where the eye goes (the rune-line
// leads there too). The glow is the network's (cyan family, CORE-14); it breathes very slowly.
const GLOW = "#57d5de";

function Opening() {
  const shape = useMemo(() => {
    const s = new Shape();
    s.moveTo(-1.05, 0);
    s.lineTo(1.05, 0);
    s.lineTo(1.05, 2);
    s.absarc(0, 2, 1.05, 0, Math.PI, false);
    s.lineTo(-1.05, 0);
    return new ShapeGeometry(s, 24);
  }, []);
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ toneMapped: false });
    const breath = sin(time.mul(0.45)).mul(0.08).add(1);
    // Brightest at the threshold, gone into darkness a metre and a half up.
    const rise = float(1)
      .sub(smoothstep(0.0, 1.6, positionLocal.y))
      .pow(2.2);
    m.colorNode = mix(color("#020305"), color(GLOW).mul(1.35), rise.mul(breath));
    return m;
  }, []);
  return <mesh geometry={shape} position={[0, -0.05, -0.25]} material={material} />;
}

// The light from below, spilling out of the arch: it lights the threshold, the inside of the arch,
// the columns and the start of the path. One runtime light (no shadows); everything else is baked.
function ThresholdLight() {
  const light = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    if (light.current) light.current.intensity = 9 * (1 + Math.sin(clock.elapsedTime * 0.45) * 0.08);
  });
  return <pointLight ref={light} position={[0, 0.5, 0.5]} color={GLOW} distance={10} decay={1.6} />;
}

// The landing's 3D scene (ONB-01): calm, hauntingly beautiful. Moonlight is baked into the static
// gate, trees and ground once at load (0053); the sky, mist, rune-line, bird, fireflies and wind move.

const PATH_HALF_WIDTH = 1.05;

// How much of a point is on the path (1 on it, 0 off it), for wearing the ground bare.
function onPath(x: number, z: number): number {
  if (z < 0.3 || z > PATH_START.z + 1) return 0;
  const centre = (PATH_START.x * (z - 0.3)) / (PATH_START.z - 0.3);
  return Math.max(0, 1 - Math.max(0, Math.abs(x - centre) - PATH_HALF_WIDTH * 0.7) / 0.8);
}

const EXTRAS: Extra[] = [
  { name: "Earth", geometry: makeGround(44, 88, onPath) },
  { name: "Earth", geometry: makeMound(MOUND.centre, MOUND.radius, MOUND.height) },
  {
    name: "Floor",
    // The old path: the same laid flagstones as the rooms, kept only along the path, many gone.
    geometry: makeFlagstones({
      size: 24,
      seed: 4471,
      missing: 0.22,
      cracked: 0.3,
      keep: (x, z) => onPath(x, z) > 0.95 && z < PATH_START.z,
    }),
  },
];

const FIREFLIES = { min: [-7, 0.4, -3] as [number, number, number], max: [7, 2.8, 6] as [number, number, number] };

function LandingCamera() {
  const camera = useThree((s) => s.camera as PerspectiveCamera);
  const wanted = useMemo(() => new Vector3(), []);
  useEffect(() => {
    camera.fov = CAMERA.fov;
    camera.near = 0.3;
    camera.far = 200;
    camera.position.copy(CAMERA.position);
    camera.lookAt(CAMERA.target);
    camera.updateProjectionMatrix();
  }, [camera]);
  // A slow breathing drift (about 20 s), plus a gentle one with the pointer (as in the rooms).
  useFrame(({ pointer, clock }, delta) => {
    const t = clock.elapsedTime;
    wanted
      .copy(CAMERA.position)
      .add({ x: pointer.x * 0.35 + Math.sin(t * 0.31) * 0.18, y: pointer.y * 0.15 + Math.sin(t * 0.23) * 0.06, z: 0 });
    camera.position.lerp(wanted, 1 - Math.exp(-delta * 2));
    camera.lookAt(CAMERA.target);
  });
  return null;
}

// Night light: a cool fill, moonlight from behind catching the tops and edges of things (rim), and
// fog the colour of the horizon haze, so distance fades everything into the sky (depth in layers).
function NightLight() {
  const scene = useThree((s) => s.scene);
  const fog = useRef(new FogExp2(HORIZON, 0.03));
  useEffect(() => {
    scene.fog = fog.current;
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  return (
    <>
      <ambientLight color="#3a4868" intensity={1.0} />
      <hemisphereLight color="#7d95cc" groundColor="#1c2028" intensity={1.8} />
      <directionalLight
        position={MOON_DIRECTION.clone().multiplyScalar(30).toArray()}
        color="#a9c1ff"
        intensity={2.2}
      />
    </>
  );
}

export function GateScene() {
  const quality = useQuality();
  return (
    <>
      <LandingCamera />
      <color attach="background" args={[HORIZON]} />
      <NightLight />
      <Sky moon={MOON_DIRECTION} />
      <Suspense fallback={null}>
        <StaticRoom placements={LANDING} extras={EXTRAS} toCamera={TO_CAMERA} toMoon={LIGHT_DIRECTION} />
      </Suspense>
      <Opening />
      <ThresholdLight />
      <RuneLine from={PATH_START} to={GATE_OPENING} />
      <Mist />
      <Bird />
      <WindDriver />
      {quality.fireflies && <Fireflies bounds={FIREFLIES} />}
      {quality.bloom && <CinematicPost />}
    </>
  );
}
