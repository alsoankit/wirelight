import {
  AdaptiveDpr,
  ContactShadows,
  Float,
  Html,
  Outlines,
  PerformanceMonitor,
  Sparkles,
  Stars,
  Trail,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type FC, useEffect, useMemo, useRef } from "react";
import { AnimationClip, type Group, type InstancedMesh, type Mesh, NumberKeyframeTrack, Object3D } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { color, mix, pass, uniform } from "three/tsl";
import { MeshStandardNodeMaterial, RenderPipeline, type WebGPURenderer } from "three/webgpu";

// One check per renderer feature the game plans to rely on (tech/rendering.md).
// `nodeOnly` checks use three's node system, which only the WebGPURenderer (either backend) has.
export type Check = {
  id: string;
  label: string;
  usedFor: string;
  nodeOnly?: boolean;
  Scene: FC;
};

const ARCH_URL = "/assets/dev/Wall_ArchRound_Overgrown.glb";

function Baseline() {
  return (
    <mesh position={[0, 0.5, 0]}>
      <boxGeometry />
      <meshStandardMaterial color="#C9A27A" />
    </mesh>
  );
}

// The ruin dial: one uniform blends cold ruined colours into restored ones (art-direction.md).
function TslRuin() {
  const ruin = useMemo(() => uniform(1), []);
  const material = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.colorNode = mix(color("#C9A27A"), color("#5B6370"), ruin);
    return m;
  }, [ruin]);
  useFrame(({ clock }) => {
    ruin.value = (Math.sin(clock.elapsedTime * 2) + 1) / 2;
  });
  return (
    <mesh position={[0, 0.5, 0]} material={material}>
      <sphereGeometry args={[0.8, 48, 24]} />
    </mesh>
  );
}

// Bloom through three's node post-processing (RenderPipeline replaces PostProcessing since r183).
function Bloom() {
  const { gl, scene, camera } = useThree();
  const pipeline = useMemo(() => {
    const p = new RenderPipeline(gl as unknown as WebGPURenderer);
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode("output");
    p.outputNode = sceneColor.add(bloom(sceneColor, 1.2, 0.4, 0.1));
    return p;
  }, [gl, scene, camera]);
  useEffect(() => () => pipeline.dispose(), [pipeline]);
  // A positive priority takes rendering over from R3F for as long as this check is mounted.
  useFrame(() => pipeline.render(), 1);
  return (
    <mesh position={[0, 0.5, 0]}>
      <sphereGeometry args={[0.5, 32, 16]} />
      <meshStandardMaterial color="#5EE0E8" emissive="#5EE0E8" emissiveIntensity={3} />
    </mesh>
  );
}

// Messages: up to 2,000 glowing orbs in one draw call (storm rooms).
function InstancedMessages() {
  const count = 2000;
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + t * 0.3;
      const r = 1.5 + (i % 7) * 0.12;
      dummy.position.set(Math.cos(a * 3) * r, 0.5 + Math.sin(a * 5 + t) * 0.6, Math.sin(a * 3) * r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.04, 8, 6]} />
      <meshBasicMaterial color="#5EE0E8" />
    </instancedMesh>
  );
}

function Gltf() {
  const { scene } = useGLTF(ARCH_URL);
  const copy = useMemo(() => scene.clone(), [scene]);
  return <primitive object={copy} scale={0.5} />;
}

// Plates are HTML anchored to doors, so text stays crisp at every quality tier.
function HtmlPlate() {
  return (
    <group>
      <Baseline />
      <Html position={[0, 1.4, 0]} center>
        <div
          style={{
            background: "rgba(20,16,12,0.85)",
            color: "#f3e9dc",
            padding: "6px 10px",
            borderRadius: 6,
            font: "13px/1.3 monospace",
            whiteSpace: "nowrap",
          }}
        >
          eth0 · 02:00:00:00:00:05 <span style={{ color: "#5EE0E8" }}>◆</span>
        </div>
      </Html>
    </group>
  );
}

function FloatCheck() {
  return (
    <Float speed={2} floatIntensity={1}>
      <Baseline />
    </Float>
  );
}

// Keeper animations come from glTF clips; this checks the helper with a built clip.
function Animations() {
  const ref = useRef<Group>(null);
  const clips = useMemo(
    () => [new AnimationClip("bob", 2, [new NumberKeyframeTrack(".position[y]", [0, 1, 2], [0, 1, 0])])],
    [],
  );
  const { actions } = useAnimations(clips, ref);
  useEffect(() => {
    actions.bob?.play();
  }, [actions]);
  return (
    <group ref={ref}>
      <Baseline />
    </group>
  );
}

function SparklesCheck() {
  return <Sparkles count={120} scale={4} size={6} speed={0.4} color="#FFC46B" position={[0, 1, 0]} />;
}

function TrailCheck() {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 2;
    ref.current?.position.set(Math.cos(t) * 1.5, 0.8, Math.sin(t) * 1.5);
  });
  return (
    <Trail width={1} length={6} color="#5EE0E8" attenuation={(w) => w * w}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.1, 16, 8]} />
        <meshBasicMaterial color="#5EE0E8" />
      </mesh>
    </Trail>
  );
}

function OutlinesCheck() {
  return (
    <mesh position={[0, 0.5, 0]}>
      <boxGeometry />
      <meshStandardMaterial color="#C8743E" />
      <Outlines thickness={0.04} color="#5EE0E8" />
    </mesh>
  );
}

function ContactShadowsCheck() {
  return (
    <group>
      <mesh position={[0, 0.9, 0]}>
        <torusKnotGeometry args={[0.4, 0.12, 96, 12]} />
        <meshStandardMaterial color="#C9A27A" />
      </mesh>
      <ContactShadows position={[0, 0.01, 0]} scale={5} opacity={0.7} blur={2} far={2} />
    </group>
  );
}

function StarsCheck() {
  return <Stars radius={40} depth={20} count={3000} factor={3} fade />;
}

// Quality tiers (0020) adjust to measured frame times; these two helpers are the candidates.
function PerformanceCheck() {
  return (
    <>
      <PerformanceMonitor ms={200} iterations={5} />
      <AdaptiveDpr pixelated />
      <Baseline />
    </>
  );
}

export const CHECKS: Check[] = [
  { id: "baseline", label: "Standard material + lights", usedFor: "everything", Scene: Baseline },
  {
    id: "tsl-ruin",
    label: "TSL node material (ruin uniform)",
    usedFor: "ruin ↔ restored",
    nodeOnly: true,
    Scene: TslRuin,
  },
  { id: "bloom", label: "RenderPipeline + bloom", usedFor: "glow, messages", nodeOnly: true, Scene: Bloom },
  { id: "instanced", label: "2,000 instanced orbs", usedFor: "messages, storms", Scene: InstancedMessages },
  { id: "gltf", label: "drei useGLTF (Ruins arch)", usedFor: "every room", Scene: Gltf },
  { id: "html", label: "drei Html", usedFor: "plates, labels", Scene: HtmlPlate },
  { id: "float", label: "drei Float", usedFor: "idle life", Scene: FloatCheck },
  { id: "animations", label: "drei useAnimations", usedFor: "keeper, Guardians", Scene: Animations },
  { id: "sparkles", label: "drei Sparkles", usedFor: "fireflies, dust", Scene: SparklesCheck },
  { id: "trail", label: "drei Trail", usedFor: "message trails", Scene: TrailCheck },
  { id: "outlines", label: "drei Outlines", usedFor: "gameplay-object outlines", Scene: OutlinesCheck },
  {
    id: "contact-shadows",
    label: "drei ContactShadows",
    usedFor: "soft grounding shadows",
    Scene: ContactShadowsCheck,
  },
  { id: "stars", label: "drei Stars", usedFor: "landing sky", Scene: StarsCheck },
  {
    id: "performance",
    label: "drei PerformanceMonitor + AdaptiveDpr",
    usedFor: "quality tiers",
    Scene: PerformanceCheck,
  },
];

useGLTF.preload(ARCH_URL);
