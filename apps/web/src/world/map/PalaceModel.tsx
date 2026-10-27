import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { type Group, type Mesh, Vector3 } from "three";
import {
  attribute,
  color,
  float,
  normalView,
  positionLocal,
  positionViewDirection,
  sin,
  time,
  vec3,
  vertexColor,
} from "three/tsl";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { reducedMotion } from "../../progress/motion";
import { backendFromUrl, nodeRendererFactory } from "../../render/backend";
import { FPS, FrameCap } from "../../render/FrameCap";
import { buildPalace, type Look, MARKER } from "./palace";

// The world map's 3D palace (0088): the model on its hill, turning slowly; the player can drag it
// round (or use the arrow keys). It's the map, not a room, so the fixed-camera rule doesn't apply.
// Five materials, about six draw calls: the palace is rebuilt only when the floors' states change.

const ruinMat = new MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
const litMat = new MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
// Restored stone gives back a warm light of its own, so it reads lit from any side as the model turns.
litMat.emissiveNode = vertexColor().mul(color("#ffc183")).mul(0.3);
const glowMat = new MeshBasicNodeMaterial({ toneMapped: false });
glowMat.colorNode = vertexColor().mul(1.8);
const cableMat = new MeshBasicNodeMaterial({ toneMapped: false });
// The network's light (0090): cyan, breathing slowly.
cableMat.colorNode = color("#5ee0e8").mul(sin(time.mul(1.6)).mul(0.25).add(1.45));
const mistMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
mistMat.colorNode = vertexColor();
// Soft at the edges: thickest where the blob faces the eye, so overlapping blobs read as one mist.
mistMat.opacityNode = normalView
  .dot(positionViewDirection)
  .saturate()
  .pow(1.8)
  .mul(attribute("density", "float"))
  .mul(0.42);
mistMat.positionNode = positionLocal.add(vec3(sin(time.mul(0.35).add(positionLocal.y.mul(3))).mul(0.06), float(0), 0));
const markerMat = new MeshBasicNodeMaterial({ toneMapped: false });
markerMat.colorNode = color("#fff1d6").mul(1.6);
const beamMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, toneMapped: false });
beamMat.colorNode = color("#ffe2b0");
beamMat.opacity = 0.35;

const TURN = 0.07; // radians a second: one turn in a minute and a half
const RESUME = 2.5; // seconds after a drag before the auto-turn picks up again

function Turntable({ children, auto, input }: { children: ReactNode; auto: boolean; input: { current: number } }) {
  const group = useRef<Group>(null);
  const idle = useRef(RESUME);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // Frame the hill whatever the panel's shape: the keep's height on wide panels, the outer wall's
  // width on narrow ones (fov 30: tan 15° ≈ 0.268).
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const dist = Math.max(44, 13.5 / (0.268 * aspect));
    const up = 28 * (Math.PI / 180);
    camera.position.set(0, dist * Math.sin(up) + 4, dist * Math.cos(up));
    camera.lookAt(0, 4, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (input.current !== 0) {
      g.rotation.y += input.current;
      input.current = 0;
      idle.current = 0;
    } else idle.current += dt;
    if (auto && idle.current > RESUME) g.rotation.y += TURN * Math.min(dt, 0.1);
  });
  return <group ref={group}>{children}</group>;
}

const seen = new Vector3();

/** The mark over the floor you're on; its words are a DOM label kept over it as the model turns. */
function Marker({ at, tag }: { at: [number, number, number]; tag: { current: HTMLDivElement | null } }) {
  const mark = useRef<Mesh>(null);
  useFrame(({ clock, camera, size }) => {
    const m = mark.current;
    if (!m) return;
    m.position.y = at[1] + 0.35 + Math.sin(clock.elapsedTime * 2) * 0.12;
    m.rotation.y = clock.elapsedTime * 0.8;
    const el = tag.current;
    if (!el) return;
    m.getWorldPosition(seen).project(camera);
    el.style.transform = `translate(${((seen.x + 1) / 2) * size.width}px, ${((1 - seen.y) / 2) * size.height - 26}px) translate(-50%, -100%)`;
    el.style.visibility = "visible";
  });
  return (
    <>
      <mesh ref={mark} geometry={MARKER} material={markerMat} position={at} />
      <mesh material={beamMat} position={[at[0], at[1] - 0.6, at[2]]}>
        <cylinderGeometry args={[0.035, 0.035, 1.4, 6, 1, true]} />
      </mesh>
    </>
  );
}

function Palace({ looks, keepGlow, here, tag }: PalaceProps & { tag: { current: HTMLDivElement | null } }) {
  const key = JSON.stringify(looks) + keepGlow;
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt only when the looks change, keyed by value.
  const p = useMemo(() => buildPalace(looks, keepGlow), [key]);
  useEffect(
    () => () => {
      for (const g of [p.ruin, p.lit, p.glow, p.cable, p.mist]) g?.dispose();
    },
    [p],
  );
  const at = here !== undefined ? p.anchors[here] : undefined;
  return (
    <>
      {p.ruin && <mesh geometry={p.ruin} material={ruinMat} />}
      {p.lit && <mesh geometry={p.lit} material={litMat} />}
      {p.glow && <mesh geometry={p.glow} material={glowMat} />}
      {p.cable && <mesh geometry={p.cable} material={cableMat} />}
      {p.mist && <mesh geometry={p.mist} material={mistMat} renderOrder={2} />}
      {at && <Marker at={at} tag={tag} />}
    </>
  );
}

type PalaceProps = { looks: Record<number, Look>; keepGlow: boolean; here?: number; hereLabel: string };

/** Dev aid: the map's meshes (one draw call each) and triangles (`window.__mapInfo`). */
function DevHandle() {
  const scene = useThree((s) => s.scene);
  useFrame(() => {
    if (!import.meta.env.DEV) return;
    let meshes = 0;
    let triangles = 0;
    scene.traverseVisible((o) => {
      const g = (o as Mesh).isMesh ? (o as Mesh).geometry : null;
      if (!g) return;
      meshes++;
      triangles += (g.index?.count ?? g.attributes.position?.count ?? 0) / 3;
    });
    (window as unknown as { __mapInfo?: unknown }).__mapInfo = { meshes, triangles };
  });
  return null;
}

/** `label`: the picture's description for screen readers; the arrow keys turn it too. */
export function PalaceModel({ turn, label, ...props }: PalaceProps & { turn: boolean; label: string }) {
  const input = useRef(0);
  const tag = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const auto = turn && !reducedMotion();
  return (
    <div
      className="world-model-canvas"
      role="img"
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the arrow keys can turn the model.
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") input.current -= 0.25;
        if (e.key === "ArrowRight") input.current += 0.25;
      }}
      onPointerDown={(e) => {
        drag.current = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current === null) return;
        input.current += (e.clientX - drag.current) * 0.008;
        drag.current = e.clientX;
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <Canvas
        gl={nodeRendererFactory(backendFromUrl() === "webgl2" ? "webgl2" : "webgpu")}
        camera={{ fov: 30, near: 1, far: 160, position: [0, 24, 39] }}
        frameloop={FPS ? "demand" : "always"}
        dpr={[1, 1.75]}
      >
        <FrameCap />
        <DevHandle />
        <fog attach="fog" args={["#0a0c10", 40, 72]} />
        <hemisphereLight args={["#5d6c92", "#33281d", 1.9]} />
        <directionalLight position={[-8, 14, 10]} intensity={1.4} color="#c9d3f2" />
        <Turntable auto={auto} input={input}>
          <Palace {...props} tag={tag} />
        </Turntable>
      </Canvas>
      {props.here !== undefined && (
        <div ref={tag} className="world-here-tag" aria-hidden="true">
          {props.hereLabel}
        </div>
      )}
    </div>
  );
}
